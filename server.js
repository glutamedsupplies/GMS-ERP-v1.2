const fs = require('fs');
const path = require('path');

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

const store = require('./lib/sqlite');
const { startServer, SERVER_CONFIG } = require('./lib/http-server');

let server = null;

console.log(`Starting GMS server on ${SERVER_CONFIG.bindHost}:${SERVER_CONFIG.port}`);

startServer()
    .then((info) => {
        server = info.server;
        console.log('Attendance server is running.');
        console.log(`Local URL: ${info.localUrl}`);
        console.log(`LAN URL:   ${info.lanUrl}`);
        if (Array.isArray(info.lanUrls) && info.lanUrls.length > 1) {
            console.log(`All LAN URLs: ${info.lanUrls.join(', ')}`);
        }
        if (info.publicUrl) {
            console.log(`Public URL: ${info.publicUrl}`);
        }
        if (info.hostnameUrl) {
            console.log(`Host URL: ${info.hostnameUrl}`);
        }
    })
    .catch((error) => {
        console.error('Failed to start Attendance server:', error);
        process.exitCode = 1;
    });

function shutdown(signal) {
    if (server) {
        server.close(() => {
            store.closeAll();
            process.exit(0);
        });
        return;
    }

    store.closeAll();
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

