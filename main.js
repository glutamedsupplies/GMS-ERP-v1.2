const path = require('path');

if (!process.versions?.electron) {
    console.log('Electron runtime not detected. Starting GMS in server mode.');
    require('./server');
} else {
    const { app, BrowserWindow, dialog, ipcMain } = require('electron');

    const defaultDataRoot = app.isPackaged
        ? path.join(app.getPath('userData'), 'data')
        : path.resolve(__dirname);

    process.env.ATTENDANCE_DATA_DIR = process.env.ATTENDANCE_DATA_DIR
        || defaultDataRoot;

    const store = require('./lib/sqlite');
    const salesStore = require('./lib/sales-store');
    const inventoryVariantStore = require('./lib/inventory-variants-store');
    const { startServer, SERVER_CONFIG } = require('./lib/http-server');

    let mainWindow = null;
    let httpServer = null;
    let serverInfo = null;

    function registerIpcHandlers() {
        ipcMain.handle('sales:references', () => salesStore.getReferenceData());
        ipcMain.handle('orders:preview', (_event, saleDate) => salesStore.previewNextOrderNumber(saleDate || ''));
        ipcMain.handle('orders:get', (_event, orderNumber) => salesStore.getSaleOrder(orderNumber || ''));
        ipcMain.handle('inventory-variants:list', (_event, filters) => inventoryVariantStore.listInventoryVariants(filters || {}));
        ipcMain.handle('inventory-variants:products', () => inventoryVariantStore.listInventoryProductNames());
        ipcMain.handle('inventory-variants:sets', (_event, productName) => inventoryVariantStore.listInventorySetsByProduct(productName || ''));
        ipcMain.handle('inventory-variants:resolve', (_event, payload) => inventoryVariantStore.resolveInventoryVariant(payload || {}));
    }

    function getServerUrls() {
        const lanHost = SERVER_CONFIG.lanHost || '127.0.0.1';

        return {
            localUrl: `http://127.0.0.1:${SERVER_CONFIG.port}/index.html`,
            lanUrl: `http://${lanHost}:${SERVER_CONFIG.port}/`
        };
    }

    async function connectToExistingServer() {
        const { localUrl, lanUrl } = getServerUrls();
        const expectedDataRoot = path.resolve(process.env.ATTENDANCE_DATA_DIR || '');
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
        console.error('Failed to start GMS ERP:', error);
        await dialog.showMessageBox({
            type: 'error',
            title: 'GMS ERP Error',
            message: 'GMS ERP failed to start.',
            detail: error.message || String(error)
        });
        app.quit();
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
}
