(function initializeKpiEvaluationAdminPage() {
    'use strict';

    const appClient = window.appClient;
    const scope = document.body?.dataset.kpiScope === 'super' ? 'super' : 'tenant';
    const KPI_SCORE_COMPONENTS = Object.freeze([
        Object.freeze({ key: 'attendancePercent', label: 'Attendance', weight: 15 }),
        Object.freeze({ key: 'punctualityPercent', label: 'Punctuality', weight: 15 }),
        Object.freeze({ key: 'taskCompletionPercent', label: 'Task Completion', weight: 20 }),
        Object.freeze({ key: 'taskQualityPercent', label: 'Task Quality', weight: 25 }),
        Object.freeze({ key: 'peerEvaluationPercent', label: 'Peer Evaluation', weight: 15 }),
        Object.freeze({ key: 'initiativePercent', label: 'Initiative', weight: 10 })
    ]);
    const state = {
        companyId: '',
        items: [],
        filteredItems: [],
        employees: [],
        summary: {},
        settings: {},
        dailyScoreHistory: [],
        dailyScoreHistoryEmployee: null,
        dailyScoreHistoryActivatedDate: '',
        dailyScoreHistoryDayOffStartDate: '',
        selectedRecordId: '',
        selectedTaskGroupKey: '',
        selectedAdminEvaluationGroupKey: '',
        contextAdminEvaluationGroupKey: '',
        expandedGroups: new Set(),
        employeeTaskEntries: new Map(),
        loadingEmployeeTasks: new Set(),
        loading: false
    };

    const refs = {
        companySelect: document.getElementById('companySelect'),
        backBtn: document.getElementById('backBtn'),
        refreshBtn: document.getElementById('refreshBtn'),
        exportBtn: document.getElementById('exportBtn'),
        policyToggleBtn: document.getElementById('policyToggleBtn'),
        policyPanel: document.getElementById('policyPanel'),
        policyFrequency: document.getElementById('policyFrequency'),
        policyMode: document.getElementById('policyMode'),
        policyCustomType: document.getElementById('policyCustomType'),
        policyIntervalDays: document.getElementById('policyIntervalDays'),
        policyStartDate: document.getElementById('policyStartDate'),
        policyEndDate: document.getElementById('policyEndDate'),
        policyIssueCommentAll: document.getElementById('policyIssueCommentAll'),
        policyAllowEmployeeView: document.getElementById('policyAllowEmployeeView'),
        policyActive: document.getElementById('policyActive'),
        policyStatus: document.getElementById('policyStatus'),
        savePolicyBtn: document.getElementById('savePolicyBtn'),
        summaryTotal: document.getElementById('summaryTotal'),
        summaryAverage: document.getElementById('summaryAverage'),
        summaryLow: document.getElementById('summaryLow'),
        summaryExcellent: document.getElementById('summaryExcellent'),
        summaryPending: document.getElementById('summaryPending'),
        dailyScoresDate: document.getElementById('dailyScoresDate'),
        dailyScoresBody: document.getElementById('dailyScoresBody'),
        dailyScoreModal: document.getElementById('dailyScoreModal'),
        dailyScoreModalTitle: document.getElementById('dailyScoreModalTitle'),
        dailyScoreModalSubtitle: document.getElementById('dailyScoreModalSubtitle'),
        dailyScoreModalBody: document.getElementById('dailyScoreModalBody'),
        closeDailyScoreModalBtn: document.getElementById('closeDailyScoreModalBtn'),
        backDailyScoreModalBtn: document.getElementById('backDailyScoreModalBtn'),
        filterSearch: document.getElementById('filterSearch'),
        filterEmployee: document.getElementById('filterEmployee'),
        filterRating: document.getElementById('filterRating'),
        filterType: document.getElementById('filterType'),
        filterFrequency: document.getElementById('filterFrequency'),
        filterStatus: document.getElementById('filterStatus'),
        filterRecordDate: document.getElementById('filterRecordDate'),
        filterKpiRecord: document.getElementById('filterKpiRecord'),
        kpiScoreSection: document.getElementById('kpiScoreSection'),
        timeoutRecordsSection: document.getElementById('timeoutRecordsSection'),
        recordsBody: document.getElementById('recordsBody'),
        adminEvaluationsBody: document.getElementById('adminEvaluationsBody'),
        pageStatus: document.getElementById('pageStatus'),
        detailsModal: document.getElementById('detailsModal'),
        detailsBody: document.getElementById('detailsBody'),
        closeDetailsBtn: document.getElementById('closeDetailsBtn'),
        taskModal: document.getElementById('taskModal'),
        taskModalTitle: document.getElementById('taskModalTitle'),
        taskModalSubtitle: document.getElementById('taskModalSubtitle'),
        taskModalBody: document.getElementById('taskModalBody'),
        closeTaskModalBtn: document.getElementById('closeTaskModalBtn'),
        adminEvaluationModal: document.getElementById('adminEvaluationModal'),
        adminEvaluationModalTitle: document.getElementById('adminEvaluationModalTitle'),
        adminEvaluationModalSubtitle: document.getElementById('adminEvaluationModalSubtitle'),
        adminEvaluationModalBody: document.getElementById('adminEvaluationModalBody'),
        adminEvaluationForm: document.getElementById('adminEvaluationForm'),
        adminEvaluationSubmitBtn: document.getElementById('adminEvaluationSubmitBtn'),
        closeAdminEvaluationModalBtn: document.getElementById('closeAdminEvaluationModalBtn'),
        adminEvaluationContextMenu: document.getElementById('adminEvaluationContextMenu'),
        adminEvaluationContextAction: document.getElementById('adminEvaluationContextAction')
    };

    initialize().catch((error) => {
        console.error('Failed to initialize KPI evaluation page:', error);
        renderPageLoadError(error);
    });

    async function initialize() {
        const session = await appClient.ensureSession({ role: scope === 'super' ? 'super_admin' : 'head_admin' });
        if (!session) return;

        initializeRecordDateFilter();
        bindEvents();
        if (scope === 'tenant') {
            appClient.getBootstrap()
                .then((bootstrap) => appClient.applyBootstrapBrandTheme(bootstrap))
                .catch((error) => console.error('Failed to apply KPI evaluation page theme:', error));
        }
        if (scope === 'super') {
            await loadCompanies();
        } else {
            await loadData();
        }
    }

    function bindEvents() {
        refs.backBtn?.addEventListener('click', () => {
            window.location.href = '/super_admin/dashboard.html';
        });
        refs.refreshBtn?.addEventListener('click', () => loadData({ bypassCache: true }));
        refs.exportBtn?.addEventListener('click', exportCsv);
        refs.filterRecordDate?.addEventListener('change', () => loadData());
        refs.filterKpiRecord?.addEventListener('change', () => {
            const selected = refs.filterKpiRecord?.value;
            if (refs.kpiScoreSection && refs.timeoutRecordsSection) {
                if (selected === 'timeout_kpi_record') {
                    refs.kpiScoreSection.hidden = true;
                    refs.timeoutRecordsSection.hidden = false;
                } else {
                    refs.kpiScoreSection.hidden = false;
                    refs.timeoutRecordsSection.hidden = true;
                }
            }
        });
        refs.companySelect?.addEventListener('change', async () => {
            state.companyId = String(refs.companySelect.value || '');
            await loadData();
        });
        refs.policyToggleBtn?.addEventListener('click', () => {
            if (!refs.policyPanel) return;
            refs.policyPanel.hidden = !refs.policyPanel.hidden;
            refs.policyToggleBtn.textContent = refs.policyPanel.hidden ? 'Evaluation Settings' : 'Hide Settings';
            if (!refs.policyPanel.hidden) refs.policyPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        refs.policyFrequency?.addEventListener('change', syncPolicyCustomFields);
        refs.policyCustomType?.addEventListener('change', syncPolicyCustomFields);
        refs.savePolicyBtn?.addEventListener('click', savePolicy);
        [
            refs.filterSearch,
            refs.filterEmployee,
            refs.filterRating,
            refs.filterType,
            refs.filterFrequency,
            refs.filterStatus
        ].filter(Boolean).forEach((control) => {
            control.addEventListener(control.type === 'search' ? 'input' : 'change', applyFilters);
        });
        refs.dailyScoresBody?.addEventListener('click', (event) => {
            const scoreButton = event.target.closest('[data-open-score-history]');
            if (scoreButton) openDailyScoreHistory(scoreButton.dataset.openScoreHistory);
        });
        refs.recordsBody?.addEventListener('click', (event) => {
            const scoreButton = event.target.closest('[data-open-daily-score]');
            if (scoreButton) {
                openDailyScoreModal(
                    scoreButton.dataset.openDailyScore,
                    scoreButton.dataset.dailyScoreDate
                );
                return;
            }
            const taskButton = event.target.closest('[data-open-task-modal]');
            if (taskButton) {
                openTaskModal(taskButton.dataset.openTaskModal);
                return;
            }
            const button = event.target.closest('[data-view-record]');
            if (button) {
                openDetails(button.dataset.viewRecord);
                return;
            }
            const toggle = event.target.closest('[data-toggle-kpi-group]');
            if (toggle) {
                toggleRecordGroup(toggle.dataset.toggleKpiGroup);
            }
        });
        refs.adminEvaluationsBody?.addEventListener('click', (event) => {
            const editButton = event.target.closest('[data-edit-admin-evaluation]');
            if (editButton) {
                const evaluationId = editButton.dataset.editAdminEvaluation;
                const evaluation = state.items.find((item) => item.id === evaluationId);
                if (evaluation) {
                    openAdminEvaluationModal(evaluation.evaluatorEmployeeId, evaluation);
                }
                return;
            }
            const deleteButton = event.target.closest('[data-delete-admin-evaluation]');
            if (deleteButton) {
                const evaluationId = deleteButton.dataset.deleteAdminEvaluation;
                if (confirm('Are you sure you want to delete this evaluation?')) {
                    deleteAdminEvaluation(evaluationId);
                }
                return;
            }
        });
        [refs.recordsBody, refs.adminEvaluationsBody].filter(Boolean).forEach((tableBody) => {
            tableBody.addEventListener('contextmenu', (event) => {
                const row = event.target.closest('[data-admin-evaluation-group]');
                if (!row) return;
                event.preventDefault();
                event.stopPropagation();
                openAdminEvaluationContextMenu(row.dataset.adminEvaluationGroup, event.clientX, event.clientY);
            }, true);
            tableBody.addEventListener('keydown', (event) => {
                if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
                const row = event.target.closest('[data-admin-evaluation-group]');
                if (!row) return;
                event.preventDefault();
                const rect = row.getBoundingClientRect();
                openAdminEvaluationContextMenu(row.dataset.adminEvaluationGroup, rect.left + 24, rect.top + 24);
            });
        });
        refs.adminEvaluationContextAction?.addEventListener('click', () => {
            const groupKey = state.contextAdminEvaluationGroupKey;
            closeAdminEvaluationContextMenu();
            if (groupKey) openAdminEvaluationModal(groupKey);
        });
        document.addEventListener('click', (event) => {
            if (!refs.adminEvaluationContextMenu?.contains(event.target)) closeAdminEvaluationContextMenu();
        });
        document.addEventListener('scroll', closeAdminEvaluationContextMenu, true);
        window.addEventListener('resize', closeAdminEvaluationContextMenu);
        refs.closeDetailsBtn?.addEventListener('click', closeDetails);
        refs.detailsModal?.addEventListener('click', (event) => {
            if (event.target === refs.detailsModal) closeDetails();
        });
        refs.closeTaskModalBtn?.addEventListener('click', closeTaskModal);
        refs.taskModal?.addEventListener('click', (event) => {
            if (event.target === refs.taskModal) closeTaskModal();
        });
        refs.closeAdminEvaluationModalBtn?.addEventListener('click', closeAdminEvaluationModal);
        refs.adminEvaluationModal?.addEventListener('click', (event) => {
            if (event.target === refs.adminEvaluationModal) closeAdminEvaluationModal();
        });
        refs.adminEvaluationForm?.addEventListener('submit', submitAdminEvaluation);
        refs.adminEvaluationModalBody?.addEventListener('click', (event) => {
            const ratingButton = event.target.closest('[data-admin-evaluation-rating]');
            if (ratingButton) selectAdminEvaluationRating(Number(ratingButton.dataset.adminEvaluationRating || 0));
        });
        refs.closeDailyScoreModalBtn?.addEventListener('click', closeDailyScoreModal);
        refs.backDailyScoreModalBtn?.addEventListener('click', () => {
            if (state.dailyScoreHistory.length > 0) {
                renderDailyScoreHistory();
            }
        });
        refs.dailyScoreModalBody?.addEventListener('click', (event) => {
            const historyScoreButton = event.target.closest('[data-open-history-score]');
            if (historyScoreButton) {
                const dateKey = String(historyScoreButton.dataset.openHistoryScore || '');
                const score = state.dailyScoreHistory.find((item) => String(item.dateKey || '') === dateKey);
                if (score) showDailyScoreBreakdown(score, { dateKey, allowBack: true });
                return;
            }
            if (event.target.closest('[data-back-score-history]')) {
                renderDailyScoreHistory();
            }
        });
        refs.dailyScoreModal?.addEventListener('click', (event) => {
            if (event.target === refs.dailyScoreModal) closeDailyScoreModal();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            if (refs.adminEvaluationContextMenu && !refs.adminEvaluationContextMenu.hidden) {
                closeAdminEvaluationContextMenu();
                return;
            }
            if (refs.dailyScoreModal?.classList.contains('open')) {
                closeDailyScoreModal();
                return;
            }
            if (refs.taskModal?.classList.contains('open')) {
                closeTaskModal();
                return;
            }
            if (refs.adminEvaluationModal?.classList.contains('open')) {
                closeAdminEvaluationModal();
                return;
            }
            if (refs.detailsModal?.classList.contains('open')) closeDetails();
        });
    }

    async function loadCompanies() {
        setPageStatus('Loading tenant companies...');
        try {
            const companies = await appClient.listSuperCompanies();
            if (!Array.isArray(companies) || !companies.length) {
                refs.companySelect.innerHTML = '<option value="">No companies available</option>';
                renderRecords();
                renderDailyEmployeeScores();
                setPageStatus('No tenant companies are available.');
                return;
            }
            refs.companySelect.innerHTML = companies.map((company) => `
                <option value="${escapeHtml(company.id)}">${escapeHtml(company.name || company.company_code || company.id)} · ${escapeHtml(company.company_code || '')}</option>
            `).join('');
            state.companyId = String(refs.companySelect.value || companies[0].id || '');
            await loadData();
        } catch (error) {
            console.error('Failed to load tenant companies for KPI evaluation:', error);
            setPageStatus(error.message || 'Failed to load tenant companies.', true);
        }
    }

    async function loadData({ bypassCache = false } = {}) {
        if (state.loading || (scope === 'super' && !state.companyId)) return;
        state.loading = true;
        refs.refreshBtn && (refs.refreshBtn.disabled = true);
        refs.exportBtn && (refs.exportBtn.disabled = true);
        setPageStatus('');
        if (refs.dailyScoresBody) refs.dailyScoresBody.innerHTML = renderLoadingRow(2, 'Loading KPI scores');
        if (refs.recordsBody) refs.recordsBody.innerHTML = renderLoadingRow(8, 'Loading KPI evaluations');
        if (refs.adminEvaluationsBody) refs.adminEvaluationsBody.innerHTML = renderLoadingRow(4, `Loading ${scope === 'super' ? 'Super Admin' : 'Head Admin'} evaluations`);
        try {
            const recordDate = getSelectedRecordDate();
            const recordDateFilters = recordDate ? { dateFrom: recordDate, dateTo: recordDate } : {};
            const payload = scope === 'super'
                ? await appClient.listSuperKpiEvaluations(state.companyId, recordDateFilters, { bypassCache })
                : await appClient.listKpiEvaluations(recordDateFilters, { bypassCache });
            closeTaskModal();
            state.employeeTaskEntries.clear();
            state.loadingEmployeeTasks.clear();
            state.items = Array.isArray(payload?.items) ? payload.items : [];
            state.employees = Array.isArray(payload?.employees) ? payload.employees : [];
            state.summary = payload?.summary || {};
            state.settings = payload?.settings || {};
            cacheSummaryAttendanceEntries();
            populateEmployeeFilter();
            populatePolicy();
            applyFilters();
            setPageStatus(`${state.items.length} KPI evaluation record${state.items.length === 1 ? '' : 's'} loaded${recordDate ? ` for ${recordDate}` : ''}.`);
        } catch (error) {
            console.error('Failed to load KPI evaluations:', error);
            state.items = [];
            state.filteredItems = [];
            state.summary = {};
            state.employees = [];
            renderPageLoadError(error);
        } finally {
            state.loading = false;
            refs.refreshBtn && (refs.refreshBtn.disabled = false);
            refs.exportBtn && (refs.exportBtn.disabled = false);
        }
    }

    function renderLoadingIndicator(label = 'Loading') {
        return `
            <span class="kpi-loading-indicator" role="status" aria-label="${escapeHtml(label)}">
              <span class="kpi-loading-wheel" aria-hidden="true"></span>
              <span class="kpi-sr-only">${escapeHtml(label)}</span>
            </span>
        `;
    }

    function renderLoadingRow(columnCount, label) {
        return `<tr><td colspan="${Number(columnCount) || 1}" class="kpi-empty-row">${renderLoadingIndicator(label)}</td></tr>`;
    }

    function renderLoadingBlock(label) {
        return `<div class="kpi-empty-row">${renderLoadingIndicator(label)}</div>`;
    }

    function renderPageLoadError(error) {
        const message = String(error?.message || 'Failed to load KPI evaluations.');
        const errorMarkup = `<span class="kpi-load-error">${escapeHtml(message)}</span>`;
        if (refs.dailyScoresBody) {
            refs.dailyScoresBody.innerHTML = `<tr><td colspan="2" class="kpi-empty-row">${errorMarkup}</td></tr>`;
        }
        if (refs.recordsBody) {
            refs.recordsBody.innerHTML = `<tr><td colspan="8" class="kpi-empty-row">${errorMarkup}</td></tr>`;
        }
        if (refs.adminEvaluationsBody) {
            refs.adminEvaluationsBody.innerHTML = `<tr><td colspan="4" class="kpi-empty-row">${errorMarkup}</td></tr>`;
        }
        setPageStatus(message, true);
    }

    function populateEmployeeFilter() {
        if (!refs.filterEmployee) return;
        const current = refs.filterEmployee.value;
        const map = new Map();
        state.employees.forEach((employee) => map.set(String(employee.id), String(employee.name || employee.id)));
        state.items.forEach((record) => {
            map.set(String(record.evaluatorEmployeeId), String(record.evaluatorName || record.evaluatorEmployeeId));
            map.set(String(record.ratedEmployeeId), String(record.ratedEmployeeName || record.ratedEmployeeId));
        });
        refs.filterEmployee.innerHTML = '<option value="">All employees</option>' + [...map.entries()]
            .filter(([id]) => id)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)} · ${escapeHtml(id)}</option>`)
            .join('');
        refs.filterEmployee.value = map.has(current) ? current : '';
    }

    function applyFilters() {
        const search = String(refs.filterSearch?.value || '').trim().toLowerCase();
        const employeeId = String(refs.filterEmployee?.value || '');
        const rating = String(refs.filterRating?.value || '');
        const type = String(refs.filterType?.value || '');
        const frequency = String(refs.filterFrequency?.value || '');
        const status = String(refs.filterStatus?.value || '');
        const recordDate = getSelectedRecordDate();
        state.filteredItems = state.items.filter((record) => {
            if (recordDate && getRecordDateKey(record) !== recordDate) return false;
            if (employeeId && record.evaluatorEmployeeId !== employeeId && record.ratedEmployeeId !== employeeId) return false;
            if (rating && Number(record.rating) !== Number(rating)) return false;
            if (type && record.evaluationType !== type) return false;
            if (frequency && record.evaluationFrequency !== frequency) return false;
            if (status && record.status !== status) return false;
            if (search) {
                const haystack = [record.evaluatorName, record.evaluatorEmployeeId, record.ratedEmployeeName, record.ratedEmployeeId, record.comment, record.ratingLabel]
                    .join(' ').toLowerCase();
                if (!haystack.includes(search)) return false;
            }
            return true;
        });
        renderSummary();
        renderRecords();
        renderAdminEvaluations();
    }

    function getSelectedRecordDate() {
        const value = String(refs.filterRecordDate?.value || '').trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
    }

    function initializeRecordDateFilter() {
        if (!refs.filterRecordDate) return;
        refs.filterRecordDate.value = getLocalDateKey();
    }

    function getLocalDateKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function renderSummary() {
        const summary = state.summary || {};
        refs.summaryTotal && (refs.summaryTotal.textContent = String(Number(summary.totalEvaluations || 0)));
        refs.summaryAverage && (refs.summaryAverage.textContent = Number(summary.averageRating || 0).toFixed(2));
        refs.summaryLow && (refs.summaryLow.textContent = String(Number(summary.lowRatingCount || 0)));
        refs.summaryExcellent && (refs.summaryExcellent.textContent = String(Number(summary.excellentRatingCount || 0)));
        refs.summaryPending && (refs.summaryPending.textContent = String(Number(summary.pendingRequiredEvaluations || 0)));
        renderDailyEmployeeScores();
    }

    function cacheSummaryAttendanceEntries() {
        const scores = Array.isArray(state.summary?.dailyEmployeeScores)
            ? state.summary.dailyEmployeeScores
            : [];
        scores.forEach((score) => {
            const employeeId = String(score.employeeId || '').trim();
            const attendance = score.attendance || null;
            const dateKey = String(attendance?.dateKey || state.summary?.currentPeriod?.start || '').slice(0, 10);
            if (!employeeId || !dateKey) return;
            state.employeeTaskEntries.set(
                getTaskEntryCacheKey(employeeId, dateKey),
                attendance ? [attendance] : []
            );
        });
    }

    function renderDailyEmployeeScores() {
        if (!refs.dailyScoresBody) return;
        if (refs.dailyScoresDate) {
            const averageStartDate = String(state.summary?.kpiScoreAverageStartDate || '');
            refs.dailyScoresDate.textContent = averageStartDate
                ? `Average of completed daily KPI scores since ${averageStartDate}`
                : 'Average of daily KPI scores';
        }
        const scores = Array.isArray(state.summary?.dailyEmployeeScores)
            ? state.summary.dailyEmployeeScores
            : [];
        if (!scores.length) {
            refs.dailyScoresBody.innerHTML = '<tr><td colspan="2" class="kpi-empty-row">No active employee KPI scores are available.</td></tr>';
            return;
        }
        refs.dailyScoresBody.innerHTML = scores.map((score) => {
            const hasKpiScore = score.averageKpiScorePercent !== null
                && score.averageKpiScorePercent !== undefined;
            const rawKpiScore = hasKpiScore ? Number(score.averageKpiScorePercent) : Number.NaN;
            const kpiScore = Number.isFinite(rawKpiScore) ? normalizePercent(rawKpiScore) : null;
            const pendingScoreLabel = score.isKpiWorkingDay === false
                ? 'Day off - excluded'
                : 'Pending shift end';
            return `
                <tr>
                  <td><div class="kpi-person-cell"><strong>${escapeHtml(score.employeeName)}</strong><span>${escapeHtml(score.employeeId)}</span></div></td>
                  <td>${kpiScore === null ? `<span class="kpi-muted-dash">${pendingScoreLabel}</span>` : renderScoreHistoryButton(kpiScore, score.employeeId)}</td>
                </tr>
            `;
        }).join('');
    }

    function openDailyScoreModal(employeeId = '', dateKey = '') {
        const normalizedId = String(employeeId || '').trim();
        const normalizedDateKey = String(dateKey || '').slice(0, 10);
        const scores = Array.isArray(state.summary?.dailyEmployeeScores)
            ? state.summary.dailyEmployeeScores
            : [];
        const employeeScore = scores.find((item) => String(item.employeeId || '').trim() === normalizedId);
        const currentPeriodDate = String(state.summary?.currentPeriod?.start || '').slice(0, 10);
        const score = normalizedDateKey
            ? (Array.isArray(employeeScore?.dailyKpiScores)
                ? employeeScore.dailyKpiScores.find((item) => String(item.dateKey || '') === normalizedDateKey)
                : null)
                || (normalizedDateKey === currentPeriodDate ? employeeScore : null)
            : employeeScore;
        if (!score || !refs.dailyScoreModal || !refs.dailyScoreModalBody) return;
        state.dailyScoreHistory = [];
        state.dailyScoreHistoryEmployee = null;
        state.dailyScoreHistoryActivatedDate = '';
        state.dailyScoreHistoryDayOffStartDate = '';
        showDailyScoreBreakdown(score, {
            dateKey: normalizedDateKey || state.summary?.currentPeriod?.start,
            allowBack: false
        });
        refs.dailyScoreModal.classList.add('open');
        refs.dailyScoreModal.setAttribute('aria-hidden', 'false');
    }

    async function openDailyScoreHistory(employeeId = '') {
        const normalizedId = String(employeeId || '').trim();
        if (!normalizedId || !refs.dailyScoreModal || !refs.dailyScoreModalBody) return;
        state.dailyScoreHistory = [];
        state.dailyScoreHistoryEmployee = null;
        state.dailyScoreHistoryActivatedDate = '';
        state.dailyScoreHistoryDayOffStartDate = '';
        if (refs.dailyScoreModalTitle) refs.dailyScoreModalTitle.textContent = 'Daily KPI Score History';
        if (refs.dailyScoreModalSubtitle) refs.dailyScoreModalSubtitle.textContent = '';
        refs.dailyScoreModalBody.innerHTML = renderLoadingBlock('Loading daily KPI score history');
        refs.dailyScoreModal.classList.add('open');
        refs.dailyScoreModal.setAttribute('aria-hidden', 'false');
        try {
            const payload = scope === 'super'
                ? await appClient.getSuperKpiDailyScoreHistory(state.companyId, normalizedId, { days: 90 })
                : await appClient.getKpiDailyScoreHistory(normalizedId, { days: 90 });
            state.dailyScoreHistory = Array.isArray(payload?.items) ? payload.items : [];
            state.dailyScoreHistoryEmployee = payload?.employee || { id: normalizedId, name: normalizedId };
            state.dailyScoreHistoryActivatedDate = String(payload?.kpiActivatedDate || '');
            state.dailyScoreHistoryDayOffStartDate = String(payload?.dayOffHistoryStartDate || '');
            renderDailyScoreHistory();
        } catch (error) {
            console.error('Failed to load KPI score history:', error);
            refs.dailyScoreModalBody.innerHTML = `<div class="kpi-empty-row">${escapeHtml(error.message || 'Failed to load KPI score history.')}</div>`;
        }
    }

    function renderDailyScoreHistory() {
        if (!refs.dailyScoreModalBody) return;
        if (refs.backDailyScoreModalBtn) refs.backDailyScoreModalBtn.hidden = true;
        const employee = state.dailyScoreHistoryEmployee || {};
        if (refs.dailyScoreModalTitle) {
            refs.dailyScoreModalTitle.textContent = `${employee.name || employee.id || 'Employee'} Daily KPI Score History`;
        }
        if (refs.dailyScoreModalSubtitle) {
            const activationDate = state.dailyScoreHistoryActivatedDate;
            const dayOffStartDate = state.dailyScoreHistoryDayOffStartDate;
            refs.dailyScoreModalSubtitle.textContent = dayOffStartDate
                ? `Day Off records start ${formatHistoryDate(dayOffStartDate)}. Past Day Off dates are not included and have no KPI calculation.`
                : (activationDate
                    ? `KPI calculations start ${formatHistoryDate(activationDate)}.`
                    : 'Daily KPI records.');
        }
        if (!state.dailyScoreHistory.length) {
            refs.dailyScoreModalBody.innerHTML = '<div class="kpi-empty-row">No daily KPI score history is available.</div>';
            return;
        }
        refs.dailyScoreModalBody.innerHTML = `
            <div class="kpi-score-history-wrap">
              <table class="kpi-score-history-table">
                <thead><tr><th>Date</th><th>Attendance</th><th>Peer ratings</th><th>Daily KPI Score Record</th></tr></thead>
                <tbody>${state.dailyScoreHistory.map((score) => `
                  <tr class="${score.isDayOff ? 'kpi-history-day-off' : ''}">
                    <td><strong>${escapeHtml(formatHistoryDate(score.dateKey))}</strong><span>${escapeHtml(score.dateKey || '')}</span></td>
                    ${score.isDayOff
                        ? '<td><span class="kpi-pill kpi-pill--day-off">Employee Day Off</span></td><td colspan="2"><span class="kpi-no-calculation">No KPI calculation record</span></td>'
                        : `<td><span class="kpi-pill ${score.isPresent ? 'kpi-pill--reviewed' : 'kpi-pill--flagged'}">${score.isPresent ? 'Present' : 'Absent'}</span></td>
                           <td>${score.isPresent ? escapeHtml(`${Number(score.raterCount || 0)} of ${Number(score.expectedRaterCount || 0)}`) : '<span class="kpi-muted-dash">No review</span>'}</td>
                           <td>${renderHistoryScoreButton(score)}</td>`}
                  </tr>
                `).join('')}</tbody>
              </table>
            </div>
        `;
    }

    function showDailyScoreBreakdown(score = {}, { dateKey = '', allowBack = false } = {}) {
        if (!refs.dailyScoreModalBody) return;
        const normalizedDateKey = String(dateKey || score.dateKey || '').slice(0, 10);
        const totalScore = normalizePercent(score.kpiScorePercent);
        if (refs.dailyScoreModalTitle) {
            refs.dailyScoreModalTitle.textContent = `${score.employeeName || score.employeeId} KPI Score`;
        }
        if (refs.dailyScoreModalSubtitle) {
            refs.dailyScoreModalSubtitle.textContent = normalizedDateKey
                ? `Daily score for ${normalizedDateKey}`
                : 'Daily KPI score breakdown';
        }
        if (refs.backDailyScoreModalBtn) {
            refs.backDailyScoreModalBtn.hidden = !allowBack;
        }

        const componentRows = KPI_SCORE_COMPONENTS.map((component) => {
            const achievedPercent = normalizePercent(score[component.key]);
            const contribution = Math.round(((achievedPercent * component.weight) / 100 + Number.EPSILON) * 100) / 100;
            return `
                <tr>
                  <td><strong>${escapeHtml(component.label)}</strong></td>
                  <td>${renderPercentChip(achievedPercent)}</td>
                  <td><span class="kpi-score-weight">${component.weight}%</span></td>
                  <td><strong class="kpi-score-contribution ${getPercentToneClass(achievedPercent)}">${formatScorePercent(contribution)}</strong></td>
                </tr>
            `;
        }).join('');

        refs.dailyScoreModalBody.innerHTML = `
            <section class="kpi-score-overview">
              <div>
                <span>Score Average</span>
                <strong class="${getPercentToneClass(totalScore)}">${formatScorePercent(totalScore)}</strong>
                <small>Total Percentage</small>
              </div>
              <div class="kpi-score-progress" aria-label="Total KPI score ${totalScore}%">
                <span class="${getPercentToneClass(totalScore)}" style="width:${totalScore}%"></span>
              </div>
            </section>
            <div class="kpi-score-breakdown">
              <table class="kpi-score-breakdown-table">
                <thead><tr><th>KPI Category</th><th>Percent Earned</th><th>Weight</th><th>Weighted Score</th></tr></thead>
                <tbody>${componentRows}</tbody>
                <tfoot><tr><th colspan="3">Score Average / Total Percentage</th><th>${renderPercentChip(totalScore)}</th></tr></tfoot>
              </table>
            </div>
            <p class="kpi-score-legend"><span class="is-high">Passed</span><span class="is-medium">Medium</span><span class="is-low">Low</span></p>
        `;
    }

    function closeDailyScoreModal() {
        state.dailyScoreHistory = [];
        state.dailyScoreHistoryEmployee = null;
        state.dailyScoreHistoryActivatedDate = '';
        state.dailyScoreHistoryDayOffStartDate = '';
        if (refs.backDailyScoreModalBtn) refs.backDailyScoreModalBtn.hidden = true;
        refs.dailyScoreModal?.classList.remove('open');
        refs.dailyScoreModal?.setAttribute('aria-hidden', 'true');
    }

    function renderRecords() {
        if (!refs.recordsBody) return;
        const recordDateKey = getRecordTableDateKey();
        if (recordDateKey > getLocalDateKey()) {
            refs.recordsBody.innerHTML = `<tr><td colspan="8" class="kpi-empty-row">No KPI records yet for ${escapeHtml(formatHistoryDate(recordDateKey))}.</td></tr>`;
            return;
        }
        const groups = buildEmployeeRecordGroups();
        if (!groups.length) {
            refs.recordsBody.innerHTML = '<tr><td colspan="8" class="kpi-empty-row">No KPI evaluation records match the current filters.</td></tr>';
            return;
        }
        refs.recordsBody.innerHTML = groups
            .map(renderRecordGroup)
            .join('');
    }

    function renderAdminEvaluations() {
        if (!refs.adminEvaluationsBody) return;
        const recordDateKey = getRecordTableDateKey();
        if (recordDateKey > getLocalDateKey()) {
            const adminLabel = scope === 'super' ? 'Super Admin' : 'Head Admin';
            refs.adminEvaluationsBody.innerHTML = `<tr><td colspan="4" class="kpi-empty-row">No ${adminLabel} evaluations yet for ${escapeHtml(formatHistoryDate(recordDateKey))}.</td></tr>`;
            return;
        }
        const groups = buildEmployeeRecordGroups();
        if (!groups.length) {
            refs.adminEvaluationsBody.innerHTML = '<tr><td colspan="4" class="kpi-empty-row">No employees match the current filters.</td></tr>';
            return;
        }
        refs.adminEvaluationsBody.innerHTML = groups.map(renderAdminEvaluationRow).join('');
    }

    function renderAdminEvaluationRow(group = {}) {
        const adminEvaluation = getAdminEvaluationForGroup(group);
        const hasTimeOut = hasGroupTimeOut(group);
        const hasRatingAndComment = adminEvaluation && adminEvaluation.rating && adminEvaluation.comment;
        const ratingMarkup = adminEvaluation
            ? `<div class="kpi-rating-cell"><strong>${formatStars(adminEvaluation.rating)}</strong><span>${escapeHtml(`${adminEvaluation.rating}/5 - ${adminEvaluation.ratingLabel}`)}</span></div>`
            : '<span class="kpi-muted-dash">-</span>';
        const commentMarkup = adminEvaluation
            ? `<span class="kpi-record-comment">${escapeHtml(adminEvaluation.comment || 'No comment')}</span>`
            : '<span class="kpi-muted-dash">-</span>';
        const dateMarkup = adminEvaluation
            ? escapeHtml(formatDateTime(adminEvaluation.submittedAt))
            : '<span class="kpi-muted-dash">-</span>';
        const actionsMarkup = hasRatingAndComment
            ? `<div class="kpi-actions-cell">
                 <button class="kpi-icon-button kpi-action-edit" type="button" data-edit-admin-evaluation="${escapeHtml(adminEvaluation.id)}" aria-label="Edit evaluation" title="Edit"><i class="fas fa-pen"></i></button>
                 <button class="kpi-icon-button kpi-action-delete" type="button" data-delete-admin-evaluation="${escapeHtml(adminEvaluation.id)}" aria-label="Delete evaluation" title="Delete"><i class="fas fa-trash"></i></button>
               </div>`
            : '<span class="kpi-muted-dash">-</span>';
        const rowAttributes = hasTimeOut
            ? ` class="kpi-admin-evaluation-row" data-admin-evaluation-group="${escapeHtml(group.key)}" tabindex="0" aria-haspopup="menu"`
            : '';
        return `
            <tr${rowAttributes}>
              <td><div class="kpi-person-cell"><strong>${escapeHtml(group.evaluatorName)}</strong><span>${escapeHtml(group.evaluatorEmployeeId)}</span></div></td>
              <td>${ratingMarkup}</td>
              <td>${commentMarkup}</td>
              <td>${dateMarkup}</td>
              <td>${actionsMarkup}</td>
            </tr>
        `;
    }

    function buildEmployeeRecordGroups() {
        const dateKey = getRecordTableDateKey();
        const recordGroups = new Map(buildRecordGroups(state.filteredItems)
            .map((group) => [String(group.key), group]));
        const employees = Array.isArray(state.employees) ? state.employees : [];
        return employees
            .map((employee) => {
                const employeeId = String(employee.id || '').trim();
                const key = `${employeeId}:${dateKey}`;
                const score = getDailyScoreForEmployee(employeeId);
                const group = recordGroups.get(key) || {
                    key,
                    evaluatorEmployeeId: employeeId,
                    evaluatorName: getEmployeeName(employee),
                    submittedAt: '',
                    dateKey,
                    records: []
                };
                return {
                    ...group,
                    key,
                    evaluatorEmployeeId: employeeId,
                    evaluatorName: group.evaluatorName || getEmployeeName(employee),
                    dateKey: group.dateKey || dateKey,
                    employee,
                    attendance: score?.attendance || null,
                    score
                };
            })
            .filter((group) => shouldShowEmployeeRecordGroup(group));
    }

    function getRecordTableDateKey() {
        return getSelectedRecordDate()
            || String(state.summary?.currentPeriod?.start || '').slice(0, 10)
            || new Date().toISOString().slice(0, 10);
    }

    function getDailyScoreForEmployee(employeeId = '') {
        const normalizedId = String(employeeId || '').trim();
        const scores = Array.isArray(state.summary?.dailyEmployeeScores)
            ? state.summary.dailyEmployeeScores
            : [];
        return scores.find((score) => String(score.employeeId || '').trim() === normalizedId) || null;
    }

    function getEmployeeName(employee = {}) {
        return String(employee.name || employee.display_name || employee.username || employee.id || 'Employee');
    }

    function getEmployeeSubtitleForRecord(employee = {}) {
        return [
            employee.branch_name || employee.branchName,
            employee.role
        ].map((value) => String(value || '').trim()).filter(Boolean).join(' - ');
    }

    function shouldShowEmployeeRecordGroup(group = {}) {
        const employee = group.employee || {};
        const employeeId = String(group.evaluatorEmployeeId || employee.id || '').trim();
        const employeeFilter = String(refs.filterEmployee?.value || '').trim();
        if (employeeFilter && employeeId !== employeeFilter) {
            return false;
        }

        const hasRecordOnlyFilter = [
            refs.filterRating?.value,
            refs.filterType?.value,
            refs.filterFrequency?.value,
            refs.filterStatus?.value
        ].some((value) => String(value || '').trim());
        if (hasRecordOnlyFilter && !(group.records || []).length) {
            return false;
        }

        const search = String(refs.filterSearch?.value || '').trim().toLowerCase();
        if (!search) {
            return true;
        }
        const employeeText = [
            getEmployeeName(employee),
            employeeId,
            employee.branch_name || employee.branchName,
            employee.role
        ].join(' ').toLowerCase();
        return employeeText.includes(search) || (group.records || []).length > 0;
    }

    function buildRecordGroups(records = []) {
        const groups = new Map();
        records.forEach((record) => {
            const evaluatorKey = String(record.evaluatorEmployeeId || record.evaluatorName || record.id || '');
            const dateKey = getRecordDateKey(record);
            const submittedAt = String(record.submittedAt || '');
            const key = `${evaluatorKey}:${dateKey}`;
            if (!key) {
                return;
            }
            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    evaluatorEmployeeId: record.evaluatorEmployeeId,
                    evaluatorName: record.evaluatorName,
                    submittedAt,
                    dateKey,
                    records: []
                });
            }
            const group = groups.get(key);
            group.records.push(record);
            if (String(record.submittedAt || '') > String(group.submittedAt || '')) {
                group.submittedAt = record.submittedAt;
            }
        });

        return [...groups.values()].sort((left, right) => (
            String(right.submittedAt || '').localeCompare(String(left.submittedAt || ''))
        ));
    }

    function renderRecordGroup(group) {
        const records = group.records || [];
        const hasEvaluationRecords = records.length > 0;
        const hasTimeOut = hasGroupTimeOut(group);
        const expanded = hasEvaluationRecords && state.expandedGroups.has(group.key);
        const overallRating = getOverallRatingSummary(
            group.evaluatorEmployeeId,
            getGroupDateKey(group)
        );
        const recordDateKey = getGroupDateKey(group);
        const kpiScore = getEmployeeKpiScore(group.evaluatorEmployeeId, recordDateKey);
        const statusLabel = formatGroupStatus(records);
        const contextAttributes = ` data-admin-evaluation-group="${escapeHtml(group.key)}" tabindex="0" aria-haspopup="menu"`;
        return `
            <tr class="kpi-record-group kpi-admin-evaluation-row ${expanded ? 'is-expanded' : ''} ${hasTimeOut ? '' : 'is-pending-timeout'}"${contextAttributes}>
              <td><div class="kpi-person-cell"><strong>${escapeHtml(group.evaluatorName)}</strong><span>${escapeHtml(group.evaluatorEmployeeId)}${group.employee ? ` - ${escapeHtml(getEmployeeSubtitleForRecord(group.employee) || 'Active employee')}` : ''}</span></div></td>
              <td>${renderTaskSummaryCell(group)}</td>
              <td>${renderRecordCountCell(group)}</td>
              <td>${hasTimeOut ? `<div class="kpi-rating-cell"><strong>${overallRating.average ? overallRating.average.toFixed(2) : '0.00'}</strong><span>Daily Overall Rating</span></div>` : '<span class="kpi-muted-dash">-</span>'}</td>
              <td>${renderGroupKpiScoreCell(group, kpiScore, recordDateKey)}</td>
              <td>${renderGroupDateCell(group)}</td>
              <td>${renderGroupRemark(group, statusLabel)}</td>
              <td class="kpi-arrow-column">
                ${hasEvaluationRecords ? `<button class="kpi-icon-button kpi-arrow-button" type="button" data-toggle-kpi-group="${escapeHtml(group.key)}" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${expanded ? 'Hide KPI records' : 'Show KPI records'}">
                  ${chevronDownIconSvg()}
                </button>` : '<span class="kpi-muted-dash">-</span>'}
              </td>
            </tr>
            ${hasEvaluationRecords ? `<tr class="kpi-record-details-row" ${expanded ? '' : 'hidden'}>
              <td colspan="8">
                <div class="kpi-record-details">
                  <table class="kpi-table kpi-record-detail-table">
                    <thead><tr><th class="kpi-branch-heading" aria-label="Rated branch"></th><th>Rated employee</th><th>Rating</th><th>KPI type</th><th>Comment</th><th>Record date</th><th>Remarks</th><th>View</th></tr></thead>
                    <tbody>${records.map((record, index) => renderRecordDetailRow(record, index, records.length)).join('')}</tbody>
                  </table>
                </div>
              </td>
            </tr>` : ''}
        `;
    }

    function hasGroupTimeOut(group = {}) {
        return Boolean(group.attendance?.timeOut || (group.records || []).length);
    }

    function renderRecordCountCell(group = {}) {
        const records = group.records || [];
        if (!hasGroupTimeOut(group)) {
            return '<div class="kpi-record-count"><strong>Not yet time out</strong><span>No time-out submission yet</span></div>';
        }
        if (!records.length) {
            return '<div class="kpi-record-count"><strong>No KPI evaluation</strong><span>Time out submitted</span></div>';
        }
        return `<div class="kpi-record-count"><strong>${records.length} KPI ${records.length === 1 ? 'record' : 'records'}</strong><span>${escapeHtml(countGroupTypes(records))}</span></div>`;
    }

    function renderGroupKpiScoreCell(group = {}, kpiScore = null, dateKey = '') {
        if (!hasGroupTimeOut(group)) {
            return renderPendingKpiScoreStatus(group);
        }
        const score = group.score || null;
        if (kpiScore === null) {
            const pendingLabel = score?.isKpiWorkingDay === false ? 'Day off' : 'Pending shift end';
            return `<div class="kpi-rating-cell"><strong>-</strong><span>${escapeHtml(pendingLabel)}</span></div>`;
        }
        return `<div class="kpi-rating-cell">${renderClickablePercent(kpiScore, group.evaluatorEmployeeId, dateKey)}<span>Employee Daily KPI</span></div>`;
    }

    function renderPendingKpiScoreStatus(group = {}) {
        const score = group.score || {};
        const attendance = group.attendance || score.attendance || {};
        if (score.isKpiWorkingDay === false) {
            return '<span class="kpi-pill kpi-pill--day-off">Day off</span>';
        }
        const hasTimeIn = Boolean(attendance.timeIn || score.hasTimeIn || score.isPresent);
        const hasTimeOut = Boolean(attendance.timeOut || score.hasTimeOut);
        if (hasTimeIn && !hasTimeOut) {
            if (getGroupDateKey(group) === getLocalDateKey()) {
                return '<span class="kpi-muted-dash">-</span>';
            }
            return '<span class="kpi-pill kpi-pill--present-no-timeout">Present but no time out</span>';
        }
        return '<span class="kpi-pill kpi-pill--absent">Absent</span>';
    }

    function renderGroupDateCell(group = {}) {
        if (!hasGroupTimeOut(group)) {
            return '<span class="kpi-muted-dash">-</span>';
        }
        const dateKey = getGroupDateKey(group);
        if (group.submittedAt) {
            return escapeHtml(formatEvaluationDateTime(dateKey, group.submittedAt));
        }
        const timeOut = String(group.attendance?.timeOut || '').trim();
        const timeLabel = timeOut && typeof appClient.formatDisplayTime === 'function'
            ? appClient.formatDisplayTime(timeOut, timeOut)
            : timeOut;
        return escapeHtml(timeLabel ? `${formatHistoryDate(dateKey)}, ${timeLabel}` : formatHistoryDate(dateKey));
    }

    function renderGroupRemark(group = {}, statusLabel = {}) {
        if (!hasGroupTimeOut(group)) {
            return '<span class="kpi-muted-dash">-</span>';
        }
        const statusMarkup = !(group.records || []).length
            ? '<span class="kpi-pill kpi-pill--timed-out">Timed out</span>'
            : renderStatusRemark(statusLabel);
        return statusMarkup;
    }

    function getOverallRatingSummary(employeeId = '', dateKey = '') {
        const normalizedId = String(employeeId || '').trim();
        const normalizedDateKey = String(dateKey || '').slice(0, 10);
        const ratings = state.items
            .filter((record) => (
                String(record.ratedEmployeeId || '').trim() === normalizedId
                && (!normalizedDateKey || getRecordDateKey(record) === normalizedDateKey)
                && ['required_evaluation', 'admin_evaluation'].includes(String(record.evaluationType || ''))
            ))
            .map((record) => Number(record.rating || 0))
            .filter((rating) => rating > 0);
        const average = ratings.length
            ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
            : 0;
        return {
            average,
            count: ratings.length
        };
    }

    function renderRecordDetailRow(record, index = 0, total = 1) {
        return `
            <tr class="kpi-rated-branch-row">
              <td class="kpi-branch-cell">${renderRatedBranchIndicator(index, total)}</td>
              <td><div class="kpi-person-cell"><strong>${escapeHtml(record.ratedEmployeeName)}</strong><span>${escapeHtml(record.ratedEmployeeRole || record.ratedEmployeeId)}</span></div></td>
              <td><div class="kpi-rating-cell"><strong>${formatStars(record.rating)}</strong><span>${escapeHtml(`${record.rating}/5 - ${record.ratingLabel}`)}</span></div></td>
              <td><span class="kpi-pill ${record.evaluationType === 'issue_encounter' ? 'kpi-pill--issue' : 'kpi-pill--required'}">${escapeHtml(formatType(record.evaluationType))}</span></td>
              <td><span class="kpi-record-comment">${escapeHtml(record.comment || 'No comment')}</span></td>
              <td>${escapeHtml(formatEvaluationDateTime(getRecordDateKey(record), record.submittedAt))}</td>
              <td>${renderRecordRemarks(record)}</td>
              <td class="kpi-record-view-cell"><button class="kpi-icon-button" type="button" data-view-record="${escapeHtml(record.id)}" aria-label="View details">${eyeIconSvg()}</button></td>
            </tr>
        `;
    }

    function renderRatedBranchIndicator(index = 0, total = 1) {
        const classNames = [
            'kpi-branch-indicator',
            index === 0 ? 'is-first' : '',
            index === Math.max(0, total - 1) ? 'is-last' : ''
        ].filter(Boolean).join(' ');
        return `<span class="${classNames}" title="Rated by employee" aria-label="Rated by employee"><span></span></span>`;
    }

    function renderRecordRemarks(record) {
        const status = String(record.status || 'submitted').trim().toLowerCase();
        if (!['reviewed', 'flagged'].includes(status)) {
            return '<span class="kpi-muted-dash">-</span>';
        }
        return `<span class="kpi-pill kpi-pill--${escapeHtml(status)}">${escapeHtml(formatStatusLabel(status))}</span>`;
    }

    function renderStatusRemark(statusInfo = {}) {
        const className = String(statusInfo.className || '').trim().toLowerCase();
        if (!['reviewed', 'flagged'].includes(className)) {
            return '<span class="kpi-muted-dash">-</span>';
        }
        return `<span class="kpi-pill kpi-pill--${escapeHtml(className)}">${escapeHtml(statusInfo.label || formatStatusLabel(className))}</span>`;
    }

    function getAdminEvaluationForGroup(group = {}) {
        const employeeId = String(group.evaluatorEmployeeId || '').trim();
        const dateKey = getGroupDateKey(group);
        return state.items.find((record) => (
            String(record.evaluationType || '') === 'admin_evaluation'
            && String(record.ratedEmployeeId || '').trim() === employeeId
            && getRecordDateKey(record) === dateKey
        )) || null;
    }

    function renderTaskSummaryCell(group) {
        const taskGroups = getTaskGroupsForEmployee(group.evaluatorEmployeeId, {
            dateKey: getGroupDateKey(group)
        });
        const totalTasks = taskGroups.reduce((sum, section) => sum + section.tasks.length, 0);
        return `
            <div class="kpi-task-summary">
              <strong aria-label="${escapeHtml(`${totalTasks} task${totalTasks === 1 ? '' : 's'}`)}">${totalTasks}</strong>
              <button class="kpi-task-view-button" type="button" data-open-task-modal="${escapeHtml(group.key)}" aria-label="${escapeHtml(`View ${totalTasks} task${totalTasks === 1 ? '' : 's'}`)}" title="View tasks">
                ${eyeIconSvg()}
              </button>
            </div>
        `;
    }

    function renderTaskDetailsTable(group) {
        const taskGroups = getTaskGroupsForEmployee(group.evaluatorEmployeeId, {
            dateKey: getGroupDateKey(group)
        });
        return `
            <div class="kpi-task-details">
              <table class="kpi-table kpi-task-detail-table">
                <thead><tr><th>Task type</th><th>Task name</th><th>Input</th><th>Status</th></tr></thead>
                <tbody>${taskGroups.map(renderTaskSectionRows).join('')}</tbody>
              </table>
            </div>
        `;
    }

    function renderTaskSectionRows(section) {
        if (section.loading) {
            return `
                <tr>
                  <td><span class="kpi-task-type">${escapeHtml(section.label)}</span></td>
                  <td class="kpi-muted-dash">Loading ${escapeHtml(section.emptyLabel)}...</td>
                  <td>-</td>
                  <td>-</td>
                </tr>
            `;
        }
        if (!section.tasks.length) {
            return `
                <tr>
                  <td><span class="kpi-task-type">${escapeHtml(section.label)}</span></td>
                  <td class="kpi-muted-dash">No ${escapeHtml(section.emptyLabel)}.</td>
                  <td>-</td>
                  <td>-</td>
                </tr>
            `;
        }
        return section.tasks.map((task, index) => `
            <tr>
              <td>${index === 0 ? `<span class="kpi-task-type">${escapeHtml(section.label)}</span>` : ''}</td>
              <td>${escapeHtml(task.name || '')}</td>
              <td>${escapeHtml(formatTaskInputType(task.inputType || task.input_type))}</td>
              <td>${renderTaskStatus(task.status)}</td>
            </tr>
        `).join('');
    }

    function renderTaskStatus(status = '') {
        const normalized = String(status || '').trim().toLowerCase() === 'complete' ? 'complete' : 'incomplete';
        return `<span class="kpi-pill kpi-pill--${normalized}">${normalized === 'complete' ? 'Complete' : 'Incomplete'}</span>`;
    }

    function getTaskGroupsForEmployee(employeeId = '', { dateKey = '' } = {}) {
        const employee = getEmployeeById(employeeId);
        const tasks = Array.isArray(employee?.assigned_tasks) ? employee.assigned_tasks : [];
        const mainTasks = tasks.filter((task) => !isSpecificTask(task) && !isInitiativeTask(task));
        const specificTasks = tasks.filter((task) => isSpecificTask(task) && !isInitiativeTask(task));
        const normalizedEmployeeId = String(employeeId || '').trim();
        const cacheKey = getTaskEntryCacheKey(normalizedEmployeeId, dateKey);
        const entries = getEmployeeTaskEntries(normalizedEmployeeId, dateKey);
        const completedLookup = buildTaskCompletionLookup(entries);
        const initiativeTasks = [
            ...tasks.filter(isInitiativeTask),
            ...extractInitiativeTasks(entries, normalizedEmployeeId)
        ];
        return [
            { label: 'Main Task', emptyLabel: 'main tasks', tasks: normalizeTaskList(mainTasks, completedLookup) },
            { label: 'Specific Task', emptyLabel: 'specific tasks', tasks: normalizeTaskList(specificTasks, completedLookup) },
            {
                label: 'Initiative Task',
                emptyLabel: 'initiative tasks',
                loading: state.loadingEmployeeTasks.has(cacheKey),
                tasks: normalizeTaskList(initiativeTasks, completedLookup)
            }
        ];
    }

    function getEmployeeById(employeeId = '') {
        const normalizedId = String(employeeId || '').trim();
        return state.employees.find((employee) => String(employee.id || '').trim() === normalizedId) || null;
    }

    function normalizeTaskList(tasks = [], completedLookup = null) {
        const seen = new Set();
        return (Array.isArray(tasks) ? tasks : [])
            .map((task) => ({
                id: String(task?.id || '').trim(),
                name: String(task?.name || task?.taskName || '').trim(),
                inputType: task?.inputType || task?.input_type || 'numeric'
            }))
            .filter((task) => {
                const key = `${task.name.toLowerCase()}:${String(task.inputType || '').toLowerCase()}`;
                if (!task.name || seen.has(key)) {
                    return false;
                }
                seen.add(key);
                return true;
            })
            .map((task) => ({
                ...task,
                status: getTaskCompletionStatus(task, completedLookup)
            }));
    }

    function extractInitiativeTasks(entries = [], employeeId = '') {
        const employee = getEmployeeById(employeeId);
        const assignedIds = new Set((Array.isArray(employee?.assigned_tasks) ? employee.assigned_tasks : [])
            .map((task) => String(task?.id || '').trim())
            .filter(Boolean));
        const results = [];
        (Array.isArray(entries) ? entries : []).forEach((entry) => {
            (Array.isArray(entry?.taskResults) ? entry.taskResults : []).forEach((task) => {
                const id = String(task?.id || task?.taskId || '').trim();
                const isCustom = Boolean(task?.isCustom || task?.is_custom || task?.custom);
                if (!isCustom || (id && assignedIds.has(id))) {
                    return;
                }
                const name = String(task?.name || task?.taskName || '').trim();
                if (!name) {
                    return;
                }
                results.push({
                    id,
                    name,
                    inputType: task?.inputType || task?.input_type || 'numeric'
                });
            });
        });
        return results;
    }

    function getEmployeeTaskEntries(employeeId = '', dateKey = '') {
        const entries = state.employeeTaskEntries.get(getTaskEntryCacheKey(employeeId, dateKey)) || [];
        const normalizedDateKey = String(dateKey || '').slice(0, 10);
        return (Array.isArray(entries) ? entries : []).filter((entry) => (
            !normalizedDateKey || getEntryDateKey(entry) === normalizedDateKey
        ));
    }

    function getEntryDateKey(entry = {}) {
        return String(entry.dateKey || entry.date || '').slice(0, 10);
    }

    function buildTaskCompletionLookup(entries = []) {
        const lookup = { ids: new Set(), names: new Set() };
        (Array.isArray(entries) ? entries : []).forEach((entry) => {
            (Array.isArray(entry?.taskResults) ? entry.taskResults : []).forEach((task) => {
                const id = String(task?.id || task?.taskId || '').trim();
                const name = String(task?.name || task?.taskName || '').trim();
                const inputType = task?.inputType || task?.input_type || 'numeric';
                if (id) lookup.ids.add(id);
                if (name) lookup.names.add(getTaskNameKey(name, inputType));
            });
        });
        return lookup;
    }

    function getTaskCompletionStatus(task = {}, completedLookup = null) {
        if (!completedLookup) {
            return 'incomplete';
        }
        const id = String(task?.id || '').trim();
        const name = String(task?.name || task?.taskName || '').trim();
        const inputType = task?.inputType || task?.input_type || 'numeric';
        if (id && completedLookup.ids.has(id)) {
            return 'complete';
        }
        if (name && completedLookup.names.has(getTaskNameKey(name, inputType))) {
            return 'complete';
        }
        return 'incomplete';
    }

    function getTaskNameKey(name = '', inputType = '') {
        return `${String(name || '').trim().toLowerCase()}:${String(inputType || 'numeric').trim().toLowerCase()}`;
    }

    function isSpecificTask(task = {}) {
        return Boolean(task?.isCustom || task?.is_custom || task?.custom);
    }

    function isInitiativeTask(task = {}) {
        const category = String(task?.category || task?.taskCategory || task?.task_category || task?.source || '').trim().toLowerCase();
        return Boolean(task?.isInitiative || task?.is_initiative || task?.initiative || category === 'initiative');
    }

    function toggleRecordGroup(groupKey = '') {
        const key = String(groupKey || '');
        if (!key) return;
        if (state.expandedGroups.has(key)) {
            state.expandedGroups.delete(key);
        } else {
            state.expandedGroups.add(key);
        }
        renderRecords();
    }

    async function openTaskModal(groupKey = '') {
        const group = findRecordGroup(groupKey);
        if (!group || !refs.taskModal || !refs.taskModalBody) {
            return;
        }
        state.selectedTaskGroupKey = group.key;
        refs.taskModal.classList.add('open');
        refs.taskModal.setAttribute('aria-hidden', 'false');
        renderTaskModal(group);
        await loadEmployeeTaskEntries(group);
    }

    function renderTaskModal(group) {
        if (!refs.taskModalBody) {
            return;
        }
        const dateKey = getGroupDateKey(group);
        const employeeName = group.evaluatorName || group.evaluatorEmployeeId || 'Employee';
        if (refs.taskModalTitle) {
            refs.taskModalTitle.textContent = `${employeeName} Tasks`;
        }
        if (refs.taskModalSubtitle) {
            refs.taskModalSubtitle.textContent = dateKey
                ? `KPI record date: ${dateKey}`
                : 'KPI task record';
        }
        refs.taskModalBody.innerHTML = renderTaskDetailsTable(group);
    }

    function closeTaskModal() {
        state.selectedTaskGroupKey = '';
        refs.taskModal?.classList.remove('open');
        refs.taskModal?.setAttribute('aria-hidden', 'true');
    }

    function openAdminEvaluationContextMenu(groupKey = '', clientX = 0, clientY = 0) {
        const group = findRecordGroup(groupKey);
        if (!group || !refs.adminEvaluationContextMenu || !refs.adminEvaluationContextAction) {
            return;
        }
        state.contextAdminEvaluationGroupKey = group.key;
        refs.adminEvaluationContextAction.textContent = 'Evaluation';
        refs.adminEvaluationContextMenu.hidden = false;
        refs.adminEvaluationContextMenu.style.left = '0px';
        refs.adminEvaluationContextMenu.style.top = '0px';
        const menuRect = refs.adminEvaluationContextMenu.getBoundingClientRect();
        const left = Math.max(8, Math.min(Number(clientX) || 0, window.innerWidth - menuRect.width - 8));
        const top = Math.max(8, Math.min(Number(clientY) || 0, window.innerHeight - menuRect.height - 8));
        refs.adminEvaluationContextMenu.style.left = `${left}px`;
        refs.adminEvaluationContextMenu.style.top = `${top}px`;
        refs.adminEvaluationContextAction.focus();
    }

    function closeAdminEvaluationContextMenu() {
        state.contextAdminEvaluationGroupKey = '';
        if (refs.adminEvaluationContextMenu) refs.adminEvaluationContextMenu.hidden = true;
    }

    function openAdminEvaluationModal(groupKey = '') {
        closeAdminEvaluationContextMenu();
        const group = findRecordGroup(groupKey);
        if (!group || !refs.adminEvaluationModal || !refs.adminEvaluationModalBody) {
            return;
        }
        state.selectedAdminEvaluationGroupKey = group.key;
        refs.adminEvaluationModal.classList.add('open');
        refs.adminEvaluationModal.setAttribute('aria-hidden', 'false');
        renderAdminEvaluationModal(group);
    }

    function renderAdminEvaluationModal(group = {}) {
        const employeeName = group.evaluatorName || group.evaluatorEmployeeId || 'Employee';
        const dateKey = getGroupDateKey(group);
        const existing = getAdminEvaluationForGroup(group);
        const adminLabel = scope === 'super' ? 'Super Admin' : 'Head Admin';
        if (refs.adminEvaluationModalTitle) refs.adminEvaluationModalTitle.textContent = `${employeeName} Evaluation`;
        if (refs.adminEvaluationModalSubtitle) {
            refs.adminEvaluationModalSubtitle.textContent = `${formatHistoryDate(dateKey)} - ${group.evaluatorEmployeeId}`;
        }
        if (refs.adminEvaluationSubmitBtn) {
            refs.adminEvaluationSubmitBtn.hidden = Boolean(existing) || !hasGroupTimeOut(group);
            refs.adminEvaluationSubmitBtn.disabled = false;
        }
        if (!hasGroupTimeOut(group)) {
            refs.adminEvaluationModalBody.innerHTML = `<div class="kpi-empty-row">${escapeHtml(employeeName)} has not completed Time Out for ${escapeHtml(formatHistoryDate(dateKey))}.</div>`;
            return;
        }
        if (existing) {
            refs.adminEvaluationModalBody.innerHTML = `
                <div class="kpi-detail-grid">
                  ${detailItem('Rating', `${existing.rating}/5 - ${existing.ratingLabel}`)}
                  ${detailItem('Date submitted', formatDateTime(existing.submittedAt))}
                </div>
                <div><p class="kpi-eyebrow">${adminLabel} comment</p><p class="kpi-detail-comment">${escapeHtml(existing.comment || 'No comment was submitted.')}</p></div>
                <div class="kpi-admin-evaluation-locked"><span class="kpi-pill kpi-pill--reviewed">Submitted</span><strong>${formatStars(existing.rating)}</strong></div>
            `;
            return;
        }
        refs.adminEvaluationModalBody.innerHTML = `
            <div class="kpi-admin-rating-panel">
              <p class="kpi-eyebrow">Rating</p>
              <input id="adminEvaluationRating" type="hidden" value="">
              <div class="kpi-admin-star-rating" role="radiogroup" aria-label="${adminLabel} employee rating">
                ${[1, 2, 3, 4, 5].map((rating) => `<button class="kpi-admin-star" type="button" data-admin-evaluation-rating="${rating}" role="radio" aria-checked="false" aria-label="${rating} star${rating === 1 ? '' : 's'}"><span aria-hidden="true">&#9733;</span><small>${rating}</small></button>`).join('')}
              </div>
            </div>
            <label class="kpi-admin-evaluation-field" for="adminEvaluationComment"><span>Comment</span><textarea class="kpi-review-note" id="adminEvaluationComment" maxlength="2000" placeholder="Optional comment"></textarea></label>
            <div class="kpi-admin-evaluation-status" id="adminEvaluationStatus" role="status"></div>
        `;
    }

    function selectAdminEvaluationRating(rating = 0) {
        if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !refs.adminEvaluationModalBody) return;
        const input = document.getElementById('adminEvaluationRating');
        if (input) input.value = String(rating);
        refs.adminEvaluationModalBody.querySelectorAll('[data-admin-evaluation-rating]').forEach((button) => {
            const buttonRating = Number(button.dataset.adminEvaluationRating || 0);
            button.classList.toggle('is-selected', buttonRating <= rating);
            button.setAttribute('aria-checked', buttonRating === rating ? 'true' : 'false');
        });
        setAdminEvaluationStatus('');
    }

    async function submitAdminEvaluation(event) {
        event.preventDefault();
        const group = findRecordGroup(state.selectedAdminEvaluationGroupKey);
        if (!group || !refs.adminEvaluationSubmitBtn) return;
        const rating = Number(document.getElementById('adminEvaluationRating')?.value || 0);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            setAdminEvaluationStatus('Select a rating from 1 to 5.', true);
            return;
        }
        const comment = String(document.getElementById('adminEvaluationComment')?.value || '').trim();
        refs.adminEvaluationSubmitBtn.disabled = true;
        setAdminEvaluationStatus('Submitting evaluation...');
        try {
            const payload = {
                ratedEmployeeId: group.evaluatorEmployeeId,
                dateKey: getGroupDateKey(group),
                rating,
                comment
            };
            if (scope === 'super') {
                await appClient.submitSuperKpiAdminEvaluation(state.companyId, payload);
            } else {
                await appClient.submitKpiAdminEvaluation(payload);
            }
            closeAdminEvaluationModal();
            await loadData({ bypassCache: true });
            const adminLabel = scope === 'super' ? 'Super Admin' : 'Head Admin';
            setPageStatus(`${group.evaluatorName || group.evaluatorEmployeeId} ${adminLabel} evaluation submitted.`);
        } catch (error) {
            console.error('Failed to submit Admin evaluation:', error);
            refs.adminEvaluationSubmitBtn.disabled = false;
            setAdminEvaluationStatus(error.message || 'Failed to submit the evaluation.', true);
        }
    }

    function setAdminEvaluationStatus(message = '', isError = false) {
        const status = document.getElementById('adminEvaluationStatus');
        if (!status) return;
        status.textContent = message;
        status.classList.toggle('is-error', Boolean(isError));
    }

    function closeAdminEvaluationModal() {
        state.selectedAdminEvaluationGroupKey = '';
        refs.adminEvaluationModal?.classList.remove('open');
        refs.adminEvaluationModal?.setAttribute('aria-hidden', 'true');
    }

    function findRecordGroup(groupKey = '') {
        const key = String(groupKey || '').trim();
        if (!key) return null;
        return buildEmployeeRecordGroups().find((group) => String(group.key) === key)
            || buildRecordGroups(state.filteredItems).find((group) => String(group.key) === key)
            || buildRecordGroups(state.items).find((group) => String(group.key) === key)
            || null;
    }

    async function loadEmployeeTaskEntries(group) {
        const normalizedId = String(group?.evaluatorEmployeeId || '').trim();
        const dateKey = getGroupDateKey(group);
        const cacheKey = getTaskEntryCacheKey(normalizedId, dateKey);
        if (!normalizedId || state.employeeTaskEntries.has(cacheKey) || state.loadingEmployeeTasks.has(cacheKey)) {
            return;
        }
        state.loadingEmployeeTasks.add(cacheKey);
        renderTaskModal(group);
        try {
            if (scope === 'super') {
                const entries = await appClient.getSuperUserCutoffTimeCard(state.companyId, normalizedId, { dateKey });
                state.employeeTaskEntries.set(cacheKey, Array.isArray(entries) ? entries.filter((entry) => getEntryDateKey(entry) === dateKey) : []);
            } else {
                const entry = await appClient.getTodayAttendanceRecord(normalizedId, { dateKey });
                state.employeeTaskEntries.set(cacheKey, entry ? [entry] : []);
            }
        } catch (error) {
            console.error('Failed to load employee task entries:', error);
            state.employeeTaskEntries.set(cacheKey, []);
        } finally {
            state.loadingEmployeeTasks.delete(cacheKey);
            const currentGroup = findRecordGroup(state.selectedTaskGroupKey);
            if (currentGroup) {
                renderTaskModal(currentGroup);
            }
            renderRecords();
        }
    }

    function getGroupDateKey(group = {}) {
        return String(group.dateKey || group.submittedAt || '').slice(0, 10);
    }

    function getTaskEntryCacheKey(employeeId = '', dateKey = '') {
        return `${String(employeeId || '').trim()}:${String(dateKey || '').slice(0, 10)}`;
    }

    function countGroupTypes(records = []) {
        const daily = records.filter((record) => record.evaluationType !== 'issue_encounter').length;
        const issue = records.length - daily;
        return [
            daily ? `${daily} daily` : '',
            issue ? `${issue} legacy` : ''
        ].filter(Boolean).join(' / ') || 'KPI data';
    }

    function getEmployeeKpiScore(employeeId = '', dateKey = '') {
        const normalizedId = String(employeeId || '').trim();
        const normalizedDateKey = String(dateKey || '').slice(0, 10);
        if (!normalizedId) return null;
        const scores = Array.isArray(state.summary?.dailyEmployeeScores)
            ? state.summary.dailyEmployeeScores
            : [];
        const employeeScore = scores.find((item) => String(item.employeeId || '').trim() === normalizedId);
        if (!employeeScore) return null;
        const currentPeriodDate = String(state.summary?.currentPeriod?.start || '').slice(0, 10);
        if (
            normalizedDateKey
            && normalizedDateKey === currentPeriodDate
            && employeeScore.kpiScorePercent !== null
            && employeeScore.kpiScorePercent !== undefined
        ) {
            const currentValue = Number(employeeScore.kpiScorePercent);
            return Number.isFinite(currentValue) ? normalizePercent(currentValue) : null;
        }
        const dailyScores = Array.isArray(employeeScore.dailyKpiScores) ? employeeScore.dailyKpiScores : [];
        const score = dailyScores.find((item) => String(item.dateKey || '') === normalizedDateKey);
        if (!score || score.kpiScorePercent === null || score.kpiScorePercent === undefined) return null;
        const value = Number(score.kpiScorePercent);
        return Number.isFinite(value) ? normalizePercent(value) : null;
    }

    function normalizePercent(value) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return 0;
        const clampedValue = Math.max(0, Math.min(100, numericValue));
        return Math.round((clampedValue + Number.EPSILON) * 100) / 100;
    }

    function getPercentToneClass(value) {
        const percent = normalizePercent(value);
        if (percent >= 75) return 'is-high';
        if (percent >= 50) return 'is-medium';
        return 'is-low';
    }

    function formatScorePercent(value) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return '0%';
        const roundedValue = Math.round((numericValue + Number.EPSILON) * 100) / 100;
        return `${roundedValue}%`;
    }

    function renderPercentChip(value) {
        const percent = normalizePercent(value);
        return `<span class="kpi-percent-chip ${getPercentToneClass(percent)}">${formatScorePercent(percent)}</span>`;
    }

    function renderClickablePercent(value, employeeId = '', dateKey = '') {
        const percent = normalizePercent(value);
        return `<button class="kpi-percent-button ${getPercentToneClass(percent)}" type="button" data-open-daily-score="${escapeHtml(employeeId)}" data-daily-score-date="${escapeHtml(dateKey)}" aria-label="View ${escapeHtml(dateKey)} Daily KPI Score breakdown">${formatScorePercent(percent)}</button>`;
    }

    function renderScoreHistoryButton(value, employeeId = '') {
        const percent = normalizePercent(value);
        return `<button class="kpi-percent-button ${getPercentToneClass(percent)}" type="button" data-open-score-history="${escapeHtml(employeeId)}" aria-label="Open Daily KPI Score History for ${escapeHtml(employeeId)}">${formatScorePercent(percent)}</button>`;
    }

    function renderHistoryScoreButton(score = {}) {
        if (score.isDayOff) {
            return '<span class="kpi-no-calculation">No KPI calculation record</span>';
        }
        const percent = normalizePercent(score.kpiScorePercent);
        return `<button class="kpi-percent-button ${getPercentToneClass(percent)}" type="button" data-open-history-score="${escapeHtml(score.dateKey || '')}" aria-label="View KPI breakdown for ${escapeHtml(score.dateKey || '')}">${formatScorePercent(percent)}</button>`;
    }

    function formatHistoryDate(dateKey = '') {
        const normalized = String(dateKey || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized || '-';
        const date = new Date(`${normalized}T00:00:00`);
        return Number.isNaN(date.getTime())
            ? normalized
            : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatGroupStatus(records = []) {
        const statuses = records.map((record) => String(record.status || 'submitted').trim().toLowerCase()).filter(Boolean);
        if (statuses.includes('flagged')) {
            return { label: 'Flagged', className: 'flagged' };
        }
        if (statuses.includes('reviewed')) {
            return { label: 'Reviewed', className: 'reviewed' };
        }
        return { label: '-', className: '' };
    }

    function formatStatusLabel(status = '') {
        const normalized = String(status || '').trim().toLowerCase();
        if (normalized === 'flagged') return 'Flagged';
        if (normalized === 'reviewed') return 'Reviewed';
        return normalized || '-';
    }

    function formatTaskInputType(value = '') {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized === 'checklist') return 'Checklist';
        if (normalized === 'text') return 'Text';
        return 'Numeric';
    }

    function formatStars(value) {
        const rating = Math.max(0, Math.min(5, Number(value || 0)));
        const filled = '<svg class="star-icon filled" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>';
        const empty = '<svg class="star-icon empty" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" opacity="0.3"></path></svg>';
        return filled.repeat(rating) + empty.repeat(Math.max(0, 5 - rating));
    }

    function eyeIconSvg() {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.25 12s3.5-6.25 9.75-6.25S21.75 12 21.75 12 18.25 18.25 12 18.25 2.25 12 2.25 12Z"></path><circle cx="12" cy="12" r="2.75"></circle></svg>';
    }

    function chevronDownIconSvg() {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>';
    }

    function populatePolicy() {
        if (scope !== 'tenant' || !refs.policyFrequency) return;
        refs.policyFrequency.value = state.settings.frequency || 'monthly';
        refs.policyMode.value = state.settings.mode || 'optional_issue_only';
        refs.policyCustomType.value = state.settings.customScheduleType || 'interval';
        refs.policyIntervalDays.value = String(state.settings.customIntervalDays || 15);
        refs.policyStartDate.value = state.settings.customStartDate || '';
        refs.policyEndDate.value = state.settings.customEndDate || '';
        refs.policyIssueCommentAll.checked = Boolean(state.settings.commentRequiredForAllIssueEncounters);
        if (refs.policyAllowEmployeeView) refs.policyAllowEmployeeView.checked = Boolean(state.settings.allowEmployeeView);
        refs.policyActive.checked = state.settings.active !== false;
        syncPolicyCustomFields();
    }

    function syncPolicyCustomFields() {
        const custom = refs.policyFrequency?.value === 'custom';
        const range = custom && refs.policyCustomType?.value === 'date_range';
        document.querySelectorAll('[data-custom-policy]').forEach((field) => field.hidden = !custom);
        document.querySelectorAll('[data-custom-interval]').forEach((field) => field.hidden = !custom || range);
        document.querySelectorAll('[data-custom-range]').forEach((field) => field.hidden = !range);
    }

    async function savePolicy() {
        if (scope !== 'tenant' || !refs.savePolicyBtn) return;
        refs.savePolicyBtn.disabled = true;
        setPolicyStatus('Saving evaluation policy...');
        try {
            state.settings = await appClient.updateKpiEvaluationSettings({
                frequency: refs.policyFrequency.value,
                mode: refs.policyMode.value,
                customScheduleType: refs.policyCustomType.value,
                customIntervalDays: Number(refs.policyIntervalDays.value || 15),
                customStartDate: refs.policyStartDate.value,
                customEndDate: refs.policyEndDate.value,
                commentRequiredForAllIssueEncounters: refs.policyIssueCommentAll.checked,
                active: refs.policyActive.checked
            });
            populatePolicy();
            setPolicyStatus('Evaluation policy saved.', false, true);
            await loadData();
        } catch (error) {
            console.error('Failed to save KPI evaluation policy:', error);
            setPolicyStatus(error.message || 'Failed to save evaluation policy.', true);
        } finally {
            refs.savePolicyBtn.disabled = false;
        }
    }

    async function openDetails(recordId) {
        state.selectedRecordId = String(recordId || '');
        if (!state.selectedRecordId || !refs.detailsModal || !refs.detailsBody) return;
        refs.detailsBody.innerHTML = renderLoadingBlock('Loading evaluation details');
        refs.detailsModal.classList.add('open');
        refs.detailsModal.setAttribute('aria-hidden', 'false');
        try {
            const record = scope === 'super'
                ? await appClient.getSuperKpiEvaluation(state.companyId, state.selectedRecordId)
                : await appClient.getKpiEvaluation(state.selectedRecordId);
            renderDetails(record);
        } catch (error) {
            console.error('Failed to load KPI evaluation details:', error);
            refs.detailsBody.innerHTML = `<div class="kpi-empty-row">${escapeHtml(error.message || 'Failed to load record.')}</div>`;
        }
    }

    function renderDetails(record) {
        const audit = Array.isArray(record.auditLog) ? record.auditLog : [];
        refs.detailsBody.innerHTML = `
            <div class="kpi-detail-grid">
              ${detailItem('Evaluator', `${record.evaluatorName} · ${record.evaluatorEmployeeId}`)}
              ${detailItem('Rated employee', `${record.ratedEmployeeName} · ${record.ratedEmployeeRole || record.ratedEmployeeId}`)}
              ${detailItem('Rating', `${record.rating}/5 · ${record.ratingLabel}`)}
              ${detailItem('Evaluation type', formatType(record.evaluationType))}
              ${detailItem('KPI record date', formatEvaluationDateTime(getRecordDateKey(record), record.submittedAt))}
              ${detailItem('Status', record.status)}
              ${detailItem('Reviewed by', record.reviewedByAdminId ? `${record.reviewedByAdminId} · ${formatDateTime(record.reviewedAt)}` : 'Not reviewed yet')}
            </div>
            <div><p class="kpi-eyebrow">Comment / reason</p><p class="kpi-detail-comment">${escapeHtml(record.comment || 'No optional comment was provided.')}</p></div>
            <div>
              <p class="kpi-eyebrow">Admin review</p>
              <textarea class="kpi-review-note" id="detailReviewNote" maxlength="1000" placeholder="Optional Admin comment and audit note"></textarea>
              <div class="kpi-review-actions" style="margin-top:9px;">
                <button class="kpi-button kpi-button--danger" type="button" data-review-status="flagged">Mark Flagged</button>
                <button class="kpi-button kpi-button--primary" type="button" data-review-status="reviewed">Mark Reviewed</button>
              </div>
            </div>
            <div><p class="kpi-eyebrow">Audit log</p><div class="kpi-audit-list">${audit.length ? audit.map((entry) => `<div class="kpi-audit-entry"><strong>${escapeHtml(formatAuditAction(entry.action))}</strong> · ${escapeHtml(entry.actorUserId || 'System')} · ${escapeHtml(formatDateTime(entry.createdAt))}${entry.note ? `<br>${escapeHtml(entry.note)}` : ''}${entry.previousStatus || entry.nextStatus ? `<br>${escapeHtml(`${entry.previousStatus || 'new'} → ${entry.nextStatus || '-'}`)}` : ''}</div>`).join('') : '<div class="kpi-audit-entry">No audit entries.</div>'}</div></div>
        `;
        refs.detailsBody.querySelectorAll('[data-review-status]').forEach((button) => {
            button.addEventListener('click', () => reviewRecord(record.id, button.dataset.reviewStatus));
        });
    }

    async function reviewRecord(recordId, status) {
        const buttons = Array.from(refs.detailsBody.querySelectorAll('[data-review-status]'));
        buttons.forEach((button) => button.disabled = true);
        const note = String(document.getElementById('detailReviewNote')?.value || '').trim();
        try {
            const record = await submitRecordReview(recordId, status, note);
            renderDetails(record);
            setPageStatus(`Evaluation marked ${status}.`);
        } catch (error) {
            console.error('Failed to review KPI evaluation:', error);
            setPageStatus(error.message || 'Failed to update review status.', true);
            buttons.forEach((button) => button.disabled = false);
        }
    }

    async function submitRecordReview(recordId, status, note = '') {
        const payload = { status, note };
        const record = scope === 'super'
            ? await appClient.reviewSuperKpiEvaluation(state.companyId, recordId, payload)
            : await appClient.reviewKpiEvaluation(recordId, payload);
        const index = state.items.findIndex((item) => item.id === record.id);
        if (index >= 0) state.items[index] = record;
        applyFilters();
        return record;
    }

    function closeDetails() {
        state.selectedRecordId = '';
        refs.detailsModal?.classList.remove('open');
        refs.detailsModal?.setAttribute('aria-hidden', 'true');
    }

    function exportCsv() {
        if (!state.filteredItems.length) {
            setPageStatus('No filtered KPI records are available to export.', true);
            return;
        }
        const rows = [
            ['Evaluator ID', 'Evaluator', 'Rated Employee ID', 'Rated Employee', 'Rating', 'Category', 'Comment', 'Type', 'Frequency', 'Period Start', 'Period End', 'Submitted At', 'Status', 'Reviewed By', 'Reviewed At'],
            ...state.filteredItems.map((record) => [
                record.evaluatorEmployeeId, record.evaluatorName, record.ratedEmployeeId, record.ratedEmployeeName,
                record.rating, record.ratingLabel, record.comment, formatType(record.evaluationType),
                formatFrequency(record.evaluationFrequency), record.evaluationPeriodStart, record.evaluationPeriodEnd,
                record.submittedAt, record.status, record.reviewedByAdminId, record.reviewedAt
            ])
        ];
        const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        const suffix = scope === 'super' ? `_${state.companyId || 'company'}` : '';
        link.href = URL.createObjectURL(blob);
        link.download = `kpi_evaluations${suffix}_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        setPageStatus(`${state.filteredItems.length} record${state.filteredItems.length === 1 ? '' : 's'} exported.`);
    }

    function detailItem(label, value) {
        return `<div class="kpi-detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '-')}</strong></div>`;
    }

    function csvCell(value) {
        return `"${String(value ?? '').replace(/"/g, '""')}"`;
    }

    function formatType(value) {
        if (value === 'issue_encounter') return 'Legacy KPI';
        if (value === 'admin_evaluation') return 'Admin Evaluation';
        return 'Daily KPI';
    }

    function formatFrequency(value) {
        const normalized = String(value || 'daily');
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }

    function formatPeriod(record) {
        const start = String(record.evaluationPeriodStart || '');
        const end = String(record.evaluationPeriodEnd || '');
        return start && end && start !== end ? `${start} – ${end}` : (start || end || '-');
    }

    function getRecordDateKey(record = {}) {
        const periodDate = String(record.evaluationPeriodStart || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(periodDate)) {
            return periodDate;
        }
        const submittedAt = String(record.submittedAt || '');
        const date = new Date(submittedAt);
        if (!Number.isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        return submittedAt.slice(0, 10);
    }

    function formatEvaluationDateTime(dateKey = '', submittedAt = '') {
        const normalizedDateKey = String(dateKey || '').slice(0, 10);
        const dateLabel = formatHistoryDate(normalizedDateKey);
        const submittedDate = new Date(String(submittedAt || ''));
        if (Number.isNaN(submittedDate.getTime())) {
            return dateLabel || String(submittedAt || '-');
        }
        const timeLabel = submittedDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        });
        return `${dateLabel}, ${timeLabel}`;
    }

    function formatDateTime(value) {
        if (!value) return '-';
        const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(String(value))
            ? String(value).replace(' ', 'T') + 'Z'
            : String(value);
        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    }

    function formatAuditAction(value) {
        return value === 'status_changed' ? 'Review status changed' : 'Evaluation submitted';
    }

    function escapeHtml(value) {
        return appClient.escapeHtml(String(value ?? ''));
    }

    function setPageStatus(message, isError = false) {
        if (!refs.pageStatus) return;
        refs.pageStatus.textContent = message || '';
        refs.pageStatus.classList.toggle('is-error', Boolean(isError));
    }

    function setPolicyStatus(message, isError = false, isSuccess = false) {
        if (!refs.policyStatus) return;
        refs.policyStatus.textContent = message || '';
        refs.policyStatus.classList.toggle('is-error', Boolean(isError));
        refs.policyStatus.classList.toggle('is-success', Boolean(isSuccess));
    }
})();
