const assert = require('assert');
const path = require('path');
const { app, BrowserWindow } = require('electron');

async function waitForRecordRow(window, timeoutMs = 8000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const ready = await window.webContents.executeJavaScript(
            "Boolean(document.querySelector('#recordsBody .kpi-record-group[data-admin-evaluation-group]'))"
        );
        if (ready) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Timed out waiting for the KPI record row.');
}

app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
    const window = new BrowserWindow({
        show: false,
        webPreferences: {
            contextIsolation: false,
            sandbox: false
        }
    });
    try {
        await window.loadFile(path.join(__dirname, 'kpi-context-menu-fixture.html'));
        await waitForRecordRow(window);
        const result = await window.webContents.executeJavaScript(`(() => {
            const row = document.querySelector('#recordsBody .kpi-record-group[data-admin-evaluation-group]');
            const event = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 120,
                clientY: 80,
                button: 2
            });
            row.dispatchEvent(event);
            const menu = document.getElementById('adminEvaluationContextMenu');
            const action = document.getElementById('adminEvaluationContextAction');
            return {
                defaultPrevented: event.defaultPrevented,
                menuHidden: menu.hidden,
                actionText: action.textContent.trim()
            };
        })()`);
        assert.strictEqual(result.defaultPrevented, true, 'native browser context menu must be prevented');
        assert.strictEqual(result.menuHidden, false, 'custom KPI context menu must be visible');
        assert.strictEqual(result.actionText, 'Evaluation');
        console.log('KPI context menu browser test passed.');
    } finally {
        window.destroy();
        app.exit(0);
    }
}).catch((error) => {
    console.error(error);
    app.exit(1);
});
