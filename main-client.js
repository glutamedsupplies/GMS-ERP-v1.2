const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { normalizeRemoteUrlList, readProjectRuntimeConfig } = require('./lib/runtime-config');

const PROJECT_RUNTIME_CONFIG = readProjectRuntimeConfig();
const DEFAULT_REMOTE_URLS = normalizeRemoteUrlList([
    PROJECT_RUNTIME_CONFIG.publicUrl,
    PROJECT_RUNTIME_CONFIG.remoteUrls,
    `http://127.0.0.1:${PROJECT_RUNTIME_CONFIG.server.port}/`,
    `http://localhost:${PROJECT_RUNTIME_CONFIG.server.port}/`,
    `http://${os.hostname()}:${PROJECT_RUNTIME_CONFIG.server.port}/`
]);

let mainWindow = null;

function getConfigPaths() {
    return {
        bundled: path.join(__dirname, 'client-config.json'),
        user: path.join(app.getPath('userData'), 'client-config.json')
    };
}

function normalizeRemoteUrls(parsedConfig) {
    return normalizeRemoteUrlList([
        parsedConfig.publicUrl,
        parsedConfig.remoteUrls,
        parsedConfig.remoteUrl,
        PROJECT_RUNTIME_CONFIG.publicUrl,
        PROJECT_RUNTIME_CONFIG.remoteUrls,
        DEFAULT_REMOTE_URLS
    ]);
}

function readRemoteUrls() {
    const paths = getConfigPaths();

    if (!fs.existsSync(paths.user)) {
        try {
            const bundledConfig = fs.existsSync(paths.bundled)
                ? fs.readFileSync(paths.bundled, 'utf8')
                : JSON.stringify({
                    publicUrl: PROJECT_RUNTIME_CONFIG.publicUrl,
                    remoteUrls: PROJECT_RUNTIME_CONFIG.remoteUrls
                }, null, 2);
            fs.writeFileSync(paths.user, bundledConfig, 'utf8');
        } catch (_error) {
            return DEFAULT_REMOTE_URLS;
        }
    }

    try {
        const rawConfig = fs.readFileSync(paths.user, 'utf8');
        const parsed = JSON.parse(rawConfig);
        return normalizeRemoteUrls(parsed);
    } catch (_error) {
        return DEFAULT_REMOTE_URLS;
    }
}

async function findReachableRemoteUrl() {
    const urls = readRemoteUrls();

    for (const candidate of urls) {
        try {
            const baseUrl = new URL(candidate);
            const response = await fetch(new URL('/api/server-info', baseUrl), {
                cache: 'no-store',
                signal: AbortSignal.timeout(2500)
            });

            if (response.ok) {
                return candidate;
            }
        } catch (_error) {
            // Try the next configured URL.
        }
    }

    throw new Error('Unable to reach the attendance server. Update client-config.json with the correct public HTTPS URL or reachable server URL.');
}

async function createWindow() {
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

    await mainWindow.loadURL(await findReachableRemoteUrl());
}

app.whenReady().then(createWindow).catch(async (error) => {
    console.error('Failed to start the attendance client:', error);
    await dialog.showMessageBox({
        type: 'error',
        title: 'Attendance Client Error',
        message: 'The attendance client failed to start.',
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
