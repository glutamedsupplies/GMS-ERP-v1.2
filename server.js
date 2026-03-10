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

