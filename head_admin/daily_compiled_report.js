const appClient = window.appClient;

const reportTitleInput = document.getElementById('reportTitleInput');
const reportDateInput = document.getElementById('reportDateInput');
const preparedByInput = document.getElementById('preparedByInput');
const staffSectionTitleInput = document.getElementById('staffSectionTitleInput');
const tableSectionTitleInput = document.getElementById('tableSectionTitleInput');
const tableColumnTwoInput = document.getElementById('tableColumnTwoInput');
const tableColumnThreeInput = document.getElementById('tableColumnThreeInput');
const remarksSectionTitleInput = document.getElementById('remarksSectionTitleInput');
const addStaffBtn = document.getElementById('addStaffBtn');
const addTableRowBtn = document.getElementById('addTableRowBtn');
const loadTodayClientsBtn = document.getElementById('loadTodayClientsBtn');
const addRemarkBtn = document.getElementById('addRemarkBtn');
const resetTemplateBtn = document.getElementById('resetTemplateBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const autoPopulateBtn = document.getElementById('autoPopulateBtn');
const copyImageBtn = document.getElementById('copyImageBtn');
const downloadImageBtn = document.getElementById('downloadImageBtn');
const staffEditorList = document.getElementById('staffEditorList');
const tableRowEditorList = document.getElementById('tableRowEditorList');
const remarkEditorList = document.getElementById('remarkEditorList');
const previewStatus = document.getElementById('previewStatus');

const previewTitle = document.getElementById('previewTitle');
const previewMeta = document.getElementById('previewMeta');
const previewStaffSectionTitle = document.getElementById('previewStaffSectionTitle');
const previewStaffTableBody = document.getElementById('previewStaffTableBody');
const previewSecondSection = document.getElementById('previewSecondSection');
const previewSecondSectionTitle = document.getElementById('previewSecondSectionTitle');
const previewTableColumnTwo = document.getElementById('previewTableColumnTwo');
const previewTableColumnThree = document.getElementById('previewTableColumnThree');
const previewSummaryTableBody = document.getElementById('previewSummaryTableBody');
const previewRemarksSection = document.getElementById('previewRemarksSection');
const previewRemarksSectionTitle = document.getElementById('previewRemarksSectionTitle');
const previewRemarksList = document.getElementById('previewRemarksList');
const reportCanvas = document.getElementById('reportCanvas');

const state = {
    session: null,
    storageKey: 'gms-daily-compiled-report-v1:default',
    report: null,
    bootstrap: null
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    state.session = appClient.getSession();

    try {
        const bootstrap = await appClient.getBootstrap();
        state.bootstrap = bootstrap || {};
        appClient.applyBootstrapBrandTheme(bootstrap);
    } catch (error) {
        state.bootstrap = {};
        console.error('Failed to load branding for daily compiled report:', error);
    }

    const serverDateKey = await resolveServerDateKey();
    const preparedBy = String(state.session?.userName || '').trim() || 'Head Admin';
    state.storageKey = buildStorageKey(state.session);
    state.report = loadReportState(serverDateKey, preparedBy);

    bindEvents();
    renderEditor();
    renderPreview();
    setStatus('Template ready. Fill in the fields on the left, then copy the report as an image.', false);
}

function bindEvents() {
    const detailBindings = [
        [reportTitleInput, 'title'],
        [reportDateInput, 'dateKey'],
        [preparedByInput, 'preparedBy'],
        [staffSectionTitleInput, 'staffSectionTitle'],
        [tableSectionTitleInput, 'tableSectionTitle'],
        [tableColumnTwoInput, 'tableColumnTwo'],
        [tableColumnThreeInput, 'tableColumnThree'],
        [remarksSectionTitleInput, 'remarksSectionTitle']
    ];

    detailBindings.forEach(([element, field]) => {
        element?.addEventListener('input', () => {
            state.report[field] = element.value;
            persistAndRefresh();
        });
    });

    addStaffBtn?.addEventListener('click', () => {
        state.report.staff.push(createStaffEntry());
        persistAndRefresh();
    });

    addTableRowBtn?.addEventListener('click', () => {
        state.report.tableRows.push(createTableRowEntry());
        persistAndRefresh();
    });

    loadTodayClientsBtn?.addEventListener('click', handleLoadTodayClients);

    addRemarkBtn?.addEventListener('click', () => {
        state.report.remarks.push(createRemarkEntry());
        persistAndRefresh();
    });

    autoPopulateBtn?.addEventListener('click', handleAutoPopulateReport);

    resetTemplateBtn?.addEventListener('click', () => {
        if (!window.confirm('Reset the template to its default layout?')) {
            return;
        }
        state.report = createDefaultReportState(resolveDateInputValue(), resolvePreparedByValue());
        persistAndRefresh();
        setStatus('Template reset to default.', false);
    });

    clearAllBtn?.addEventListener('click', () => {
        if (!window.confirm('Clear all typed content from this report?')) {
            return;
        }
        state.report = createEmptyReportState(resolveDateInputValue(), resolvePreparedByValue());
        persistAndRefresh();
        setStatus('All report content cleared.', false);
    });

    staffEditorList?.addEventListener('input', handleStaffEditorInput);
    staffEditorList?.addEventListener('click', handleStaffEditorClick);
    tableRowEditorList?.addEventListener('input', handleTableEditorInput);
    tableRowEditorList?.addEventListener('click', handleTableEditorClick);
    remarkEditorList?.addEventListener('input', handleRemarkEditorInput);
    remarkEditorList?.addEventListener('click', handleRemarkEditorClick);

    copyImageBtn?.addEventListener('click', handleCopyImage);
    downloadImageBtn?.addEventListener('click', handleDownloadImage);
}

function handleStaffEditorInput(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
        return;
    }

    const itemId = String(input.dataset.itemId || '');
    const field = String(input.dataset.field || '');
    const target = state.report.staff.find((entry) => entry.id === itemId);
    if (!target || !field) {
        return;
    }

    target[field] = input.value;
    persistAndRefresh({ renderEditors: false });
}

function handleStaffEditorClick(event) {
    const button = event.target.closest('button[data-action="remove-staff"]');
    if (!button) {
        return;
    }

    const itemId = String(button.dataset.itemId || '');
    state.report.staff = state.report.staff.filter((entry) => entry.id !== itemId);
    ensureMinimumRows();
    persistAndRefresh();
}

function handleTableEditorInput(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
        return;
    }

    const itemId = String(input.dataset.itemId || '');
    const field = String(input.dataset.field || '');
    const target = state.report.tableRows.find((entry) => entry.id === itemId);
    if (!target || !field) {
        return;
    }

    target[field] = input.value;
    persistAndRefresh({ renderEditors: false });
}

function handleTableEditorClick(event) {
    const button = event.target.closest('button[data-action="remove-table-row"]');
    if (!button) {
        return;
    }

    const itemId = String(button.dataset.itemId || '');
    state.report.tableRows = state.report.tableRows.filter((entry) => entry.id !== itemId);
    ensureMinimumRows();
    persistAndRefresh();
}

function handleRemarkEditorInput(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
        return;
    }

    const itemId = String(input.dataset.itemId || '');
    const target = state.report.remarks.find((entry) => entry.id === itemId);
    if (!target) {
        return;
    }

    target.text = input.value;
    persistAndRefresh({ renderEditors: false });
}

function handleRemarkEditorClick(event) {
    const button = event.target.closest('button[data-action="remove-remark"]');
    if (!button) {
        return;
    }

    const itemId = String(button.dataset.itemId || '');
    state.report.remarks = state.report.remarks.filter((entry) => entry.id !== itemId);
    ensureMinimumRows();
    persistAndRefresh();
}

function persistAndRefresh({ renderEditors = true } = {}) {
    persistReportState();
    if (renderEditors) {
        renderEditor();
    }
    renderPreview();
}

function renderEditor() {
    syncDetailInputs();
    renderStaffEditors();
    renderTableEditors();
    renderRemarkEditors();
}

function syncDetailInputs() {
    reportTitleInput.value = state.report.title;
    reportDateInput.value = state.report.dateKey;
    preparedByInput.value = state.report.preparedBy;
    staffSectionTitleInput.value = state.report.staffSectionTitle;
    tableSectionTitleInput.value = state.report.tableSectionTitle;
    tableColumnTwoInput.value = state.report.tableColumnTwo;
    tableColumnThreeInput.value = state.report.tableColumnThree;
    remarksSectionTitleInput.value = state.report.remarksSectionTitle;
}

function renderStaffEditors() {
    staffEditorList.innerHTML = state.report.staff.map((entry, index) => `
        <article class="editor-item">
          <div class="editor-item-head">
            <strong>Staff ${index + 1}</strong>
            <button
              class="btn btn-ghost"
              type="button"
              data-action="remove-staff"
              data-item-id="${appClient.escapeHtml(entry.id)}"
            >Remove</button>
          </div>
          <div class="field">
            <label>Name</label>
            <input
              type="text"
              data-item-id="${appClient.escapeHtml(entry.id)}"
              data-field="name"
              value="${appClient.escapeHtml(entry.name)}"
              placeholder="Enter staff name"
            >
          </div>
          <div class="field">
            <label>Completed Tasks</label>
            <textarea
              data-item-id="${appClient.escapeHtml(entry.id)}"
              data-field="tasks"
              placeholder="One completed task per line"
            >${appClient.escapeHtml(entry.tasks)}</textarea>
          </div>
        </article>
    `).join('');
}

function renderTableEditors() {
    tableRowEditorList.innerHTML = state.report.tableRows.map((entry, index) => `
        <article class="editor-item">
          <div class="editor-item-head">
            <strong>Row ${index + 1}</strong>
            <button
              class="btn btn-ghost"
              type="button"
              data-action="remove-table-row"
              data-item-id="${appClient.escapeHtml(entry.id)}"
            >Remove</button>
          </div>
          <div class="inline-grid">
            <div class="field">
              <label>${appClient.escapeHtml(state.report.tableColumnTwo || 'Second Column')}</label>
              <input
                type="text"
                data-item-id="${appClient.escapeHtml(entry.id)}"
                data-field="label"
                value="${appClient.escapeHtml(entry.label)}"
                placeholder="Type the row label"
              >
            </div>
            <div class="field">
              <label>${appClient.escapeHtml(state.report.tableColumnThree || 'Third Column')}</label>
              <input
                type="text"
                data-item-id="${appClient.escapeHtml(entry.id)}"
                data-field="status"
                value="${appClient.escapeHtml(entry.status)}"
                placeholder="Type the row status"
              >
            </div>
          </div>
        </article>
    `).join('');
}

function renderRemarkEditors() {
    remarkEditorList.innerHTML = state.report.remarks.map((entry, index) => `
        <article class="editor-item">
          <div class="editor-item-head">
            <strong>Remark ${index + 1}</strong>
            <button
              class="btn btn-ghost"
              type="button"
              data-action="remove-remark"
              data-item-id="${appClient.escapeHtml(entry.id)}"
            >Remove</button>
          </div>
          <div class="field">
            <label>Remark</label>
            <input
              type="text"
              data-item-id="${appClient.escapeHtml(entry.id)}"
              value="${appClient.escapeHtml(entry.text)}"
              placeholder="Type a short summary remark"
            >
          </div>
        </article>
    `).join('');
}

function renderPreview() {
    if (!reportCanvas) {
        return;
    }

    const previewModel = buildPreviewModel();
    renderPaginatedPreview(previewModel);
}

function buildPreviewModel() {
    const filledStaffRows = state.report.staff.filter((entry) => hasStaffContent(entry));
    const staffRows = (filledStaffRows.length
        ? filledStaffRows
        : state.report.staff.slice(0, Math.max(1, Math.min(state.report.staff.length, 4))))
        .map((entry) => {
            const taskLines = splitTaskLines(entry.tasks);
            return {
                label: normalizeSectionLabel(entry.name, 'STAFF NAME'),
                taskLines: taskLines.length
                    ? taskLines.map((line) => ({ text: line, placeholder: false }))
                    : [{ text: 'Add completed tasks here.', placeholder: true }]
            };
        });

    let clientNumber = 0;
    const tableRows = state.report.tableRows
        .filter((entry) => hasTableContent(entry))
        .map((entry) => {
            const kind = normalizeTableRowKind(entry.kind);
            if (kind === 'branch_heading') {
                return {
                    kind,
                    number: '',
                    label: normalizeSectionLabel(entry.label, 'BRANCH'),
                    status: '',
                    statusClass: ''
                };
            }

            clientNumber += 1;
            return {
                kind,
                number: clientNumber,
                label: normalizePlainValue(entry.label, '-'),
                status: normalizePlainValue(entry.status, '-'),
                statusClass: resolveStatusClass(entry.status)
            };
        });

    const remarks = state.report.remarks
        .map((entry) => normalizePlainValue(entry.text, ''))
        .filter(Boolean);

    return {
        title: normalizeHeadline(state.report.title, 'DAILY COMPILED REPORT'),
        metaText: `Date: ${formatDisplayDate(state.report.dateKey)} | Prepared by: ${normalizePlainValue(state.report.preparedBy, 'Head Admin')}`,
        staffSectionTitle: normalizeSectionLabel(state.report.staffSectionTitle, 'STAFF REPORTS'),
        tableSectionTitle: normalizeSectionLabel(state.report.tableSectionTitle, 'TASK TRACKING LIST'),
        tableColumnTwo: normalizePlainValue(state.report.tableColumnTwo, 'Client Name'),
        tableColumnThree: normalizePlainValue(state.report.tableColumnThree, 'Status'),
        remarksSectionTitle: normalizeSectionLabel(state.report.remarksSectionTitle, 'REMARKS'),
        staffRows,
        tableRows,
        remarks
    };
}

function renderPaginatedPreview(model) {
    reportCanvas.innerHTML = '';

    const pages = [];
    let currentPage = createReportPage(model, pages);

    if (model.staffRows.length) {
        currentPage = renderStaffSectionAcrossPages(model, currentPage, pages);
    }

    if (model.tableRows.length) {
        currentPage = renderSummarySectionAcrossPages(model, currentPage, pages);
    }

    if (model.remarks.length) {
        currentPage = renderRemarksSectionAcrossPages(model, currentPage, pages);
    }

    finalizeReportPages(pages);
}

function createReportPage(model, pages) {
    const article = document.createElement('article');
    article.className = 'report-sheet';
    article.innerHTML = `
        <header class="report-header">
          <h1>${appClient.escapeHtml(model.title)}</h1>
          <div class="report-meta">${appClient.escapeHtml(model.metaText)}</div>
        </header>
        <div class="report-body"></div>
        <footer class="report-footer">
          <span class="report-footer-copy">Generated from the GMS daily compiled report template.</span>
          <span class="report-footer-page"></span>
        </footer>
    `;
    reportCanvas.appendChild(article);

    const page = {
        element: article,
        body: article.querySelector('.report-body'),
        footerPage: article.querySelector('.report-footer-page')
    };
    pages.push(page);
    return page;
}

function finalizeReportPages(pages = []) {
    const totalPages = pages.length || 1;
    pages.forEach((page, index) => {
        if (page?.footerPage) {
            page.footerPage.textContent = `Page ${index + 1} of ${totalPages}`;
        }
    });
}

function renderStaffSectionAcrossPages(model, currentPage, pages) {
    for (const row of model.staffRows) {
        let taskIndex = 0;
        let continuation = false;

        while (taskIndex < row.taskLines.length) {
            let section = ensureStaffSection(currentPage, model);
            let nextIndex = measureFittingStaffTaskIndex(currentPage, section, row, taskIndex, continuation);

            if (nextIndex === taskIndex) {
                if (sectionHasAnyRows(section) || pageHasContentBeforeSection(currentPage, section.container)) {
                    currentPage = createReportPage(model, pages);
                    continue;
                }
                nextIndex = Math.min(taskIndex + 1, row.taskLines.length);
            }

            section.tbody.appendChild(
                createStaffPreviewRow(row.label, row.taskLines.slice(taskIndex, nextIndex), continuation)
            );
            taskIndex = nextIndex;
            continuation = true;

            if (taskIndex < row.taskLines.length) {
                currentPage = createReportPage(model, pages);
            }
        }
    }

    return currentPage;
}

function renderSummarySectionAcrossPages(model, currentPage, pages) {
    const groups = groupSummaryRowsByBranch(model.tableRows);
    if (!groups.length) {
        return currentPage;
    }

    // Keep the invoice client list clean by starting it on a fresh paper
    // whenever earlier sections already consumed the current page.
    if (pageHasAnyContent(currentPage)) {
        currentPage = createReportPage(model, pages);
    }

    for (const group of groups) {
        let rowIndex = 0;
        let continuation = false;

        while (rowIndex < group.rows.length) {
            let section = ensureSummarySection(currentPage, model);
            let nextIndex = measureFittingSummaryGroupIndex(currentPage, section, group, rowIndex, continuation);

            if (nextIndex === rowIndex) {
                if (sectionHasAnyRows(section) || pageHasContentBeforeSection(currentPage, section.container)) {
                    currentPage = createReportPage(model, pages);
                    continue;
                }
                nextIndex = Math.min(rowIndex + 1, group.rows.length);
            }

            appendSummaryGroupSlice(section, group, rowIndex, nextIndex, continuation);
            rowIndex = nextIndex;
            continuation = true;

            if (rowIndex < group.rows.length) {
                currentPage = createReportPage(model, pages);
            }
        }
    }

    return currentPage;
}

function renderRemarksSectionAcrossPages(model, currentPage, pages) {
    for (const remark of model.remarks) {
        let section = ensureRemarksSection(currentPage, model);
        let item = createRemarkPreviewItem(remark);
        section.list.appendChild(item);

        if (isPageBodyOverflowing(currentPage)) {
            section.list.removeChild(item);

            if (sectionHasAnyRows(section) || pageHasContentBeforeSection(currentPage, section.container)) {
                currentPage = createReportPage(model, pages);
                section = ensureRemarksSection(currentPage, model);
            }

            item = createRemarkPreviewItem(remark);
            section.list.appendChild(item);
        }
    }

    return currentPage;
}

function ensureStaffSection(page, model) {
    let container = page.body.querySelector('[data-section="staff"]');
    if (container) {
        return {
            container,
            tbody: container.querySelector('tbody')
        };
    }

    container = document.createElement('section');
    container.dataset.section = 'staff';
    container.innerHTML = `
        <div class="section-bar">${appClient.escapeHtml(model.staffSectionTitle)}</div>
        <table class="staff-table" aria-label="Staff report table">
          <tbody></tbody>
        </table>
    `;
    page.body.appendChild(container);

    return {
        container,
        tbody: container.querySelector('tbody')
    };
}

function ensureSummarySection(page, model) {
    let container = page.body.querySelector('[data-section="summary"]');
    if (container) {
        return {
            container,
            tbody: container.querySelector('tbody')
        };
    }

    container = document.createElement('section');
    container.dataset.section = 'summary';
    container.innerHTML = `
        <h2 class="subsection-title">${appClient.escapeHtml(model.tableSectionTitle)}</h2>
        <table class="summary-table" aria-label="Secondary report table">
          <thead>
            <tr>
              <th>No.</th>
              <th>${appClient.escapeHtml(model.tableColumnTwo)}</th>
              <th>${appClient.escapeHtml(model.tableColumnThree)}</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
    `;
    page.body.appendChild(container);

    return {
        container,
        tbody: container.querySelector('tbody')
    };
}

function ensureRemarksSection(page, model) {
    let container = page.body.querySelector('[data-section="remarks"]');
    if (container) {
        return {
            container,
            list: container.querySelector('ul')
        };
    }

    container = document.createElement('section');
    container.dataset.section = 'remarks';
    container.innerHTML = `
        <div class="section-bar">${appClient.escapeHtml(model.remarksSectionTitle)}</div>
        <ul class="remarks-list"></ul>
    `;
    page.body.appendChild(container);

    return {
        container,
        list: container.querySelector('ul')
    };
}

function measureFittingStaffTaskIndex(page, section, row, startIndex, continuation) {
    let fittedIndex = startIndex;
    const taskLines = [];

    for (let index = startIndex; index < row.taskLines.length; index += 1) {
        taskLines.push(row.taskLines[index]);
        const trialRow = createStaffPreviewRow(row.label, taskLines, continuation);
        section.tbody.appendChild(trialRow);
        const fits = !isPageBodyOverflowing(page);
        section.tbody.removeChild(trialRow);

        if (!fits) {
            break;
        }

        fittedIndex = index + 1;
    }

    return fittedIndex;
}

function createStaffPreviewRow(label, taskLines = [], continuation = false) {
    const row = document.createElement('tr');
    const labelCell = document.createElement('th');
    labelCell.scope = 'row';
    labelCell.textContent = continuation ? `${label} (CONT.)` : label;

    const valueCell = document.createElement('td');
    const taskList = document.createElement('div');
    taskList.className = 'task-list';
    taskLines.forEach((line) => {
        const taskLine = document.createElement('div');
        taskLine.className = `task-line${line?.placeholder ? ' is-placeholder' : ''}`;
        taskLine.textContent = normalizePlainValue(line?.text, '');
        taskList.appendChild(taskLine);
    });

    valueCell.appendChild(taskList);
    row.appendChild(labelCell);
    row.appendChild(valueCell);
    return row;
}

function createSummaryPreviewRow(row) {
    if (row.kind === 'branch_heading') {
        const tableRow = document.createElement('tr');
        tableRow.className = 'is-branch-heading';
        tableRow.innerHTML = `<td colspan="3">${appClient.escapeHtml(row.label)}</td>`;
        return tableRow;
    }

    const tableRow = document.createElement('tr');
    tableRow.innerHTML = `
        <td>${row.number}</td>
        <td>${appClient.escapeHtml(row.label)}</td>
        <td class="${row.statusClass}">${appClient.escapeHtml(row.status)}</td>
    `;
    return tableRow;
}

function createSummaryGroupHeadingRow(label) {
    return createSummaryPreviewRow({
        kind: 'branch_heading',
        label
    });
}

function groupSummaryRowsByBranch(rows = []) {
    const groups = [];
    let activeGroup = null;

    (Array.isArray(rows) ? rows : []).forEach((row) => {
        if (row.kind === 'branch_heading') {
            activeGroup = {
                heading: row.label,
                rows: []
            };
            groups.push(activeGroup);
            return;
        }

        if (!activeGroup) {
            activeGroup = {
                heading: '',
                rows: []
            };
            groups.push(activeGroup);
        }

        activeGroup.rows.push(row);
    });

    return groups.filter((group) => group.rows.length);
}

function measureFittingSummaryGroupIndex(page, section, group, startIndex, continuation) {
    let fittedIndex = startIndex;

    for (let index = startIndex; index < group.rows.length; index += 1) {
        const tempNodes = [];

        if (index === startIndex) {
            const headingLabel = buildSummaryGroupHeadingLabel(group.heading, continuation);
            if (headingLabel) {
                const headingRow = createSummaryGroupHeadingRow(headingLabel);
                section.tbody.appendChild(headingRow);
                tempNodes.push(headingRow);
            }
        }

        const rowNode = createSummaryPreviewRow(group.rows[index]);
        section.tbody.appendChild(rowNode);
        tempNodes.push(rowNode);

        const fits = !isPageBodyOverflowing(page);
        while (tempNodes.length) {
            const node = tempNodes.pop();
            if (node?.parentNode === section.tbody) {
                section.tbody.removeChild(node);
            }
        }

        if (!fits) {
            break;
        }

        fittedIndex = index + 1;
    }

    return fittedIndex;
}

function appendSummaryGroupSlice(section, group, startIndex, endIndex, continuation) {
    const headingLabel = buildSummaryGroupHeadingLabel(group.heading, continuation);
    if (headingLabel) {
        section.tbody.appendChild(createSummaryGroupHeadingRow(headingLabel));
    }

    group.rows.slice(startIndex, endIndex).forEach((row) => {
        section.tbody.appendChild(createSummaryPreviewRow(row));
    });
}

function buildSummaryGroupHeadingLabel(label = '', continuation = false) {
    const safeLabel = normalizeSectionLabel(label, '');
    if (!safeLabel) {
        return '';
    }

    return continuation ? `${safeLabel} (CONT.)` : safeLabel;
}

function createRemarkPreviewItem(remark) {
    const item = document.createElement('li');
    item.textContent = remark;
    return item;
}

function isPageBodyOverflowing(page) {
    return page.body.scrollHeight > (page.body.clientHeight + 1);
}

function sectionHasAnyRows(section) {
    if (!section?.container) {
        return false;
    }

    const tableBody = section.tbody;
    if (tableBody) {
        return tableBody.children.length > 0;
    }

    const list = section.list;
    return Boolean(list && list.children.length > 0);
}

function pageHasContentBeforeSection(page, sectionContainer) {
    return Array.from(page.body.children).some((child) => child !== sectionContainer);
}

function pageHasAnyContent(page) {
    return Boolean(page?.body && page.body.children.length > 0);
}

async function handleCopyImage() {
    setActionState(true);
    setStatus('Preparing image for clipboard...', false);

    try {
        const canvas = await captureReportCanvas();
        const blob = await canvasToBlob(canvas);
        if (!blob) {
            throw new Error('Unable to build the report image.');
        }

        if (!navigator.clipboard?.write || typeof window.ClipboardItem === 'undefined') {
            triggerDownload(blob, buildImageFileName());
            setStatus('Clipboard image copy is not available here, so the PNG was downloaded instead.', false);
            return;
        }

        await navigator.clipboard.write([
            new window.ClipboardItem({
                [blob.type]: blob
            })
        ]);

        setStatus('Report copied as an image. You can paste it now.', false);
    } catch (error) {
        console.error('Failed to copy report image:', error);
        setStatus(error.message || 'Failed to copy the report image.', true);
    } finally {
        setActionState(false);
    }
}

async function handleAutoPopulateReport() {
    const hasContent = reportHasMeaningfulContent();
    if (hasContent && !window.confirm('Replace the current report content with the selected date company staff and invoice client list?')) {
        return;
    }

    setActionState(true);
    setStatus('Loading company staff and invoice client data...', false);

    try {
        const nextReport = await buildAutoPopulatedReport({
            dateKey: resolveDateInputValue(),
            preparedBy: resolvePreparedByValue()
        });

        state.report = normalizeReportState(
            nextReport,
            createDefaultReportState(nextReport.dateKey, nextReport.preparedBy)
        );
        persistAndRefresh();
        setStatus(buildAutoPopulateStatus(nextReport.__meta || {}), false);
    } catch (error) {
        console.error('Failed to auto-populate daily compiled report:', error);
        setStatus(error.message || 'Failed to auto-populate the report.', true);
    } finally {
        setActionState(false);
    }
}

async function handleLoadTodayClients() {
    const hasExistingRows = state.report.tableRows.some((entry) => hasTableContent(entry));
    if (hasExistingRows && !window.confirm('Replace the current second table rows with today\'s invoice client list?')) {
        return;
    }

    setActionState(true);
    setStatus('Loading today\'s invoice clients...', false);

    try {
        const dateKey = resolveDateInputValue();
        const salesPayload = await loadSalesSummary(dateKey);
        const salesOrders = buildSalesOrderSummaries(salesPayload?.items || [], dateKey);
        if (!salesOrders.length) {
            setStatus(`No invoice clients found for ${formatDisplayDate(dateKey)}.`, false);
            return;
        }

        state.report.tableSectionTitle = 'TODAY\'S INVOICE CLIENT LIST BY BRANCH';
        state.report.tableColumnTwo = 'Client Name';
        state.report.tableColumnThree = 'Courier';
        state.report.tableRows = buildSalesTableRows(salesOrders);
        persistAndRefresh();
        setStatus(`Loaded ${salesOrders.length} invoice client(s) into the second table.`, false);
    } catch (error) {
        console.error('Failed to load today\'s invoice clients:', error);
        setStatus(error.message || 'Failed to load today\'s invoice clients.', true);
    } finally {
        setActionState(false);
    }
}

async function handleDownloadImage() {
    setActionState(true);
    setStatus('Preparing PNG download...', false);

    try {
        const canvas = await captureReportCanvas();
        const blob = await canvasToBlob(canvas);
        if (!blob) {
            throw new Error('Unable to build the report image.');
        }

        triggerDownload(blob, buildImageFileName());
        setStatus('PNG downloaded successfully.', false);
    } catch (error) {
        console.error('Failed to download report image:', error);
        setStatus(error.message || 'Failed to download the report image.', true);
    } finally {
        setActionState(false);
    }
}

async function captureReportCanvas() {
    if (typeof html2canvas === 'undefined') {
        throw new Error('Image export library is not available.');
    }

    if (document.fonts?.ready) {
        try {
            await document.fonts.ready;
        } catch (_error) {
            // Ignore font readiness issues and continue the capture.
        }
    }

    const previousScrollLeft = reportCanvas?.parentElement?.scrollLeft || 0;
    const previousScrollTop = reportCanvas?.parentElement?.scrollTop || 0;
    reportCanvas.classList.add('is-exporting');

    try {
        await waitForNextFrame();
        return await html2canvas(reportCanvas, {
            backgroundColor: '#ffffff',
            useCORS: true,
            scale: 2,
            logging: false
        });
    } finally {
        reportCanvas.classList.remove('is-exporting');
        if (reportCanvas?.parentElement) {
            reportCanvas.parentElement.scrollLeft = previousScrollLeft;
            reportCanvas.parentElement.scrollTop = previousScrollTop;
        }
    }
}

function canvasToBlob(canvas) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
}

function triggerDownload(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function setActionState(isBusy) {
    if (loadTodayClientsBtn) {
        loadTodayClientsBtn.disabled = isBusy;
    }
    if (autoPopulateBtn) {
        autoPopulateBtn.disabled = isBusy;
    }
    copyImageBtn.disabled = isBusy;
    downloadImageBtn.disabled = isBusy;
}

function setStatus(message, isError) {
    previewStatus.textContent = message || '';
    previewStatus.className = `preview-status${isError ? ' is-error' : ''}`;
}

function persistReportState() {
    try {
        localStorage.setItem(state.storageKey, JSON.stringify(state.report));
    } catch (error) {
        console.warn('Unable to persist daily compiled report state:', error);
    }
}

function loadReportState(defaultDateKey, defaultPreparedBy) {
    const fallback = createDefaultReportState(defaultDateKey, defaultPreparedBy);

    try {
        const raw = localStorage.getItem(state.storageKey);
        if (!raw) {
            return fallback;
        }

        const parsed = JSON.parse(raw);
        return normalizeReportState(parsed, fallback);
    } catch (error) {
        console.warn('Unable to load saved daily compiled report state:', error);
        return fallback;
    }
}

function normalizeReportState(payload, fallback) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const normalized = {
        title: normalizePlainValue(source.title, fallback.title),
        dateKey: normalizeDateKey(source.dateKey, fallback.dateKey),
        preparedBy: normalizePlainValue(source.preparedBy, fallback.preparedBy),
        staffSectionTitle: normalizePlainValue(source.staffSectionTitle, fallback.staffSectionTitle),
        tableSectionTitle: normalizePlainValue(source.tableSectionTitle, fallback.tableSectionTitle),
        tableColumnTwo: normalizePlainValue(source.tableColumnTwo, fallback.tableColumnTwo),
        tableColumnThree: normalizePlainValue(source.tableColumnThree, fallback.tableColumnThree),
        remarksSectionTitle: normalizePlainValue(source.remarksSectionTitle, fallback.remarksSectionTitle),
        staff: Array.isArray(source.staff) ? source.staff.map(normalizeStaffEntry).filter(Boolean) : [],
        tableRows: Array.isArray(source.tableRows) ? source.tableRows.map(normalizeTableRowEntry).filter(Boolean) : [],
        remarks: Array.isArray(source.remarks) ? source.remarks.map(normalizeRemarkEntry).filter(Boolean) : []
    };

    state.report = normalized;
    ensureMinimumRows();
    return normalized;
}

function ensureMinimumRows() {
    if (!Array.isArray(state.report.staff) || !state.report.staff.length) {
        state.report.staff = [createStaffEntry(), createStaffEntry(), createStaffEntry()];
    }
    if (!Array.isArray(state.report.tableRows) || !state.report.tableRows.length) {
        state.report.tableRows = [createTableRowEntry()];
    }
    if (!Array.isArray(state.report.remarks) || !state.report.remarks.length) {
        state.report.remarks = [createRemarkEntry()];
    }
}

function createDefaultReportState(defaultDateKey, defaultPreparedBy) {
    return {
        title: 'DAILY COMPILED REPORT',
        dateKey: normalizeDateKey(defaultDateKey, new Date().toISOString().slice(0, 10)),
        preparedBy: normalizePlainValue(defaultPreparedBy, 'Head Admin'),
        staffSectionTitle: 'STAFF REPORTS',
        tableSectionTitle: 'TASK TRACKING LIST',
        tableColumnTwo: 'Client Name',
        tableColumnThree: 'Status',
        remarksSectionTitle: 'REMARKS',
        staff: [createStaffEntry(), createStaffEntry(), createStaffEntry(), createStaffEntry()],
        tableRows: [createTableRowEntry()],
        remarks: [createRemarkEntry()]
    };
}

function createEmptyReportState(defaultDateKey, defaultPreparedBy) {
    return {
        ...createDefaultReportState(defaultDateKey, defaultPreparedBy),
        staff: [createStaffEntry()],
        tableRows: [createTableRowEntry()],
        remarks: [createRemarkEntry()]
    };
}

function createStaffEntry() {
    return {
        id: createId(),
        name: '',
        tasks: ''
    };
}

function createTableRowEntry() {
    return {
        id: createId(),
        label: '',
        status: '',
        kind: 'data'
    };
}

function createRemarkEntry() {
    return {
        id: createId(),
        text: ''
    };
}

function createGeneratedTableRow(label = '', status = '', kind = 'data') {
    return {
        id: createId(),
        label,
        status,
        kind: normalizeTableRowKind(kind)
    };
}

function createGeneratedRemark(text = '') {
    return {
        id: createId(),
        text
    };
}

function normalizeStaffEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    return {
        id: normalizePlainValue(entry.id, createId()),
        name: normalizePlainValue(entry.name, ''),
        tasks: normalizeMultilineValue(entry.tasks)
    };
}

function normalizeTableRowEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    return {
        id: normalizePlainValue(entry.id, createId()),
        label: normalizePlainValue(entry.label, ''),
        status: normalizePlainValue(entry.status, ''),
        kind: normalizeTableRowKind(entry.kind)
    };
}

function normalizeRemarkEntry(entry) {
    if (typeof entry === 'string') {
        return {
            id: createId(),
            text: normalizePlainValue(entry, '')
        };
    }

    if (!entry || typeof entry !== 'object') {
        return null;
    }

    return {
        id: normalizePlainValue(entry.id, createId()),
        text: normalizePlainValue(entry.text, '')
    };
}

function splitTaskLines(value) {
    return normalizeMultilineValue(value)
        .split('\n')
        .map((line) => line.replace(/^\s*[-*•]+\s*/, '').trim())
        .filter(Boolean);
}

function hasStaffContent(entry) {
    return Boolean(normalizePlainValue(entry?.name, '') || splitTaskLines(entry?.tasks).length);
}

function hasTableContent(entry) {
    return Boolean(normalizePlainValue(entry?.label, '') || normalizePlainValue(entry?.status, ''));
}

function reportHasMeaningfulContent() {
    return state.report.staff.some((entry) => hasStaffContent(entry))
        || state.report.tableRows.some((entry) => hasTableContent(entry))
        || state.report.remarks.some((entry) => normalizePlainValue(entry?.text, ''));
}

async function buildAutoPopulatedReport({ dateKey, preparedBy }) {
    const [users, attendanceRows, salesPayload] = await Promise.all([
        loadCompanyUsers(),
        loadAttendanceSnapshot(dateKey),
        loadSalesSummary(dateKey)
    ]);
    const staff = buildCompanyStaffEntries(users, attendanceRows);
    const salesOrders = buildSalesOrderSummaries(salesPayload?.items || [], dateKey);
    const tableRows = buildSalesTableRows(salesOrders);
    const remarks = buildAutoRemarks({
        dateKey,
        users,
        attendanceRows,
        salesPayload,
        salesOrders
    });

    return {
        title: normalizePlainValue(state.report?.title, 'DAILY COMPILED REPORT'),
        dateKey: normalizeDateKey(dateKey, new Date().toISOString().slice(0, 10)),
        preparedBy: normalizePlainValue(preparedBy, String(state.session?.userName || '').trim() || 'Head Admin'),
        staffSectionTitle: 'COMPANY STAFF SUMMARY',
        tableSectionTitle: tableRows.length ? 'TODAY\'S INVOICE CLIENT LIST BY BRANCH' : normalizePlainValue(state.report?.tableSectionTitle, 'TASK TRACKING LIST'),
        tableColumnTwo: tableRows.length ? 'Client Name' : normalizePlainValue(state.report?.tableColumnTwo, 'Client Name'),
        tableColumnThree: tableRows.length ? 'Courier' : normalizePlainValue(state.report?.tableColumnThree, 'Status'),
        remarksSectionTitle: normalizePlainValue(state.report?.remarksSectionTitle, 'REMARKS'),
        staff: staff.length ? staff : [createStaffEntry()],
        tableRows: tableRows.length ? tableRows : [createTableRowEntry()],
        remarks: remarks.length ? remarks.map((entry) => createGeneratedRemark(entry)) : [createRemarkEntry()],
        __meta: {
            userCount: staff.length,
            attendanceIncluded: Boolean(attendanceRows.length),
            salesIncluded: Boolean(tableRows.length),
            salesAvailable: canLoadSalesSummary()
        }
    };
}

async function loadCompanyUsers() {
    const rows = await appClient.listUsers();
    const activeRows = (Array.isArray(rows) ? rows : [])
        .filter((user) => isReportTrackedCompanyUser(user))
        .sort((left, right) => {
            const leftRank = getRoleSortRank(left?.role);
            const rightRank = getRoleSortRank(right?.role);
            if (leftRank !== rightRank) {
                return leftRank - rightRank;
            }
            return String(left?.name || '').localeCompare(String(right?.name || ''));
        });

    const preferredRows = activeRows.filter((user) => resolveAccountStatusLabel(user) === 'Active');
    return preferredRows.length ? preferredRows : activeRows;
}

async function loadAttendanceSnapshot(dateKey) {
    if (!canLoadAttendanceSnapshot()) {
        return [];
    }

    try {
        const rows = await appClient.getDailyAttendanceSnapshot(dateKey);
        return Array.isArray(rows) ? rows : [];
    } catch (error) {
        console.warn('Unable to load daily attendance snapshot for auto-populate:', error);
        return [];
    }
}

async function loadSalesSummary(dateKey) {
    if (!canLoadSalesSummary()) {
        return null;
    }

    try {
        return await appClient.listSales({
            dateFrom: dateKey,
            dateTo: dateKey,
            limit: 0
        });
    } catch (error) {
        console.warn('Unable to load sales summary for auto-populate:', error);
        return null;
    }
}

function buildCompanyStaffEntries(users = [], attendanceRows = []) {
    const attendanceMap = new Map((attendanceRows || []).map((row) => [String(row?.id || ''), row]));
    return (users || []).map((user) => {
        const attendanceRow = attendanceMap.get(String(user?.id || ''));
        const summaryLine = buildUserSummaryLine(user);
        const attendanceLine = attendanceRow
            ? buildAttendanceSummaryLine(attendanceRow)
            : buildMissingAttendanceLine(user);

        return {
            id: createId(),
            name: normalizePlainValue(user?.name || user?.id, 'Staff'),
            tasks: [summaryLine, attendanceLine].filter(Boolean).join('\n')
        };
    });
}

function buildUserSummaryLine(user) {
    const parts = [`Role: ${resolveRoleLabel(user?.role)}`];
    if (normalizePlainValue(user?.branch_name, '')) {
        parts.push(`Branch: ${normalizePlainValue(user.branch_name, '-')}`);
    }
    parts.push(`Account: ${resolveAccountStatusLabel(user)}`);
    return parts.join(' | ');
}

function buildAttendanceSummaryLine(row) {
    const parts = [`Attendance: ${normalizePlainValue(row?.status, 'No attendance record')}`];
    const timeIn = formatDisplayTimeValue(row?.timeIn);
    const timeOut = formatDisplayTimeValue(row?.timeOut);

    if (timeIn) {
        parts.push(`In: ${timeIn}`);
    }
    if (timeOut) {
        parts.push(`Out: ${timeOut}`);
    }
    if (!timeIn && !timeOut && normalizePlainValue(row?.displayRemarks, '')) {
        parts.push(normalizePlainValue(row.displayRemarks, ''));
    }

    return parts.join(' | ');
}

function buildMissingAttendanceLine(user) {
    if (!canLoadAttendanceSnapshot()) {
        return 'Attendance: Not available in this workspace';
    }

    if (isAttendanceTrackedRole(user?.role)) {
        return 'Attendance: No record for the selected date';
    }

    return 'Attendance: Not tracked for this role';
}

function buildSalesTableRows(orders = []) {
    if (!Array.isArray(orders) || !orders.length) {
        return [];
    }

    const rows = [];
    let lastBranch = '';

    orders.forEach((order) => {
        const branchDisplay = normalizePlainValue(order?.branchDisplay, 'Unspecified');
        if (branchDisplay !== lastBranch) {
            rows.push(createGeneratedTableRow(branchDisplay, '', 'branch_heading'));
            lastBranch = branchDisplay;
        }

        rows.push(createGeneratedTableRow(
            normalizePlainValue(order?.clientName, 'Unnamed Client'),
            normalizePlainValue(order?.courierDisplay, 'Unspecified'),
            'data'
        ));
    });

    return rows;
}

function buildAutoRemarks({ dateKey, users = [], attendanceRows = [], salesPayload = null, salesOrders = [] }) {
    const remarks = [];
    const peopleCount = Array.isArray(users) ? users.length : 0;
    if (peopleCount) {
        remarks.push(`Company people included: ${peopleCount}.`);
    }

    const attendanceSummary = summarizeAttendanceRows(attendanceRows);
    if (attendanceSummary.total > 0) {
        remarks.push(
            `Attendance for ${formatDisplayDate(dateKey)}: On Time ${attendanceSummary.onTime}, Late ${attendanceSummary.late}, Absent ${attendanceSummary.absent}, Suspended ${attendanceSummary.suspended}.`
        );
    } else if (!canLoadAttendanceSnapshot()) {
        remarks.push('Attendance snapshot was skipped because the Reports module is not enabled for this workspace.');
    }

    if (salesPayload?.summary) {
        const summary = salesPayload.summary;
        remarks.push(
            `Sales for ${formatDisplayDate(dateKey)}: ${Number(summary.totalOrders || 0)} order(s), ${normalizePlainValue(summary.totalSalesDisplay, formatMoney(0))} gross sales, ${normalizePlainValue(summary.totalCollectionsDisplay, formatMoney(0))} collections.`
        );

        const routeSummary = buildSalesRouteSummary(salesOrders);
        if (routeSummary) {
            remarks.push(routeSummary);
        }

        const topSalesRep = Array.isArray(summary.salesRepBreakdown) ? summary.salesRepBreakdown[0] : null;
        if (topSalesRep?.label) {
            remarks.push(`Top sales rep: ${topSalesRep.label} (${normalizePlainValue(topSalesRep.displayValue, formatMoney(topSalesRep.value || 0))}).`);
        }
    } else if (canLoadSalesSummary()) {
        remarks.push(`No sales summary was found for ${formatDisplayDate(dateKey)}.`);
    } else {
        remarks.push('Sales summary was skipped because the Sales module is not enabled for this workspace.');
    }

    return remarks;
}

function summarizeAttendanceRows(rows = []) {
    return (rows || []).reduce((summary, row) => {
        const normalizedStatus = String(row?.statusGroup || row?.status || '').trim().toLowerCase();
        summary.total += 1;
        if (normalizedStatus === 'on_time') {
            summary.onTime += 1;
        } else if (normalizedStatus === 'late') {
            summary.late += 1;
        } else if (normalizedStatus === 'absent') {
            summary.absent += 1;
        } else if (normalizedStatus === 'suspended') {
            summary.suspended += 1;
        }
        return summary;
    }, {
        total: 0,
        onTime: 0,
        late: 0,
        absent: 0,
        suspended: 0
    });
}

function buildSalesOrderSummaries(items = [], dateKey = '') {
    const rows = filterSalesRowsForDate(items, dateKey);
    if (!rows.length) {
        return [];
    }

    const groups = new Map();
    rows.forEach((row, index) => {
        const key = buildSalesOrderKey(row, index);
        const existing = groups.get(key);
        if (!existing) {
            groups.set(key, {
                key,
                firstSeen: index,
                header: row,
                lines: [row],
                subtotalSum: Number(row?.line_subtotal || 0)
            });
            return;
        }

        existing.lines.push(row);
        existing.subtotalSum += Number(row?.line_subtotal || 0);
        if (scoreSalesOrderHeader(row) > scoreSalesOrderHeader(existing.header)) {
            existing.header = row;
        }
    });

    return Array.from(groups.values())
        .map(finalizeSalesOrderSummary)
        .sort(compareGeneratedSalesOrders);
}

function filterSalesRowsForDate(items = [], dateKey = '') {
    const expectedDate = normalizeDateKey(dateKey, '');
    if (!expectedDate) {
        return Array.isArray(items) ? items : [];
    }

    return (Array.isArray(items) ? items : []).filter((row) => resolveSaleDateValue(row) === expectedDate);
}

function resolveSaleDateValue(row) {
    const raw = String(row?.sale_date || row?.saleDate || '').trim();
    if (!raw) {
        return '';
    }

    const directMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch) {
        return directMatch[1];
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function buildSalesOrderKey(row, index) {
    const receiptNumber = normalizePlainValue(row?.receipt_number, '');
    const orderNumber = normalizePlainValue(row?.order_number, '');
    const rowId = normalizePlainValue(row?.id, '');
    return receiptNumber || orderNumber || rowId || `sales-row-${index + 1}`;
}

function scoreSalesOrderHeader(row) {
    if (!row || typeof row !== 'object') {
        return -1;
    }

    let score = 0;
    if (Number(row.order_total || 0) > 0) score += 100;
    if (Number(row.base_total || 0) > 0) score += 60;
    if (Number(row.line_index || 0) === 1) score += 40;
    if (normalizePlainValue(row.receipt_number, '')) score += 20;
    if (normalizePlainValue(row.order_number, '')) score += 10;
    return score;
}

function finalizeSalesOrderSummary(group) {
    const header = group?.header || {};
    const branchDisplay = normalizePlainValue(header.branch || header.cash_branch || header.cashBranch, 'Unspecified');
    const courierDisplay = normalizeCourierBucket(header.courier || '');
    const clientName = normalizePlainValue(header.client_name || header.clientName, 'Unnamed Client');
    const reference = normalizePlainValue(header.receipt_number || header.order_number || group?.key, '');
    const orderTotal = resolveGeneratedOrderTotal(header, group?.lines || [], group?.subtotalSum || 0);

    return {
        key: group?.key || reference || createId(),
        firstSeen: Number(group?.firstSeen || 0),
        clientName,
        branchDisplay,
        courierDisplay,
        reference,
        orderTotal
    };
}

function resolveGeneratedOrderTotal(header, lines = [], subtotalSum = 0) {
    const explicitTotal = Math.max(0, Number(header?.order_total || header?.base_total || 0));
    if (explicitTotal > 0) {
        return explicitTotal;
    }

    const recomputedSubtotal = (Array.isArray(lines) ? lines : []).reduce((sum, row) => {
        return sum + Number(row?.line_subtotal || 0);
    }, 0);

    return recomputedSubtotal > 0 ? recomputedSubtotal : Math.max(0, Number(subtotalSum || 0));
}

function compareGeneratedSalesOrders(left, right) {
    const branchOrder = resolveBranchSortIndex(left?.branchDisplay) - resolveBranchSortIndex(right?.branchDisplay);
    if (branchOrder !== 0) {
        return branchOrder;
    }

    const courierOrder = resolveCourierSortIndex(left?.courierDisplay) - resolveCourierSortIndex(right?.courierDisplay);
    if (courierOrder !== 0) {
        return courierOrder;
    }

    const clientOrder = String(left?.clientName || '').localeCompare(String(right?.clientName || ''), undefined, {
        numeric: true,
        sensitivity: 'base'
    });
    if (clientOrder !== 0) {
        return clientOrder;
    }

    return String(left?.reference || '').localeCompare(String(right?.reference || ''), undefined, {
        numeric: true,
        sensitivity: 'base'
    });
}

function buildClientRouteLabel(order) {
    const courierDisplay = normalizePlainValue(order?.courierDisplay, 'Unspecified');
    const branchDisplay = normalizePlainValue(order?.branchDisplay, 'Unspecified');
    return `${courierDisplay} | ${branchDisplay}`;
}

function buildSalesRouteSummary(orders = []) {
    if (!Array.isArray(orders) || !orders.length) {
        return '';
    }

    const groups = new Map();
    orders.forEach((order) => {
        const label = buildClientRouteLabel(order);
        groups.set(label, (groups.get(label) || 0) + 1);
    });

    const segments = Array.from(groups.entries())
        .sort((left, right) => {
            const [leftLabel] = left;
            const [rightLabel] = right;
            const [leftCourier, leftBranch] = leftLabel.split('|').map((part) => part.trim());
            const [rightCourier, rightBranch] = rightLabel.split('|').map((part) => part.trim());
            const branchOrder = resolveBranchSortIndex(leftBranch) - resolveBranchSortIndex(rightBranch);
            if (branchOrder !== 0) {
                return branchOrder;
            }
            return resolveCourierSortIndex(leftCourier) - resolveCourierSortIndex(rightCourier);
        })
        .map(([label, count]) => `${label} (${count})`);

    return segments.length ? `Invoice client routes: ${segments.join(', ')}.` : '';
}

function buildAutoPopulateStatus(meta = {}) {
    const parts = [];
    if (meta.userCount) {
        parts.push(`${meta.userCount} company user(s) added`);
    }
    if (meta.attendanceIncluded) {
        parts.push('attendance included');
    }
    if (meta.salesIncluded) {
        parts.push('client invoice list included');
    } else if (meta.salesAvailable === false) {
        parts.push('client invoice list skipped because Sales is off');
    }

    return parts.length
        ? `${parts.join(' | ')}.`
        : 'Company data loaded into the report.';
}

function canLoadAttendanceSnapshot() {
    return Boolean(state.bootstrap?.modules?.reports);
}

function canLoadSalesSummary() {
    return Boolean(state.bootstrap?.modules?.sales);
}

function normalizeRoleValue(role = '') {
    return String(role || '').trim().toLowerCase();
}

function normalizeTableRowKind(value = '') {
    return String(value || '').trim().toLowerCase() === 'branch_heading'
        ? 'branch_heading'
        : 'data';
}

function isReportTrackedCompanyUser(user = {}) {
    const normalizedRole = normalizeRoleValue(user?.role);
    if (!normalizedRole || normalizedRole === 'super_admin') {
        return false;
    }

    return normalizedRole !== 'company_admin' && normalizedRole !== 'head_admin';
}

function normalizeCourierBucket(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
        return 'Unspecified';
    }
    if (normalized === 'lbc') {
        return 'LBC';
    }
    if (normalized.includes('meet') || normalized.includes('pick up') || normalized.includes('pickup')) {
        return 'Meet-Up/Pick up';
    }
    if (normalized.includes('lalamove')) {
        return 'Lalamove';
    }
    if (normalized.includes('victory')) {
        return 'Victory';
    }
    if (normalized.includes('j&t') || normalized.includes('j & t') || normalized.includes('jnt')) {
        return 'J&T';
    }
    return humanizeLabel(value) || 'Unspecified';
}

function resolveCourierSortIndex(value = '') {
    const priority = ['LBC', 'Meet-Up/Pick up', 'Lalamove', 'Victory', 'J&T'];
    const normalized = normalizePlainValue(value, 'Unspecified').toLowerCase();
    const index = priority.findIndex((entry) => entry.toLowerCase() === normalized);
    return index >= 0 ? index : priority.length + 1;
}

function resolveBranchSortIndex(value = '') {
    const normalized = normalizePlainValue(value, 'Unspecified').toLowerCase();
    if (normalized === 'pampanga') {
        return 0;
    }
    if (normalized === 'cubao') {
        return 1;
    }
    const branches = Array.isArray(state.bootstrap?.branches)
        ? state.bootstrap.branches.map((branch) => normalizePlainValue(branch?.branch_name, '')).filter(Boolean)
        : [];
    const index = branches.findIndex((branch) => branch.toLowerCase() === normalized);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function getRoleSortRank(role = '') {
    switch (normalizeRoleValue(role)) {
        case 'company_admin':
        case 'head_admin':
            return 0;
        case 'staff':
            return 1;
        case 'employee':
            return 2;
        default:
            return 3;
    }
}

function resolveRoleLabel(role = '') {
    switch (normalizeRoleValue(role)) {
        case 'company_admin':
        case 'head_admin':
            return 'Head Admin';
        case 'staff':
            return 'Staff';
        case 'employee':
            return 'Employee';
        default:
            return humanizeLabel(role) || 'User';
    }
}

function isAttendanceTrackedRole(role = '') {
    const normalized = normalizeRoleValue(role);
    return normalized === 'staff' || normalized === 'employee';
}

function resolveAccountStatusLabel(user = {}) {
    const normalized = String(user?.account_status || '').trim().toLowerCase();
    if (normalized === 'inactive') {
        return 'Inactive';
    }
    if (normalized === 'suspended') {
        return 'Suspended';
    }
    if (normalized === 'active') {
        return 'Active';
    }
    return user?.is_active === false ? 'Suspended' : 'Active';
}

function humanizeLabel(value) {
    return String(value || '')
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDisplayTimeValue(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return '';
    }

    if (typeof appClient?.formatDisplayTime === 'function') {
        return appClient.formatDisplayTime(normalized, normalized);
    }

    return normalized;
}

function formatMoney(value) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}

function waitForNextFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function resolveStatusClass(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
        return '';
    }

    if (normalized.includes('packed') || normalized.includes('done') || normalized.includes('complete') || normalized.includes('finished')) {
        return 'is-done';
    }

    if (normalized.includes('pending') || normalized.includes('follow up') || normalized.includes('on hold')) {
        return 'is-pending';
    }

    return '';
}

function resolvePreparedByValue() {
    return normalizePlainValue(preparedByInput?.value, String(state.session?.userName || '').trim() || 'Head Admin');
}

function resolveDateInputValue() {
    return normalizeDateKey(reportDateInput?.value, new Date().toISOString().slice(0, 10));
}

function buildStorageKey(session) {
    const companyCode = String(session?.companyCode || '').trim().toLowerCase() || 'default';
    return `gms-daily-compiled-report-v1:${companyCode}`;
}

function buildImageFileName() {
    const title = normalizePlainValue(state.report.title, 'daily-compiled-report')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'daily-compiled-report';
    const dateKey = normalizeDateKey(state.report.dateKey, new Date().toISOString().slice(0, 10));
    return `${title}-${dateKey}.png`;
}

function normalizeHeadline(value, fallback) {
    return normalizePlainValue(value, fallback).toUpperCase();
}

function normalizeSectionLabel(value, fallback) {
    return normalizePlainValue(value, fallback).toUpperCase();
}

function normalizePlainValue(value, fallback = '') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

function normalizeMultilineValue(value) {
    return String(value ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();
}

function normalizeDateKey(value, fallback = '') {
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
}

function formatDisplayDate(dateKey) {
    const normalized = normalizeDateKey(dateKey);
    if (!normalized) {
        return '-';
    }

    const parsed = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return normalized;
    }

    return parsed.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function createId() {
    return `entry_${Math.random().toString(36).slice(2, 10)}`;
}

async function resolveServerDateKey() {
    try {
        const serverInfo = await appClient.getServerInfo();
        return normalizeDateKey(serverInfo?.dateKey, new Date().toISOString().slice(0, 10));
    } catch (_error) {
        return new Date().toISOString().slice(0, 10);
    }
}
