const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { readProjectRuntimeConfig } = require('./lib/runtime-config');

function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        return;
    }
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            return;
        }
        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) {
            return;
        }
        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();
        if (!key) {
            return;
        }
        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined || process.env[key] === '') {
            process.env[key] = value;
        }
    });
}

loadEnvFile();
const PROJECT_RUNTIME_CONFIG = readProjectRuntimeConfig();

function loadElectronDesktopApi() {
    try {
        const candidate = require('electron');
        if (
            candidate
            && typeof candidate === 'object'
            && candidate.app
            && candidate.BrowserWindow
        ) {
            return candidate;
        }
    } catch (_error) {
        // Fall through to the browser fallback mode.
    }

    return null;
}

function openExternalUrl(url) {
    if (!url) {
        return;
    }

    if (process.platform === 'win32') {
        spawn('cmd', ['/c', 'start', '', url], {
            detached: true,
            stdio: 'ignore'
        }).unref();
        return;
    }

    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(opener, [url], {
        detached: true,
        stdio: 'ignore'
    }).unref();
}

function reportStartupError(error) {
    const message = error?.message || String(error);
    console.error('Failed to start GMS ERP:', error);
    const electronDesktopApi = process.versions?.electron ? loadElectronDesktopApi() : null;
    if (electronDesktopApi?.dialog?.showErrorBox) {
        try {
            electronDesktopApi.dialog.showErrorBox(
                'GMS ERP Error',
                `GMS ERP failed to start.\n\n${message}`
            );
        } catch (_dialogError) {
            // Fall through to exit below.
        }
    }
}

if (!process.versions?.electron) {
    console.log('Electron runtime not detected. Starting GMS in server mode.');
    try {
        require('./server');
    } catch (error) {
        reportStartupError(error);
        process.exit(0);
    }
} else {
    const electronDesktopApi = loadElectronDesktopApi();
    if (!electronDesktopApi) {
        console.warn('Electron desktop APIs are unavailable. Falling back to browser mode.');
        const fallbackPort = Number(PROJECT_RUNTIME_CONFIG?.server?.port) || 3000;
        openExternalUrl(`http://127.0.0.1:${fallbackPort}/login.html`);
    } else {
        try {
            const { app, BrowserWindow, dialog, ipcMain } = electronDesktopApi;

            const defaultDataRoot = app.isPackaged
                ? path.join(app.getPath('userData'), 'data')
                : path.resolve(__dirname);

            process.env.ATTENDANCE_DATA_DIR = process.env.ATTENDANCE_DATA_DIR
                || defaultDataRoot;

            const store = require('./lib/sqlite');
            const salesStore = require('./lib/sales-store');
            const inventoryVariantStore = require('./lib/inventory-variants-store');
            const { getServerBuildToken } = require('./lib/build-info');
            const { startServer, SERVER_CONFIG } = require('./lib/http-server');

            let mainWindow = null;
            let httpServer = null;
            let serverInfo = null;

            function registerIpcHandlers() {
                ipcMain.handle('sales:references', () => salesStore.getReferenceData());
                ipcMain.handle('orders:preview', (_event, saleDate) => salesStore.previewNextOrderNumber(saleDate || ''));
                ipcMain.handle('orders:get', (_event, orderNumber) => {
                    const requestedOrderLookup = orderNumber || '';
                    console.debug('[orders:debug] IPC order load request', { requestedOrderLookup });
                    const order = salesStore.getSaleOrder(requestedOrderLookup);
                    console.debug('[orders:debug] IPC order load response', {
                        requestedOrderLookup,
                        loadedOrderNumber: order?.orderNumber || '',
                        loadedReceiptNumber: order?.receiptNumber || '',
                        clientName: order?.clientName || '',
                        itemCount: Array.isArray(order?.items) ? order.items.length : 0
                    });
                    return order;
                });
                ipcMain.handle('orders:check-pending-client', (_event, filters) => salesStore.checkPendingPaymentsByClient(filters || {}));
                ipcMain.handle('inventory-variants:list', (_event, filters) => inventoryVariantStore.listInventoryVariants(filters || {}));
                ipcMain.handle('inventory-variants:products', () => inventoryVariantStore.listInventoryProductNames());
                ipcMain.handle('inventory-variants:sets', (_event, productName) => inventoryVariantStore.listInventorySetsByProduct(productName || ''));
                ipcMain.handle('inventory-variants:resolve', (_event, payload) => inventoryVariantStore.resolveInventoryVariant(payload || {}));
            }

            function getServerUrls() {
                const lanHost = SERVER_CONFIG.lanHost || '127.0.0.1';

                return {
                    localUrl: `http://127.0.0.1:${SERVER_CONFIG.port}/login.html`,
                    lanUrl: `http://${lanHost}:${SERVER_CONFIG.port}/`
                };
            }

        async function connectToExistingServer() {
            const { localUrl, lanUrl } = getServerUrls();
            const expectedDataRoot = path.resolve(process.env.ATTENDANCE_DATA_DIR || '');
            const expectedBuildToken = getServerBuildToken();
            const response = await fetch(`http://127.0.0.1:${SERVER_CONFIG.port}/api/server-info`, {
                cache: 'no-store',
                signal: AbortSignal.timeout(3000)
            });

            if (!response.ok) {
                throw new Error(`Port ${SERVER_CONFIG.port} is already in use by another application.`);
            }

            const payload = await response.json();
            if (!payload || payload.success !== true) {
                throw new Error(`Port ${SERVER_CONFIG.port} is already in use by another application.`);
            }

            const existingDataRoot = path.resolve(String(payload.data?.dataRoot || ''));
            if (expectedDataRoot && existingDataRoot && expectedDataRoot !== existingDataRoot) {
                throw new Error(
                    `Attendance server on port ${SERVER_CONFIG.port} is using a different data folder.\n`
                    + `Current app data: ${expectedDataRoot}\n`
                    + `Existing server data: ${existingDataRoot}\n`
                    + 'Close the old server/app first so this app reads the correct attendance database.'
                );
            }

            const existingBuildToken = String(payload.data?.buildToken || '').trim();
            if (!existingBuildToken || existingBuildToken !== expectedBuildToken) {
                throw new Error(
                    `Attendance server on port ${SERVER_CONFIG.port} is running an older app build.\n`
                    + 'Close the old GMS server/app first, then reopen this app so the latest API routes are loaded.'
                );
            }

            return {
                server: null,
                localUrl,
                lanUrl: payload.data?.lanUrl || lanUrl,
                config: SERVER_CONFIG
            };
        }

        async function ensureServer() {
            if (serverInfo) {
                return serverInfo;
            }

            try {
                serverInfo = await startServer();
                httpServer = serverInfo.server;
                console.log(`Attendance server ready at ${serverInfo.lanUrl}`);
                return serverInfo;
            } catch (error) {
                if (error && error.code === 'EADDRINUSE') {
                    serverInfo = await connectToExistingServer();
                    console.log(`Using existing attendance server at ${serverInfo.lanUrl}`);
                    return serverInfo;
                }

                throw error;
            }
        }

        async function createWindow() {
            const currentServer = await ensureServer();

            mainWindow = new BrowserWindow({
                width: 1280,
                height: 860,
                minWidth: 1100,
                minHeight: 700,
                autoHideMenuBar: true,
                webPreferences: {
                    preload: path.join(__dirname, 'preload.js'),
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: false
                }
            });

            mainWindow.on('closed', () => {
                mainWindow = null;
            });

            await mainWindow.loadURL(currentServer.localUrl);
        }

            registerIpcHandlers();

            app.whenReady().then(createWindow).catch(async (error) => {
                reportStartupError(error);
                await dialog.showMessageBox({
                    type: 'error',
                    title: 'GMS ERP Error',
                    message: 'GMS ERP failed to start.',
                    detail: error.message || String(error)
                });
                process.exit(0);
            });

            app.on('activate', async () => {
                if (BrowserWindow.getAllWindows().length === 0) {
                    await createWindow();
                }
            });

            app.on('window-all-closed', () => {
                if (process.platform !== 'darwin') {
                    app.quit();
                }
            });

            app.on('before-quit', () => {
                if (httpServer) {
                    httpServer.close();
                    httpServer = null;
                }

                store.closeAll();
            });
        } catch (error) {
            reportStartupError(error);
            process.exit(0);
        }
    }
}
