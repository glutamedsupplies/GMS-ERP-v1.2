const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const SERVER_BUILD_FILES = [
    'package.json',
    'lib/http-server.js',
    'lib/multi-tenant-store.js'
];

function readFileStatSignature(relativePath) {
    const absolutePath = path.join(ROOT_DIR, relativePath);
    try {
        const stats = fs.statSync(absolutePath);
        return `${relativePath}:${stats.size}:${Math.trunc(stats.mtimeMs)}`;
    } catch (_error) {
        return `${relativePath}:missing`;
    }
}

function getServerBuildToken() {
    const signature = SERVER_BUILD_FILES.map(readFileStatSignature).join('|');
    return crypto.createHash('sha1').update(signature).digest('hex');
}

module.exports = {
    getServerBuildToken
};
