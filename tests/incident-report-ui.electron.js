const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const TEST_PORT = Number(process.env.INCIDENT_UI_TEST_PORT || 18128);
const DASHBOARD_SCREENSHOT = path.join(os.tmpdir(), 'gms-incident-employee-dashboard.png');
const MODAL_SCREENSHOT = path.join(os.tmpdir(), 'gms-incident-employee-modal.png');
const ADMIN_SCREENSHOT = path.join(os.tmpdir(), 'gms-incident-admin-review.png');
const ADMIN_MOBILE_SCREENSHOT = path.join(os.tmpdir(), 'gms-incident-admin-review-mobile.png');
const MOBILE_SCREENSHOT = path.join(os.tmpdir(), 'gms-incident-employee-modal-mobile.png');

app.disableHardwareAcceleration();

async function waitFor(window, expression, timeoutMs = 10000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const result = await window.webContents.executeJavaScript(`Boolean(${expression})`);
        if (result) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 80));
    }
    throw new Error(`Timed out waiting for: ${expression}`);
}

async function loadPage(window, url) {
    try {
        await window.loadURL(url);
    } catch (error) {
        const currentUrl = window.webContents.getURL();
        if (error?.code !== 'ERR_ABORTED' || !currentUrl.startsWith(url)) {
            throw error;
        }
    }
}

async function login(window, username) {
    await loadPage(window, `http://127.0.0.1:${TEST_PORT}/login.html`);
    const result = await window.webContents.executeJavaScript(`
        window.appClient.invalidateAllRequestCaches();
        sessionStorage.clear();
        window.appClient.login({
            companyCode: 'incident-ui-company',
            username: ${JSON.stringify(username)},
            password: 'Password123!'
        }).then((user) => ({
            ok: Boolean(user?.id),
            role: user?.role || ''
        }))
    `);
    assert.strictEqual(result.ok, true, `login failed for ${username}`);
}

async function clearSession(window) {
    await window.webContents.executeJavaScript('window.appClient.clearSession()');
}

async function saveScreenshot(window, targetPath) {
    await window.webContents.executeJavaScript(`
        new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        })
    `);
    const image = await window.webContents.capturePage();
    fs.writeFileSync(targetPath, image.toPNG());
}

async function verifyAdminPanel(window) {
    await login(window, 'incident_ui_admin');
    const dashboardHtml = fs.readFileSync(
        path.join(__dirname, '..', 'head_admin', 'dashboard.html'),
        'utf8'
    );
    const kpiIndex = dashboardHtml.indexOf('data-panel="kpi_evaluation"');
    const incidentIndex = dashboardHtml.indexOf('data-panel="incident_report"');
    const dailyReportIndex = dashboardHtml.indexOf('data-panel="daily_compiled_report"');
    assert(kpiIndex >= 0 && incidentIndex > kpiIndex && dailyReportIndex > incidentIndex);
    assert(fs.existsSync(path.join(__dirname, '..', 'head_admin', 'incident_report.html')));

    await loadPage(window, `http://127.0.0.1:${TEST_PORT}/head_admin/dashboard.html`);
    await waitFor(window, "!document.body.classList.contains('dashboard-loading')");
    const dashboardResult = await window.webContents.executeJavaScript(`({
        hasAdminPanel: Boolean(document.querySelector('[data-panel="incident_report"]')),
        panelDisabled: document.querySelector('[data-panel="incident_report"]')?.dataset.disabled || ''
    })`);
    assert.strictEqual(dashboardResult.hasAdminPanel, true);
    assert.notStrictEqual(dashboardResult.panelDisabled, 'true');

    await loadPage(window, `http://127.0.0.1:${TEST_PORT}/head_admin/incident_report.html`);
    await waitFor(
        window,
        "document.getElementById('pageStatus').textContent.includes('0 incident')"
    );
    const adminPage = await window.webContents.executeJavaScript(`({
        title: document.querySelector('h1')?.textContent.trim() || '',
        hasForm: Boolean(document.getElementById('incidentForm')),
        hasNewButton: Boolean(document.getElementById('newIncidentBtn'))
    })`);
    assert.strictEqual(adminPage.title, 'Incident Report');
    assert.strictEqual(adminPage.hasForm, false);
    assert.strictEqual(adminPage.hasNewButton, false);
}

async function verifyEmployeeDashboard(window, username) {
    await clearSession(window);
    await login(window, username);
    await loadPage(window, `http://127.0.0.1:${TEST_PORT}/employee/employee.html`);
    await waitFor(
        window,
        "document.getElementById('incidentReportBtn')?.dataset.boundClick === 'true'"
    );

    const result = await window.webContents.executeJavaScript(`(() => {
        const timeOutCard = document.getElementById('timeInOutBtn');
        const incidentCard = document.getElementById('incidentReportBtn');
        return {
            title: incidentCard?.querySelector('.action-title')?.textContent.trim() || '',
            copy: incidentCard?.querySelector('.action-copy')?.textContent.trim() || '',
            coreToolCount: document.getElementById('coreToolCount')?.textContent.trim() || '',
            isImmediatelyAfterTimeOut: timeOutCard?.nextElementSibling === incidentCard,
            hasEmployeeList: Boolean(document.getElementById('incidentTableBody'))
        };
    })()`);
    assert.strictEqual(result.title, 'Incident Report');
    assert(result.copy.includes('Submit a workplace incident'));
    assert.strictEqual(result.coreToolCount, '5');
    assert.strictEqual(result.isImmediatelyAfterTimeOut, true);
    assert.strictEqual(result.hasEmployeeList, false);
}

async function verifyEmployeeSubmission(window) {
    await saveScreenshot(window, DASHBOARD_SCREENSHOT);
    await window.webContents.executeJavaScript("document.getElementById('incidentReportBtn').click()");
    await waitFor(window, "!document.getElementById('incidentSubmissionModal').hidden");

    const formResult = await window.webContents.executeJavaScript(`(() => {
        const overlay = document.getElementById('incidentSubmissionModal');
        const card = overlay?.querySelector('.incident-modal-card');
        const aiLauncher = document.querySelector('.gms-ai-launcher');
        const overlayStyle = overlay ? getComputedStyle(overlay) : null;
        const cardStyle = card ? getComputedStyle(card) : null;
        const cardRect = card?.getBoundingClientRect();
        const topElement = cardRect
            ? document.elementFromPoint(
                cardRect.left + (cardRect.width / 2),
                cardRect.top + Math.min(cardRect.height / 2, 120)
            )
            : null;
        return {
            path: location.pathname,
            preparedBy: document.getElementById('incidentSubmissionPreparedBy')?.value || '',
            hasAssignedEmployee: Boolean(document.getElementById('assignedEmployee')),
            hasResolvedControl: Boolean(document.getElementById('resolved')),
            hasDataList: Boolean(document.getElementById('incidentTableBody')),
            labels: Array.from(document.querySelectorAll('#incidentSubmissionForm .incident-field > span'))
                .map((node) => node.textContent.trim()),
            layer: {
                display: overlayStyle?.display || '',
                position: overlayStyle?.position || '',
                zIndex: overlayStyle?.zIndex || '',
                backgroundColor: overlayStyle?.backgroundColor || '',
                overlayWidth: overlay?.getBoundingClientRect().width || 0,
                overlayHeight: overlay?.getBoundingClientRect().height || 0,
                cardTop: cardRect?.top || 0,
                cardLeft: cardRect?.left || 0,
                cardWidth: cardRect?.width || 0,
                cardHeight: cardRect?.height || 0,
                cardDisplay: cardStyle?.display || '',
                cardPosition: cardStyle?.position || '',
                cardVisibility: cardStyle?.visibility || '',
                cardOpacity: cardStyle?.opacity || '',
                cardBackgroundColor: cardStyle?.backgroundColor || '',
                cardZIndex: cardStyle?.zIndex || '',
                aiLauncherHidden: !aiLauncher || getComputedStyle(aiLauncher).display === 'none',
                topElementIsModal: Boolean(topElement?.closest('#incidentSubmissionModal')),
                incidentStylesheetLoaded: Array.from(document.styleSheets)
                    .some((sheet) => String(sheet.href || '').includes('incident-report.css'))
            }
        };
    })()`);
    assert.strictEqual(formResult.path, '/employee/employee.html');
    assert.strictEqual(formResult.preparedBy, 'Incident UI Employee');
    assert.strictEqual(formResult.hasAssignedEmployee, false);
    assert.strictEqual(formResult.hasResolvedControl, false);
    assert.strictEqual(formResult.hasDataList, false);
    assert.deepStrictEqual(formResult.labels, [
        'Date *',
        'Department *',
        'Reason / Incident *',
        'How to Solve / Action Taken',
        'Prepared By *'
    ]);
    assert.strictEqual(
        formResult.layer.position,
        'fixed',
        `incident modal layer is not fixed: ${JSON.stringify(formResult.layer)}`
    );
    assert.strictEqual(
        formResult.layer.topElementIsModal,
        true,
        `incident modal is not the top layer: ${JSON.stringify(formResult.layer)}`
    );
    assert.strictEqual(
        formResult.layer.aiLauncherHidden,
        true,
        `AI launcher overlaps the incident modal: ${JSON.stringify(formResult.layer)}`
    );
    await new Promise((resolve) => setTimeout(resolve, 180));
    const remainsOpen = await window.webContents.executeJavaScript(`(() => {
        const modal = document.getElementById('incidentSubmissionModal');
        const launcher = document.querySelector('.gms-ai-launcher');
        return Boolean(
            modal
            && !modal.hidden
            && document.body.classList.contains('is-modal-open')
            && (!launcher || getComputedStyle(launcher).display === 'none')
        );
    })()`);
    assert.strictEqual(remainsOpen, true, 'incident modal closed during dashboard initialization');
    await saveScreenshot(window, MODAL_SCREENSHOT);

    await window.webContents.executeJavaScript(`(() => {
        document.getElementById('incidentSubmissionDate').value = '2026-07-28';
        document.getElementById('incidentSubmissionDepartment').value = 'Warehouse';
        document.getElementById('incidentSubmissionReason').value = 'Damaged outer carton found during receiving.';
        document.getElementById('incidentSubmissionAction').value = 'Repacked and isolated the damaged carton.';
        document.getElementById('incidentSubmissionForm').requestSubmit();
    })()`);
    await waitFor(
        window,
        "document.getElementById('incidentSubmissionModal').hidden && document.body.textContent.includes('submitted for Admin review')"
    );

    const employeeListStatus = await window.webContents.executeJavaScript(
        "fetch('/api/incident-reports', { credentials: 'same-origin' }).then((response) => response.status)"
    );
    assert.strictEqual(employeeListStatus, 403);
    assert(!fs.existsSync(path.join(__dirname, '..', 'employee', 'incident_report.html')));
}

async function verifyAdminReview(window) {
    await clearSession(window);
    await login(window, 'incident_ui_admin');
    await loadPage(window, `http://127.0.0.1:${TEST_PORT}/head_admin/incident_report.html`);
    await waitFor(window, "document.querySelector('#incidentTableBody tr[data-report-id]')");

    const unresolvedResult = await window.webContents.executeJavaScript(`(() => {
        const row = document.querySelector('#incidentTableBody tr[data-report-id]');
        return {
            reportId: row?.dataset.reportId || '',
            rowIsRed: row?.classList.contains('is-unresolved') || false,
            text: row?.textContent || '',
            hasResolveButton: Boolean(row?.querySelector('[data-action="toggle-status"]')),
            hasForm: Boolean(document.getElementById('incidentForm'))
        };
    })()`);
    assert(unresolvedResult.reportId);
    assert.strictEqual(unresolvedResult.rowIsRed, true);
    assert(unresolvedResult.text.includes('Incident UI Employee'));
    assert(unresolvedResult.text.includes('Repacked and isolated'));
    assert.strictEqual(unresolvedResult.hasResolveButton, true);
    assert.strictEqual(unresolvedResult.hasForm, false);
    await saveScreenshot(window, ADMIN_SCREENSHOT);

    window.setSize(390, 844);
    await window.webContents.executeJavaScript(
        "document.querySelector('.incident-table-wrap').scrollIntoView({ block: 'center' })"
    );
    await new Promise((resolve) => setTimeout(resolve, 180));
    const mobileLayout = await window.webContents.executeJavaScript(`({
        viewportWidth: window.innerWidth,
        bodyWidth: document.body.scrollWidth,
        wrapperWidth: document.querySelector('.incident-table-wrap').clientWidth,
        tableWidth: document.querySelector('.incident-table').getBoundingClientRect().width
    })`);
    assert(mobileLayout.viewportWidth <= 500);
    assert(mobileLayout.bodyWidth <= mobileLayout.viewportWidth + 1);
    assert(mobileLayout.tableWidth >= 1280);
    assert(mobileLayout.wrapperWidth < mobileLayout.tableWidth);
    await saveScreenshot(window, ADMIN_MOBILE_SCREENSHOT);
    window.setSize(1440, 900);
    await new Promise((resolve) => setTimeout(resolve, 120));

    await window.webContents.executeJavaScript(
        "document.querySelector('[data-action=\"toggle-status\"]').click()"
    );
    await waitFor(
        window,
        "!document.querySelector('#incidentTableBody tr[data-report-id]').classList.contains('is-unresolved')"
    );
    const resolvedResult = await window.webContents.executeJavaScript(`(() => {
        const row = document.querySelector('#incidentTableBody tr[data-report-id]');
        return {
            text: row?.textContent || '',
            resolvedCount: document.getElementById('resolvedCount')?.textContent.trim() || ''
        };
    })()`);
    assert(resolvedResult.text.includes('Resolved'));
    assert(resolvedResult.text.includes('Incident UI Admin'));
    assert.strictEqual(resolvedResult.resolvedCount, '1');
    return unresolvedResult.reportId;
}

async function verifySecondEmployeeModal(window, reportId) {
    await verifyEmployeeDashboard(window, 'incident_ui_employee_two');
    const forbiddenReadStatus = await window.webContents.executeJavaScript(
        "fetch('/api/incident-reports', { credentials: 'same-origin' }).then((response) => response.status)"
    );
    assert.strictEqual(forbiddenReadStatus, 403);

    const forbiddenUpdateStatus = await window.webContents.executeJavaScript(`fetch(
        '/api/incident-reports/${encodeURIComponent(reportId)}',
        {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resolved: false })
        }
    ).then((response) => response.status)`);
    assert.strictEqual(forbiddenUpdateStatus, 403);

    window.setSize(390, 844);
    await window.webContents.executeJavaScript("document.getElementById('incidentReportBtn').click()");
    await waitFor(window, "!document.getElementById('incidentSubmissionModal').hidden");
    await new Promise((resolve) => setTimeout(resolve, 180));
    const mobileResult = await window.webContents.executeJavaScript(`(() => {
        const modal = document.querySelector('#incidentSubmissionModal .incident-modal-card');
        const rect = modal.getBoundingClientRect();
        return {
            viewportWidth: window.innerWidth,
            bodyWidth: document.body.scrollWidth,
            modalVisible: rect.width > 0 && rect.height > 0,
            aiLauncherHidden: !document.querySelector('.gms-ai-launcher')
                || getComputedStyle(document.querySelector('.gms-ai-launcher')).display === 'none',
            title: document.getElementById('incidentSubmissionTitle')?.textContent.trim() || '',
            preparedBy: document.getElementById('incidentSubmissionPreparedBy')?.value || ''
        };
    })()`);
    assert(mobileResult.viewportWidth <= 500);
    assert(mobileResult.bodyWidth <= mobileResult.viewportWidth + 1);
    assert.strictEqual(mobileResult.modalVisible, true);
    assert.strictEqual(mobileResult.aiLauncherHidden, true);
    assert.strictEqual(mobileResult.title, 'Add Incident Report');
    assert.strictEqual(mobileResult.preparedBy, 'Second Active Employee');
    await saveScreenshot(window, MOBILE_SCREENSHOT);
}

app.whenReady().then(async () => {
    let window = null;
    try {
        window = new BrowserWindow({
            show: false,
            width: 1440,
            height: 900,
            webPreferences: {
                backgroundThrottling: false,
                contextIsolation: true,
                sandbox: true
            }
        });
        await window.webContents.session.clearStorageData();
        await window.webContents.session.clearCache();
        window.webContents.on('console-message', (_event, level, message) => {
            if (level >= 2) {
                console.error(`renderer: ${message}`);
            }
        });

        await verifyAdminPanel(window);
        await verifyEmployeeDashboard(window, 'incident_ui_employee');
        await verifyEmployeeSubmission(window);
        const reportId = await verifyAdminReview(window);
        await verifySecondEmployeeModal(window, reportId);

        console.log(
            `incident-report-ui ok\ndashboard=${DASHBOARD_SCREENSHOT}\nmodal=${MODAL_SCREENSHOT}\nadmin=${ADMIN_SCREENSHOT}\nadminMobile=${ADMIN_MOBILE_SCREENSHOT}\nmobile=${MOBILE_SCREENSHOT}`
        );
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    } finally {
        window?.destroy();
        app.exit(process.exitCode || 0);
    }
});
