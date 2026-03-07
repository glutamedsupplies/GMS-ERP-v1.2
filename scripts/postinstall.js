const { spawnSync } = require('child_process');

function normalizeFlag(value = '') {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

const isRender = normalizeFlag(process.env.RENDER) || Boolean(String(process.env.RENDER_EXTERNAL_HOSTNAME || '').trim());
const skipElectronRebuild = isRender
    || normalizeFlag(process.env.SKIP_ELECTRON_REBUILD)
    || String(process.env.ATTENDANCE_DEPLOY_TARGET || '').trim().toLowerCase() === 'server';

if (skipElectronRebuild) {
    console.log('Skipping electron rebuild for server deployment.');
    process.exit(0);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['run', 'rebuild:native'], {
    stdio: 'inherit',
    env: process.env
});

if (typeof result.status === 'number') {
    process.exit(result.status);
}

if (result.error) {
    console.error('Failed to run electron rebuild:', result.error);
}

process.exit(1);
