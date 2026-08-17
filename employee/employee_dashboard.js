const appClient = window.appClient;
const timeCardBtn = document.getElementById('timeCardBtn');
const timeInOutBtn = document.getElementById('timeInOutBtn');
const incidentReportBtn = document.getElementById('incidentReportBtn');
const settingsBtn = document.getElementById('settingsBtn');
const featureAccessSection = document.getElementById('featureAccessSection');
const featureCards = document.getElementById('featureCards');
const dashboardKicker = document.getElementById('dashboardKicker');
const dashboardTitle = document.getElementById('dashboardTitle');
const dashboardCopy = document.getElementById('dashboardCopy');
const companyBadge = document.getElementById('companyBadge');
const userBadge = document.getElementById('userBadge');
const roleBadge = document.getElementById('roleBadge');
const heroDateLabel = document.getElementById('heroDateLabel');
const coreToolCount = document.getElementById('coreToolCount');
const featureCount = document.getElementById('featureCount');
const workspaceMode = document.getElementById('workspaceMode');
const featureAccessSummary = document.getElementById('featureAccessSummary');
const companyUpdatesCardBtn = document.getElementById('companyUpdatesCardBtn');
const bulletinSummary = document.getElementById('bulletinSummary');
const companyUpdatesPanel = document.getElementById('companyUpdatesPanel');
const companyUpdatesCloseBtn = document.getElementById('companyUpdatesCloseBtn');
const announcementTitle = document.getElementById('announcementTitle');
const announcementMessage = document.getElementById('announcementMessage');
const announcementMeta = document.getElementById('announcementMeta');
const announcementOpenBtn = document.getElementById('announcementOpenBtn');
const holidayList = document.getElementById('holidayList');
const employeeCalendarMonthLabel = document.getElementById('employeeCalendarMonthLabel');
const employeeCalendarPrevBtn = document.getElementById('employeeCalendarPrevBtn');
const employeeCalendarTodayBtn = document.getElementById('employeeCalendarTodayBtn');
const employeeCalendarNextBtn = document.getElementById('employeeCalendarNextBtn');
const employeeCalendarGrid = document.getElementById('employeeCalendarGrid');
const updatesModal = document.getElementById('updatesModal');
const updatesModalCloseBtn = document.getElementById('updatesModalCloseBtn');
const updatesModalEyebrow = document.getElementById('updatesModalEyebrow');
const updatesModalTitle = document.getElementById('updatesModalTitle');
const updatesModalMeta = document.getElementById('updatesModalMeta');
const updatesModalType = document.getElementById('updatesModalType');
const updatesModalBody = document.getElementById('updatesModalBody');
const lbcConfirmationBadge = document.getElementById('lbcConfirmationBadge');
const assignedBadge = document.getElementById('assignedBadge');
const incidentSubmissionModal = document.getElementById('incidentSubmissionModal');
const incidentSubmissionForm = document.getElementById('incidentSubmissionForm');
const incidentSubmissionCloseBtn = document.getElementById('incidentSubmissionCloseBtn');
const incidentSubmissionCancelBtn = document.getElementById('incidentSubmissionCancelBtn');
const incidentSubmissionSaveBtn = document.getElementById('incidentSubmissionSaveBtn');
const incidentSubmissionDate = document.getElementById('incidentSubmissionDate');
const incidentSubmissionDepartment = document.getElementById('incidentSubmissionDepartment');
const incidentSubmissionReason = document.getElementById('incidentSubmissionReason');
const incidentSubmissionAction = document.getElementById('incidentSubmissionAction');
const incidentSubmissionPreparedBy = document.getElementById('incidentSubmissionPreparedBy');
const incidentSubmissionStatus = document.getElementById('incidentSubmissionStatus');

const dashboardState = {
    bulletin: createEmptyBulletin(),
    calendarMonth: getMonthStartDate(getTodayKey()),
    selectedDate: getTodayKey(),
    modalRestoreFocus: null,
    companyUpdatesOpen: false,
    isLbcCollectionAssignee: false,
    incidentSubmitting: false,
    session: null
};

const FEATURE_UI_CONFIG = Object.freeze([
    {
        key: 'order_form',
        module: 'invoicing',
        label: 'Order Form',
        iconClass: 'fa-solid fa-file-invoice',
        description: 'Encode and manage customer orders.',
        path: '/head_admin/order_form.html'
    },
    {
        key: 'expenses',
        module: 'sales',
        label: 'Expenses',
        iconClass: 'fa-solid fa-wallet',
        description: 'Track expense and cash income entries.',
        path: '/head_admin/expenses.html'
    },
    {
        key: 'inventory',
        module: 'inventory',
        label: 'Inventory',
        iconClass: 'fa-solid fa-boxes-stacked',
        description: 'View current stock levels (read-only).',
        path: '/employee/inventory_stock.html'
    },
    {
        key: 'composite',
        module: 'inventory',
        label: 'Composite Items',
        iconClass: 'fa-solid fa-layer-group',
        description: 'Browse composite item references.',
        path: '/head_admin/composite_items.html'
    },
    {
        key: 'lbc_tracking',
        module: 'sales',
        label: 'LBC Tracking',
        iconClass: 'fa-solid fa-truck-fast',
        description: 'Update assigned LBC tracking records.',
        path: '/head_admin/lbc_tracking.html'
    },
    {
        key: 'sales_report',
        module: 'reports',
        label: 'Sales Report',
        iconClass: 'fa-solid fa-chart-column',
        description: 'Open the assigned Admin Sales Report dashboard.',
        path: '/head_admin/sales_report.html'
    },
    {
        key: 'lbc_collection_confirmation',
        module: 'sales',
        label: 'LBC Collection Confirmation',
        iconClass: 'fa-solid fa-clipboard-check',
        description: 'Confirm LBC collection for assigned records.',
        path: '/employee/LBCCC.html',
        requiresAssignment: true
    }
]);

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'employee' });
    if (!session) {
        return;
    }

    dashboardState.session = session;
    bindCoreCards();
    bindIncidentSubmissionModal();
    bindCompanyCalendarControls();

    const [bootstrap, bulletin] = await Promise.all([
        loadBootstrap(),
        loadCompanyBulletin()
    ]);
    await refreshLbcCollectionAssignment();
    renderWorkspaceOverview(session, bootstrap);
    renderCompanyBulletin(bulletin || bootstrap?.companyBulletin || null);
    await renderGrantedFeatureCards(session, bootstrap);
    bindLogoutListener();
    bindLbcConfirmationBadgeClick();
    bindVisibilityChangeListener(session, bootstrap);
}

function bindLbcConfirmationBadgeClick() {
    if (!lbcConfirmationBadge || lbcConfirmationBadge.dataset.boundClick === 'true') {
        return;
    }
    lbcConfirmationBadge.dataset.boundClick = 'true';
    lbcConfirmationBadge.style.cursor = 'pointer';
    lbcConfirmationBadge.title = 'Open LBC Collection Confirmation';
    lbcConfirmationBadge.addEventListener('click', () => {
        if (dashboardState.isLbcCollectionAssignee) {
            window.location.href = '/employee/LBCCC.html';
        }
    });
}

function bindVisibilityChangeListener(session, bootstrap) {
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            await refreshLbcCollectionAssignment();
            await renderGrantedFeatureCards(session, bootstrap);
        }
    });
}

async function refreshLbcCollectionAssignment() {
    try {
        const payload = await appClient.listLbcCollectionAssignees();
        dashboardState.isLbcCollectionAssignee = Boolean(payload?.isAssigned);
    } catch (error) {
        console.error('Failed to load LBC collection assignment:', error);
        dashboardState.isLbcCollectionAssignee = false;
    }
    updateAssignedBadge();
}

function updateAssignedBadge() {
    if (!assignedBadge) {
        return;
    }
    if (!dashboardState.isLbcCollectionAssignee) {
        assignedBadge.hidden = true;
        return;
    }
    assignedBadge.textContent = 'Assigned to confirm';
    assignedBadge.hidden = false;
}

async function loadBootstrap() {
    try {
        const bootstrap = await appClient.getBootstrap();
        appClient.applyBootstrapBrandTheme(bootstrap);
        return bootstrap || null;
    } catch (error) {
        console.error('Failed to load employee bootstrap:', error);
        return null;
    }
}

async function loadCompanyBulletin() {
    try {
        return await appClient.getCompanyBulletin();
    } catch (error) {
        console.error('Failed to load company bulletin for employee workspace:', error);
        return null;
    }
}

function isAttendanceOnlyWorkspace(bootstrap = null) {
    return appClient.getWorkspaceExperienceMode?.(bootstrap) === 'attendance_only';
}

function bindCoreCards() {
    if (companyUpdatesCardBtn) {
        companyUpdatesCardBtn.addEventListener('click', (event) => {
            dashboardState.modalRestoreFocus = event.currentTarget;
            dashboardState.companyUpdatesOpen = true;
            renderCompanyUpdatesPanelState();
        });
    }

    if (timeCardBtn) {
        timeCardBtn.addEventListener('click', () => {
            window.location.href = '/employee/time_card.html';
        });
    }

    if (timeInOutBtn) {
        timeInOutBtn.addEventListener('click', () => {
            window.location.href = '/employee/time_in_time_out.html';
        });
    }

    if (incidentReportBtn) {
        incidentReportBtn.addEventListener('click', (event) => {
            dashboardState.modalRestoreFocus = event.currentTarget;
            openIncidentSubmissionModal();
        });
        incidentReportBtn.dataset.boundClick = 'true';
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            window.location.href = '/employee/settings.html';
        });
    }

}

function bindIncidentSubmissionModal() {
    incidentSubmissionCloseBtn?.addEventListener('click', closeIncidentSubmissionModal);
    incidentSubmissionCancelBtn?.addEventListener('click', closeIncidentSubmissionModal);
    incidentSubmissionForm?.addEventListener('submit', submitIncidentReport);
    incidentSubmissionModal?.addEventListener('click', (event) => {
        if (event.target === incidentSubmissionModal) {
            closeIncidentSubmissionModal();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && incidentSubmissionModal && !incidentSubmissionModal.hidden) {
            closeIncidentSubmissionModal();
        }
    });
}

function openIncidentSubmissionModal() {
    if (!incidentSubmissionModal || !incidentSubmissionForm) {
        return;
    }
    incidentSubmissionForm.reset();
    incidentSubmissionDate.value = getTodayKey();
    incidentSubmissionPreparedBy.value = getIncidentPreparedByName();
    setIncidentSubmissionStatus('');
    incidentSubmissionModal.hidden = false;
    syncDashboardModalLock();
    window.setTimeout(() => incidentSubmissionDate?.focus(), 0);
}

function closeIncidentSubmissionModal() {
    if (!incidentSubmissionModal || dashboardState.incidentSubmitting) {
        return;
    }
    incidentSubmissionModal.hidden = true;
    syncDashboardModalLock();
    if (dashboardState.modalRestoreFocus instanceof HTMLElement) {
        dashboardState.modalRestoreFocus.focus();
    }
}

async function submitIncidentReport(event) {
    event.preventDefault();
    if (
        dashboardState.incidentSubmitting
        || !incidentSubmissionForm
        || !incidentSubmissionForm.reportValidity()
    ) {
        return;
    }

    setIncidentSubmitting(true);
    setIncidentSubmissionStatus('Submitting incident report...');
    try {
        await appClient.createIncidentReport({
            date: incidentSubmissionDate.value,
            department: incidentSubmissionDepartment.value.trim(),
            reasonIncident: incidentSubmissionReason.value.trim(),
            actionTaken: incidentSubmissionAction.value.trim(),
            preparedBy: incidentSubmissionPreparedBy.value.trim()
        });
        setIncidentSubmitting(false);
        closeIncidentSubmissionModal();
        showLbcCollectionToast('Incident report submitted for Admin review.');
    } catch (error) {
        setIncidentSubmissionStatus(
            error?.message || 'Failed to submit incident report.',
            true
        );
        setIncidentSubmitting(false);
    }
}

function setIncidentSubmitting(isSubmitting) {
    dashboardState.incidentSubmitting = Boolean(isSubmitting);
    if (incidentSubmissionSaveBtn) {
        incidentSubmissionSaveBtn.disabled = dashboardState.incidentSubmitting;
        const label = incidentSubmissionSaveBtn.querySelector('span');
        if (label) {
            label.textContent = dashboardState.incidentSubmitting ? 'Submitting...' : 'Submit Incident';
        }
    }
    [incidentSubmissionCloseBtn, incidentSubmissionCancelBtn].forEach((button) => {
        if (button) {
            button.disabled = dashboardState.incidentSubmitting;
        }
    });
}

function setIncidentSubmissionStatus(message = '', isError = false) {
    if (!incidentSubmissionStatus) {
        return;
    }
    incidentSubmissionStatus.textContent = message;
    incidentSubmissionStatus.classList.toggle('is-error', Boolean(isError));
}

function getIncidentPreparedByName() {
    const session = dashboardState.session || {};
    return String(
        session?.name
        || session?.display_name
        || session?.userName
        || session?.user?.name
        || session?.username
        || session?.id
        || ''
    ).trim();
}

function bindCompanyCalendarControls() {
    employeeCalendarPrevBtn?.addEventListener('click', () => {
        dashboardState.calendarMonth = shiftMonth(dashboardState.calendarMonth, -1);
        renderEmployeeCalendar();
    });

    employeeCalendarTodayBtn?.addEventListener('click', () => {
        const todayKey = dashboardState.bulletin.todayKey || getTodayKey();
        dashboardState.calendarMonth = getMonthStartDate(todayKey);
        dashboardState.selectedDate = todayKey;
        renderEmployeeCalendar();
    });

    employeeCalendarNextBtn?.addEventListener('click', () => {
        dashboardState.calendarMonth = shiftMonth(dashboardState.calendarMonth, 1);
        renderEmployeeCalendar();
    });

    employeeCalendarGrid?.addEventListener('click', (event) => {
        const button = event.target instanceof Element
            ? event.target.closest('button[data-date-key]')
            : null;
        if (!(button instanceof HTMLButtonElement)) {
            return;
        }

        const dateKey = normalizeDateKey(button.dataset.dateKey || '');
        if (!dateKey) {
            return;
        }

        dashboardState.selectedDate = dateKey;
        dashboardState.calendarMonth = getMonthStartDate(dateKey);
        renderEmployeeCalendar();
        dashboardState.modalRestoreFocus = button;
        openCalendarDateModal(dateKey);
    });

    announcementOpenBtn?.addEventListener('click', (event) => {
        dashboardState.modalRestoreFocus = event.currentTarget;
        openAnnouncementModal();
    });

    holidayList?.addEventListener('click', handleCalendarItemButtonClick);
    companyUpdatesPanel?.addEventListener('click', (event) => {
        const closeTrigger = event.target instanceof Element
            ? event.target.closest('[data-company-updates-close="true"]')
            : null;
        if (closeTrigger) {
            closeCompanyUpdatesPanel();
        }
    });
    companyUpdatesCloseBtn?.addEventListener('click', closeCompanyUpdatesPanel);
    updatesModal?.addEventListener('click', (event) => {
        const closeTrigger = event.target instanceof Element
            ? event.target.closest('[data-modal-close="true"]')
            : null;
        if (closeTrigger) {
            closeUpdatesModal();
        }
    });
    updatesModalCloseBtn?.addEventListener('click', closeUpdatesModal);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && updatesModal && !updatesModal.hidden) {
            closeUpdatesModal();
            return;
        }

        if (event.key === 'Escape' && dashboardState.companyUpdatesOpen) {
            closeCompanyUpdatesPanel();
        }
    });
}

function renderCompanyUpdatesPanelState() {
    if (companyUpdatesPanel) {
        companyUpdatesPanel.hidden = !dashboardState.companyUpdatesOpen;
    }
    syncDashboardModalLock();
}

function closeCompanyUpdatesPanel() {
    dashboardState.companyUpdatesOpen = false;
    renderCompanyUpdatesPanelState();
    if (dashboardState.modalRestoreFocus instanceof HTMLElement) {
        dashboardState.modalRestoreFocus.focus();
    }
}

function renderWorkspaceOverview(session, bootstrap) {
    const normalizedRole = String(session?.role || '').trim().toLowerCase();
    const isStaffUser = normalizedRole === 'staff';
    const roleLabel = isStaffUser ? 'Staff' : 'Employee';
    const companyName = String(bootstrap?.company?.name || '').trim() || 'Your company';
    const activeModules = Object.values(bootstrap?.modules || {}).filter(Boolean).length;
    const attendanceOnlyMode = isAttendanceOnlyWorkspace(bootstrap);

    if (dashboardKicker) {
        dashboardKicker.textContent = attendanceOnlyMode
            ? 'Attendance Workspace'
            : (isStaffUser ? 'Shared Staff Workspace' : 'Personal Employee Workspace');
    }
    if (dashboardTitle) {
        dashboardTitle.textContent = attendanceOnlyMode
            ? 'Attendance Workspace'
            : (isStaffUser ? 'Staff Workspace' : 'Employee Workspace');
    }
    if (dashboardCopy) {
        dashboardCopy.textContent = attendanceOnlyMode
            ? 'Use Time Card, Time In / Out, Incident Report, and account settings while the rest of the workspace stays streamlined.'
            : (isStaffUser
                ? 'Move between operational tools faster with a clearer layout that stays readable on phones, tablets, and desktop screens.'
                : 'Keep your attendance, records, and account details in one cleaner workspace built for both desktop and mobile use.');
    }
    if (companyBadge) {
        companyBadge.textContent = companyName;
    }
    if (userBadge) {
        userBadge.textContent = session?.userName ? `Signed in as ${session.userName}` : 'Signed in';
    }
    if (roleBadge) {
        roleBadge.textContent = `${roleLabel} access`;
    }
    if (heroDateLabel) {
        heroDateLabel.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric'
        });
    }
    if (coreToolCount) {
        coreToolCount.textContent = '5';
    }
    if (workspaceMode) {
        workspaceMode.textContent = attendanceOnlyMode ? 'Attendance Only' : (isStaffUser ? 'Collaborative' : 'Focused');
    }

    document.title = `${roleLabel} Workspace`;

    if (attendanceOnlyMode) {
        featureAccessSection.hidden = true;
        if (featureCount) {
            featureCount.textContent = '0';
        }
        return;
    }

    if (activeModules && dashboardCopy) {
        dashboardCopy.textContent = `${dashboardCopy.textContent} ${activeModules} plan modules are active for this tenant.`;
    }
}

function renderCompanyBulletin(bulletin = null) {
    dashboardState.bulletin = normalizeBulletin(bulletin);
    const announcement = dashboardState.bulletin.activeAnnouncement || null;
    const upcomingItems = dashboardState.bulletin.upcomingItems.slice(0, 4);
    const todayItems = dashboardState.bulletin.todayItems;
    const defaultSelectedDate = dashboardState.selectedDate && normalizeDateKey(dashboardState.selectedDate)
        ? normalizeDateKey(dashboardState.selectedDate)
        : (dashboardState.bulletin.todayKey || getTodayKey());

    dashboardState.selectedDate = defaultSelectedDate;
    dashboardState.calendarMonth = getMonthStartDate(
        dashboardState.selectedDate || dashboardState.bulletin.todayKey || getTodayKey()
    );

    if (bulletinSummary) {
        const itemCount = upcomingItems.length;
        const announcementLabel = announcement
            ? '1 announcement'
            : 'No active announcement';
        const todayLabel = todayItems.length
            ? `${todayItems.length} today`
            : 'No item today';
        bulletinSummary.textContent = `Open holidays, events, and company announcements. ${announcementLabel} | ${todayLabel} | ${itemCount} upcoming.`;
    }

    if (announcementTitle) {
        announcementTitle.textContent = announcement
            ? announcement.title
            : 'No active announcement yet.';
    }
    if (announcementMessage) {
        announcementMessage.textContent = announcement
            ? summarizeText(announcement.message, 120)
            : 'Company-wide notices from head admin will appear here.';
    }
    if (announcementMeta) {
        announcementMeta.textContent = announcement
            ? buildAnnouncementWindowLabel(announcement)
            : 'Waiting for company notice';
    }
    if (announcementOpenBtn) {
        announcementOpenBtn.hidden = !announcement;
        announcementOpenBtn.disabled = !announcement;
    }

    renderCompanyUpdatesPanelState();

    if (!holidayList) {
        renderEmployeeCalendar();
        return;
    }

    if (!upcomingItems.length) {
        holidayList.innerHTML = '<div class="holiday-empty">No upcoming company calendar item has been posted yet.</div>';
        renderEmployeeCalendar();
        return;
    }

    holidayList.innerHTML = `
        <div class="notice-list">
          ${upcomingItems.map((holiday) => buildCompactItemButton(holiday)).join('')}
        </div>
    `;

    renderEmployeeCalendar();
}

function renderEmployeeCalendar() {
    if (!employeeCalendarGrid || !employeeCalendarMonthLabel) {
        return;
    }

    const monthStart = getMonthStartDate(dashboardState.calendarMonth);
    const monthStartDay = monthStart.getDay();
    const calendarStart = addDays(monthStart, -monthStartDay);
    const selectedDate = normalizeDateKey(dashboardState.selectedDate) || dashboardState.bulletin.todayKey || getTodayKey();
    const todayKey = dashboardState.bulletin.todayKey || getTodayKey();
    const itemsByDate = buildItemsByDateMap(dashboardState.bulletin.calendarItems);
    const cells = [];

    for (let index = 0; index < 42; index += 1) {
        const currentDate = addDays(calendarStart, index);
        const dateKey = toDateKey(currentDate);
        const itemDots = itemsByDate.get(dateKey) || [];
        const inShownMonth = currentDate.getMonth() === monthStart.getMonth();

        cells.push(`
            <button
              type="button"
              class="company-calendar-day${inShownMonth ? '' : ' is-outside'}${dateKey === todayKey ? ' is-today' : ''}${dateKey === selectedDate ? ' is-selected' : ''}"
              data-date-key="${dateKey}"
              aria-label="${appClient.escapeHtml(formatDisplayDate(dateKey))}"
            >
              <span class="company-calendar-day-number">${currentDate.getDate()}</span>
              <span class="company-calendar-dots">${renderCalendarDots(itemDots)}</span>
            </button>
        `);
    }

    employeeCalendarMonthLabel.textContent = formatMonthLabel(monthStart);
    employeeCalendarGrid.innerHTML = cells.join('');
}

function renderCalendarDots(dotTypes = []) {
    if (!Array.isArray(dotTypes) || !dotTypes.length) {
        return '';
    }

    return dotTypes.slice(0, 3).map((type) => {
        return `<span class="company-calendar-dot ${getCalendarDotClass(type)}"></span>`;
    }).join('');
}

function buildCompactItemButton(item = null) {
    if (!item) {
        return '';
    }

    const typeMeta = getHolidayTypeMeta(item.type);
    return `
        <button type="button" class="notice-button" data-calendar-item-id="${appClient.escapeHtml(item.id)}">
          <span class="notice-button-meta">${appClient.escapeHtml(buildCalendarItemMeta(item) || 'No date')}</span>
          <span class="notice-button-row">
            <span class="notice-button-title">${appClient.escapeHtml(item.name)}</span>
            <span class="holiday-type ${typeMeta.className}">${appClient.escapeHtml(typeMeta.label)}</span>
          </span>
        </button>
    `;
}

function handleCalendarItemButtonClick(event) {
    const button = event.target instanceof Element
        ? event.target.closest('button[data-calendar-item-id]')
        : null;
    if (!(button instanceof HTMLButtonElement)) {
        return;
    }

    dashboardState.modalRestoreFocus = button;
    openCalendarItemModal(String(button.dataset.calendarItemId || '').trim());
}

function openAnnouncementModal() {
    const announcement = dashboardState.bulletin.activeAnnouncement || dashboardState.bulletin.announcement;
    if (!announcement) {
        return;
    }

    openUpdatesModal({
        eyebrow: 'Company Announcement',
        title: announcement.title || 'Company Announcement',
        meta: buildAnnouncementWindowLabel(announcement),
        body: announcement.message || 'No announcement body provided.',
        typeLabel: 'Announcement',
        typeClassName: 'is-announcement'
    });
}

function openCalendarItemModal(itemId = '') {
    const item = dashboardState.bulletin.calendarItems.find((entry) => entry.id === itemId);
    if (!item) {
        return;
    }

    const typeMeta = getHolidayTypeMeta(item.type);
    openUpdatesModal({
        eyebrow: 'Company Calendar Item',
        title: item.name,
        meta: buildCalendarItemMeta(item),
        body: item.note || 'No extra details provided.',
        typeLabel: typeMeta.label,
        typeClassName: typeMeta.className || 'is-regular'
    });
}

function openCalendarDateModal(dateKey = '') {
    const normalizedDate = normalizeDateKey(dateKey);
    if (!normalizedDate) {
        return;
    }

    const selectedItems = dashboardState.bulletin.calendarItems.filter((item) => doesItemCoverDate(item, normalizedDate));
    if (!selectedItems.length) {
        openUpdatesModal({
            eyebrow: 'Company Calendar',
            title: formatDisplayDate(normalizedDate),
            meta: 'No company notice scheduled',
            body: 'Walang holiday, event, o company news na nakaschedule sa araw na ito.',
            typeLabel: '',
            typeClassName: ''
        });
        return;
    }

    const body = selectedItems.map((item) => {
        const typeMeta = getHolidayTypeMeta(item.type);
        return [
            `${typeMeta.label}: ${item.name}`,
            buildCalendarItemMeta(item),
            item.note || 'No extra details provided.'
        ].filter(Boolean).join('\n');
    }).join('\n\n');

    openUpdatesModal({
        eyebrow: 'Company Calendar',
        title: formatDisplayDate(normalizedDate),
        meta: `${selectedItems.length} notice${selectedItems.length === 1 ? '' : 's'} on this date`,
        body,
        typeLabel: '',
        typeClassName: ''
    });
}

function openUpdatesModal({ eyebrow = 'Details', title = '', meta = '', body = '', typeLabel = '', typeClassName = '' } = {}) {
    if (!updatesModal || !updatesModalTitle || !updatesModalBody) {
        return;
    }

    if (updatesModalEyebrow) {
        updatesModalEyebrow.textContent = eyebrow;
    }
    updatesModalTitle.textContent = title || 'Company Update';
    if (updatesModalMeta) {
        updatesModalMeta.textContent = meta || 'No extra schedule info';
    }
    updatesModalBody.textContent = body || 'No details provided.';

    if (updatesModalType) {
        updatesModalType.hidden = !typeLabel;
        updatesModalType.className = `updates-modal-type${typeClassName ? ` ${typeClassName}` : ''}`;
        updatesModalType.textContent = typeLabel;
    }

    updatesModal.hidden = false;
    syncDashboardModalLock();
    updatesModalCloseBtn?.focus();
}

function closeUpdatesModal() {
    if (!updatesModal) {
        return;
    }

    updatesModal.hidden = true;
    syncDashboardModalLock();
    if (dashboardState.modalRestoreFocus instanceof HTMLElement) {
        dashboardState.modalRestoreFocus.focus();
    }
}

function syncDashboardModalLock() {
    const shouldLock = Boolean(
        (updatesModal && !updatesModal.hidden)
        || (incidentSubmissionModal && !incidentSubmissionModal.hidden)
        || dashboardState.companyUpdatesOpen
    );

    document.body.classList.toggle('is-modal-open', shouldLock);
}

function buildItemsByDateMap(items = []) {
    const itemsByDate = new Map();

    items.forEach((item) => {
        eachDateInRange(item.startDate, item.endDate, (dateKey) => {
            const existingTypes = itemsByDate.get(dateKey) || [];
            if (!existingTypes.includes(item.type)) {
                existingTypes.push(item.type);
            }
            itemsByDate.set(dateKey, existingTypes);
        });
    });

    return itemsByDate;
}

async function renderGrantedFeatureCards(session, bootstrap = null) {
    if (!featureAccessSection || !featureCards) {
        return;
    }

    featureCards.innerHTML = '';
    featureAccessSection.hidden = true;
    if (featureCount) {
        featureCount.textContent = '0';
    }

    try {
        const modules = (bootstrap && typeof bootstrap.modules === 'object' && !Array.isArray(bootstrap.modules))
            ? bootstrap.modules
            : {};
        const featureAccess = appClient.normalizeUserFeatureAccess(
            bootstrap?.user?.feature_access || session?.feature_access || {}
        );

        const allowedCards = FEATURE_UI_CONFIG.filter((item) => {
            if (!modules[item.module]) {
                return false;
            }
            // Assignment-gated tools (e.g. LBC Collection Confirmation) show only for the assigned employee.
            if (item.requiresAssignment) {
                return Boolean(dashboardState.isLbcCollectionAssignee);
            }
            return Boolean(featureAccess[item.key]);
        });

        const hasLbcConfirmationAccess = allowedCards.some((card) => card.key === 'lbc_collection_confirmation');
        if (lbcConfirmationBadge) {
            lbcConfirmationBadge.hidden = !hasLbcConfirmationAccess;
        }

        if (!allowedCards.length) {
            return;
        }

        const normalizedRole = String(session?.role || '').trim().toLowerCase();
        const isStaffUser = normalizedRole === 'staff';

        featureCards.innerHTML = allowedCards.map((item) => {
            const isInventoryCard = item.key === 'inventory';
            const targetPath = isInventoryCard && isStaffUser
                ? '/head_admin/inventory_levels.html'
                : (item.path || '');
            const description = isInventoryCard && isStaffUser
                ? 'View and update current stock levels.'
                : item.description;
            const title = item.label;
            const openModal = item.openModal || '';
            const modalAttr = openModal
                ? ` data-open-modal="${appClient.escapeHtml(openModal)}"`
                : '';
            const pathAttr = targetPath
                ? ` data-target-path="${appClient.escapeHtml(targetPath)}"`
                : '';

            return `
                <button type="button" class="action-card feature-card"${pathAttr}${modalAttr}>
                  <span class="action-icon"><i class="${item.iconClass}"></i></span>
                  <h3 class="action-title">${title}</h3>
                  <p class="action-copy">${description}</p>
                  <div class="action-footer">
                    <span>${openModal ? 'Open confirmation' : 'Open module'}</span>
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                  </div>
                </button>
            `;
        }).join('');

        Array.from(featureCards.querySelectorAll('button.feature-card')).forEach((button) => {
            button.addEventListener('click', () => {
                const modalKey = button.dataset.openModal || '';
                if (modalKey === 'lbc_collection_confirmation') {
                    openLbcCollectionModal();
                    return;
                }
                const targetPath = button.dataset.targetPath || '';
                if (targetPath) {
                    window.location.href = targetPath;
                }
            });
        });

        if (featureCount) {
            featureCount.textContent = String(allowedCards.length);
        }
        if (featureAccessSummary) {
            featureAccessSummary.innerHTML = `<i class="fa-solid fa-key"></i> ${allowedCards.length} extra tool${allowedCards.length === 1 ? '' : 's'}`;
        }
        featureAccessSection.hidden = false;
    } catch (error) {
        console.error('Failed to render employee feature access cards:', error);
        if (featureCount) {
            featureCount.textContent = '0';
        }
    }
}

function bindLogoutListener() {
    window.addEventListener('message', async (event) => {
        if (event.data === 'logout') {
            await appClient.clearSession();
            appClient.redirectToLogin?.();
        }
    });
}

function createEmptyBulletin() {
    return {
        announcement: null,
        activeAnnouncement: null,
        calendarItems: [],
        upcomingItems: [],
        todayItems: [],
        todayKey: getTodayKey()
    };
}

function normalizeBulletin(value = null) {
    const source = (value && typeof value === 'object') ? value : {};
    const calendarItems = (Array.isArray(source.calendarItems) ? source.calendarItems : (
        Array.isArray(source.holidays) ? source.holidays : []
    ))
        .map((item) => normalizeCalendarItem(item))
        .filter(Boolean)
        .sort(compareCalendarItems);
    const todayKey = normalizeDateKey(source.todayKey || source.today_key || '') || getTodayKey();
    const announcement = normalizeAnnouncement(source.announcement || source.activeAnnouncement || null);
    const activeAnnouncement = announcement && !announcement.isExpired && !announcement.isScheduled
        ? announcement
        : null;

    return {
        announcement,
        activeAnnouncement,
        calendarItems,
        upcomingItems: calendarItems.filter((item) => item.endDate >= todayKey),
        todayItems: calendarItems.filter((item) => doesItemCoverDate(item, todayKey)),
        todayKey
    };
}

function normalizeAnnouncement(value = null) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const title = String(value.title || '').trim();
    const message = String(value.message || '').trim();
    if (!title && !message) {
        return null;
    }

    return {
        title: title || 'Company Announcement',
        message,
        startsOn: normalizeDateKey(value.starts_on || value.startsOn || ''),
        endsOn: normalizeDateKey(value.ends_on || value.endsOn || ''),
        windowLabel: String(value.window_label || value.windowLabel || '').trim(),
        isScheduled: Boolean(value.is_scheduled ?? value.isScheduled),
        isExpired: Boolean(value.is_expired ?? value.isExpired)
    };
}

function normalizeCalendarItem(value = null) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const name = String(value.name || value.title || '').trim();
    const startDate = normalizeDateKey(value.start_date || value.startDate || value.date || '');
    const endDate = normalizeDateKey(value.end_date || value.endDate || value.date || value.start_date || value.startDate || '');
    if (!name || !startDate) {
        return null;
    }

    return {
        id: String(value.id || '').trim() || buildCalendarItemId(name, startDate, endDate && endDate >= startDate ? endDate : startDate, value.type),
        name,
        note: String(value.note || value.description || '').trim(),
        type: String(value.type || '').trim().toLowerCase(),
        timeLabel: String(value.time_label || value.timeLabel || value.when || '').trim(),
        date: startDate,
        startDate,
        endDate: endDate && endDate >= startDate ? endDate : startDate
    };
}

function buildAnnouncementWindowLabel(announcement = null) {
    if (!announcement) {
        return '';
    }

    if (announcement.windowLabel) {
        return announcement.windowLabel;
    }

    if (announcement.startsOn && announcement.endsOn) {
        return `${formatDisplayDate(announcement.startsOn)} to ${formatDisplayDate(announcement.endsOn)}`;
    }

    if (announcement.startsOn) {
        return `Starts ${formatDisplayDate(announcement.startsOn)}`;
    }

    if (announcement.endsOn) {
        return `Until ${formatDisplayDate(announcement.endsOn)}`;
    }

    return 'Visible until cleared';
}

function getHolidayTypeMeta(type = '') {
    const normalizedType = String(type || '').trim().toLowerCase();
    if (normalizedType === 'news_update') {
        return { label: 'Company News', className: 'is-news' };
    }
    if (normalizedType === 'special_holiday') {
        return { label: 'Special Holiday', className: 'is-special' };
    }
    if (normalizedType === 'company_event') {
        return { label: 'Company Event', className: 'is-event' };
    }
    return { label: 'Regular Holiday', className: '' };
}

function getCalendarDotClass(type = '') {
    const normalizedType = String(type || '').trim().toLowerCase();
    if (normalizedType === 'company_event') {
        return 'is-event';
    }
    if (normalizedType === 'news_update') {
        return 'is-news';
    }
    return 'is-holiday';
}

function buildCalendarItemId(name = '', startDate = '', endDate = '', type = '') {
    return `${String(type || 'calendar').trim().toLowerCase()}-${String(startDate || '').trim()}-${String(endDate || '').trim()}-${String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function buildCalendarItemMeta(item = null) {
    if (!item) {
        return '';
    }

    return [
        formatRangeLabel(item.startDate || item.date || '', item.endDate || item.date || ''),
        String(item.timeLabel || item.time_label || '').trim()
    ].filter(Boolean).join(' | ');
}

function summarizeText(value = '', maxLength = 120) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) {
        return '';
    }

    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function formatRangeLabel(startDate = '', endDate = '') {
    const normalizedStartDate = normalizeDateKey(startDate);
    const normalizedEndDate = normalizeDateKey(endDate) || normalizedStartDate;
    if (!normalizedStartDate) {
        return 'No date';
    }

    if (normalizedStartDate === normalizedEndDate) {
        return formatDisplayDate(normalizedStartDate);
    }

    return `${formatDisplayDate(normalizedStartDate)} to ${formatDisplayDate(normalizedEndDate)}`;
}

function compareCalendarItems(first, second) {
    const startDiff = String(first.startDate || '').localeCompare(String(second.startDate || ''));
    if (startDiff !== 0) {
        return startDiff;
    }

    const endDiff = String(first.endDate || '').localeCompare(String(second.endDate || ''));
    if (endDiff !== 0) {
        return endDiff;
    }

    return String(first.name || '').localeCompare(String(second.name || ''));
}

function doesItemCoverDate(item = null, dateKey = '') {
    const normalizedDate = normalizeDateKey(dateKey);
    if (!item || !normalizedDate) {
        return false;
    }

    return normalizedDate >= String(item.startDate || item.date || '').trim()
        && normalizedDate <= String(item.endDate || item.date || item.startDate || '').trim();
}

function eachDateInRange(startDate = '', endDate = '', iteratee = () => {}) {
    const start = parseDateKey(startDate);
    const end = parseDateKey(endDate) || start;
    if (!start || !end) {
        return;
    }

    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
        iteratee(toDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
}

function normalizeDateKey(value = '') {
    const parsed = parseDateKey(value);
    return parsed ? toDateKey(parsed) : '';
}

function parseDateKey(value = '') {
    const text = String(value || '').trim();
    const exactMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!exactMatch) {
        return null;
    }

    const year = Number(exactMatch[1]);
    const month = Number(exactMatch[2]);
    const day = Number(exactMatch[3]);
    const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (
        Number.isNaN(parsed.getTime())
        || parsed.getFullYear() !== year
        || (parsed.getMonth() + 1) !== month
        || parsed.getDate() !== day
    ) {
        return null;
    }

    return parsed;
}

function formatDisplayDate(value = '') {
    const parsed = value instanceof Date
        ? value
        : parseDateKey(value);
    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
        const text = String(value || '').trim();
        if (!text) {
            return 'No date';
        }
        const fallback = new Date(text);
        if (Number.isNaN(fallback.getTime())) {
            return text;
        }
        return fallback.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    return parsed.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatMonthLabel(value = '') {
    const parsed = value instanceof Date
        ? value
        : parseDateKey(value);
    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
        return 'No date';
    }

    return parsed.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });
}

function getMonthStartDate(value = '') {
    const parsed = value instanceof Date
        ? value
        : parseDateKey(value);
    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0, 0);
    }

    return new Date(parsed.getFullYear(), parsed.getMonth(), 1, 12, 0, 0, 0);
}

function shiftMonth(value = '', offset = 0) {
    const baseDate = getMonthStartDate(value);
    return new Date(baseDate.getFullYear(), baseDate.getMonth() + Number(offset || 0), 1, 12, 0, 0, 0);
}

function addDays(value = '', days = 0) {
    const baseDate = value instanceof Date
        ? new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0)
        : parseDateKey(value);
    if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) {
        return new Date();
    }

    const nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + Number(days || 0));
    return nextDate;
}

function toDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getTodayKey() {
    return toDateKey(new Date());
}

function formatDate(dateValue) {
    if (!dateValue) return '-';
    try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) return '-';
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    } catch (e) {
        return String(dateValue);
    }
}

// LBC Collection Confirmation Modal Functions
const LBC_TRACKING_NUMBER_REGEX = /^[A-Za-z0-9]{1,12}$/;
const LBC_COLLECTION_FILTER_LABELS = Object.freeze({
    all: 'All Delivered',
    pending: 'Pending Confirmation',
    confirmed: 'Confirmed'
});

const lbcCollectionModal = document.getElementById('lbcCollectionModal');
const lbcCollectionModalBody = document.getElementById('lbcCollectionModalBody');
const lbcCollectionModalCloseBtn = document.getElementById('lbcCollectionModalCloseBtn');
const lbcCollectionModalCancelBtn = document.getElementById('lbcCollectionModalCancelBtn');

// LBC Collection Toolbar Elements
const lbcBranchButtons = document.getElementById('lbcBranchButtons');
const lbcDateScopeButtons = document.getElementById('lbcDateScopeButtons');
const lbcSearchInput = document.getElementById('lbcSearchInput');
const lbcSearchBtn = document.getElementById('lbcSearchBtn');
const lbcReloadBtn = document.getElementById('lbcReloadBtn');
const lbcRefreshTrackingBtn = document.getElementById('lbcRefreshTrackingBtn');
const lbcCollectionFilterButtons = document.getElementById('lbcCollectionFilterButtons');
const lbcCollectionScanInput = document.getElementById('lbcCollectionScanInput');
const lbcCollectionScanConfirmBtn = document.getElementById('lbcCollectionScanConfirmBtn');
const lbcCollectionScanStatus = document.getElementById('lbcCollectionScanStatus');
const lbcCollectionScanConfirmModal = document.getElementById('lbcCollectionScanConfirmModal');
const lbcScanConfirmModalTitle = document.getElementById('lbcScanConfirmModalTitle');
const lbcScanConfirmModalSubtitle = document.getElementById('lbcScanConfirmModalSubtitle');
const lbcScanConfirmModalDetails = document.getElementById('lbcScanConfirmModalDetails');
const lbcScanConfirmModalCancelBtn = document.getElementById('lbcScanConfirmModalCancelBtn');
const lbcScanConfirmModalConfirmBtn = document.getElementById('lbcScanConfirmModalConfirmBtn');

// LBC Collection Toolbar State
const lbcToolbarState = {
    branch: '',
    dateScope: 'all_dates',
    search: '',
    collectionStatus: 'all',
    scanPreview: null,
    scanModalOpen: false,
    scanBusy: false,
    closeHandlersBound: false,
    toolbarHandlersBound: false
};

function normalizeLbcCollectionFilter(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(LBC_COLLECTION_FILTER_LABELS, normalized)
        ? normalized
        : 'all';
}

function normalizeLbcText(value) {
    return String(value || '').trim();
}

function formatLbcAmount(value) {
    const numericValue = Number(value || 0);
    if (!Number.isFinite(numericValue)) {
        return '₱0.00';
    }
    return `₱${numericValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function setLbcCollectionScanStatus(message = '', isError = false) {
    if (!lbcCollectionScanStatus) {
        return;
    }
    const text = normalizeLbcText(message);
    if (!text) {
        lbcCollectionScanStatus.hidden = true;
        lbcCollectionScanStatus.textContent = '';
        lbcCollectionScanStatus.classList.remove('is-error', 'is-success');
        return;
    }
    lbcCollectionScanStatus.hidden = false;
    lbcCollectionScanStatus.textContent = text;
    lbcCollectionScanStatus.classList.toggle('is-error', Boolean(isError));
    lbcCollectionScanStatus.classList.toggle('is-success', !isError);
}

function focusLbcCollectionScanInput({ select = false } = {}) {
    if (!lbcCollectionScanInput || lbcCollectionModal?.hidden) {
        return;
    }
    try {
        lbcCollectionScanInput.focus({ preventScroll: true });
    } catch (_error) {
        lbcCollectionScanInput.focus();
    }
    if (select) {
        lbcCollectionScanInput.select();
    }
}

function openLbcCollectionModal() {
    if (!lbcCollectionModal) {
        return;
    }
    if (!dashboardState.isLbcCollectionAssignee) {
        showLbcCollectionToast('You are not assigned to confirm LBC collections.', 'error');
        return;
    }

    if (lbcCollectionModalBody) {
        lbcCollectionModalBody.innerHTML = `
            <div class="lbc-collection-loading">
                <i class="fa-solid fa-spinner fa-spin"></i> Loading assigned records...
            </div>
        `;
    }

    lbcCollectionModal.hidden = false;
    document.body.style.overflow = 'hidden';
    setLbcCollectionScanStatus('');
    loadLbcCollectionRecords();
    bindLbcCollectionModalCloseHandlers();
    bindLbcCollectionToolbarHandlers();
    focusLbcCollectionScanInput({ select: true });
}

function closeLbcCollectionModal() {
    if (!lbcCollectionModal) {
        return;
    }
    closeLbcCollectionScanConfirmModal({ clearPreview: true, restoreFocus: false });
    lbcCollectionModal.hidden = true;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleLbcCollectionEscapeKey);
}

function bindLbcCollectionModalCloseHandlers() {
    if (lbcToolbarState.closeHandlersBound) {
        document.addEventListener('keydown', handleLbcCollectionEscapeKey);
        return;
    }
    lbcToolbarState.closeHandlersBound = true;

    lbcCollectionModalCloseBtn?.addEventListener('click', closeLbcCollectionModal);
    lbcCollectionModalCancelBtn?.addEventListener('click', closeLbcCollectionModal);

    const backdrop = lbcCollectionModal?.querySelector('.lbc-collection-modal-backdrop');
    backdrop?.addEventListener('click', closeLbcCollectionModal);

    document.addEventListener('keydown', handleLbcCollectionEscapeKey);
}

function handleLbcCollectionEscapeKey(event) {
    if (event.key !== 'Escape') {
        return;
    }
    if (lbcToolbarState.scanModalOpen) {
        closeLbcCollectionScanConfirmModal();
        return;
    }
    if (lbcCollectionModal && !lbcCollectionModal.hidden) {
        closeLbcCollectionModal();
    }
}

function bindLbcCollectionToolbarHandlers() {
    if (lbcToolbarState.toolbarHandlersBound) {
        return;
    }
    lbcToolbarState.toolbarHandlersBound = true;

    lbcBranchButtons?.querySelectorAll('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            lbcBranchButtons?.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
            chip.classList.add('active');
            lbcToolbarState.branch = chip.dataset.branch || '';
            loadLbcCollectionRecords();
        });
    });

    lbcDateScopeButtons?.querySelectorAll('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            lbcDateScopeButtons?.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
            chip.classList.add('active');
            lbcToolbarState.dateScope = chip.dataset.dateScope || 'all_dates';
            loadLbcCollectionRecords();
        });
    });

    lbcCollectionFilterButtons?.querySelectorAll('[data-collection-filter]').forEach((chip) => {
        chip.addEventListener('click', () => {
            lbcCollectionFilterButtons.querySelectorAll('[data-collection-filter]').forEach((c) => c.classList.remove('active'));
            chip.classList.add('active');
            lbcToolbarState.collectionStatus = normalizeLbcCollectionFilter(chip.dataset.collectionFilter);
            loadLbcCollectionRecords();
        });
    });

    lbcSearchBtn?.addEventListener('click', () => {
        lbcToolbarState.search = lbcSearchInput?.value?.trim() || '';
        loadLbcCollectionRecords();
    });

    lbcSearchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            lbcToolbarState.search = lbcSearchInput.value?.trim() || '';
            loadLbcCollectionRecords();
        }
    });

    lbcReloadBtn?.addEventListener('click', () => {
        loadLbcCollectionRecords();
    });

    lbcRefreshTrackingBtn?.addEventListener('click', () => {
        loadLbcCollectionRecords();
    });

    lbcCollectionScanConfirmBtn?.addEventListener('click', () => {
        handleLbcCollectionScanConfirm();
    });

    lbcCollectionScanInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleLbcCollectionScanConfirm();
        }
    });

    lbcScanConfirmModalCancelBtn?.addEventListener('click', () => {
        closeLbcCollectionScanConfirmModal();
    });

    lbcScanConfirmModalConfirmBtn?.addEventListener('click', () => {
        handleLbcCollectionScanModalConfirm();
    });

    lbcCollectionScanConfirmModal?.querySelector('.lbc-scan-confirm-modal-backdrop')?.addEventListener('click', () => {
        closeLbcCollectionScanConfirmModal();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || !lbcToolbarState.scanModalOpen) {
            return;
        }
        if (event.target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName)) {
            if (event.target !== lbcScanConfirmModalConfirmBtn) {
                return;
            }
        }
        event.preventDefault();
        handleLbcCollectionScanModalConfirm();
    });
}

function getDateFromScope(dateScope) {
    if (dateScope === 'this_month') {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    return '';
}

async function loadLbcCollectionRecords() {
    try {
        if (!dashboardState.isLbcCollectionAssignee) {
            renderLbcCollectionEmpty('You are not assigned to confirm LBC collections.');
            return;
        }

        if (lbcCollectionModalBody) {
            lbcCollectionModalBody.innerHTML = `
                <div class="lbc-collection-loading">
                    <i class="fa-solid fa-spinner fa-spin"></i> Loading assigned records...
                </div>
            `;
        }

        const dateFrom = getDateFromScope(lbcToolbarState.dateScope);
        const response = await appClient.listLbcCollections({
            branch: lbcToolbarState.branch || '',
            search: lbcToolbarState.search || '',
            status: normalizeLbcCollectionFilter(lbcToolbarState.collectionStatus),
            dateFrom
        });

        const records = Array.isArray(response?.items) ? response.items : [];
        const summary = response?.summary && typeof response.summary === 'object'
            ? {
                pendingCount: Number(response.summary.pendingCount || 0),
                confirmedCount: Number(response.summary.confirmedCount || 0),
                pendingAmount: Number(response.summary.pendingAmount || 0),
                confirmedAmount: Number(response.summary.confirmedAmount || 0),
                pendingAmountDisplay: response.summary.pendingAmountDisplay || formatLbcAmount(response.summary.pendingAmount || 0),
                confirmedAmountDisplay: response.summary.confirmedAmountDisplay || formatLbcAmount(response.summary.confirmedAmount || 0)
            }
            : computeLbcCollectionSummary(records);

        renderLbcCollectionSummary(summary);

        if (records.length === 0) {
            const filterLabel = LBC_COLLECTION_FILTER_LABELS[normalizeLbcCollectionFilter(lbcToolbarState.collectionStatus)] || 'Delivered';
            if (lbcCollectionModalBody) {
                lbcCollectionModalBody.innerHTML = `
                    <div class="lbc-collection-empty">
                        <i class="fa-solid fa-inbox"></i>
                        <p>No ${appClient.escapeHtml(filterLabel.toLowerCase())} collection records found with current filters.</p>
                    </div>
                `;
            }
            return;
        }

        renderLbcCollectionRecords(records, { skipSummary: true });
    } catch (error) {
        console.error('Error loading LBC collection records:', error);
        renderLbcCollectionEmpty(error?.message || 'Error loading records. Please try again.');
    }
}

function openLbcCollectionScanConfirmModal(row = {}) {
    lbcToolbarState.scanPreview = row;
    lbcToolbarState.scanModalOpen = true;
    renderLbcCollectionScanConfirmModal();
    try {
        lbcScanConfirmModalConfirmBtn?.focus({ preventScroll: true });
    } catch (_error) {
        lbcScanConfirmModalConfirmBtn?.focus();
    }
}

function closeLbcCollectionScanConfirmModal({ clearPreview = true, restoreFocus = true } = {}) {
    lbcToolbarState.scanModalOpen = false;
    if (clearPreview) {
        lbcToolbarState.scanPreview = null;
    }
    renderLbcCollectionScanConfirmModal();
    if (restoreFocus) {
        focusLbcCollectionScanInput({ select: true });
    }
}

// LBC Collection Confirmation Page Functions (Next Page View)
function openLbcCollectionConfirmPage(row = {}) {
    lbcToolbarState.scanPreview = row;
    lbcToolbarState.scanModalOpen = true;
    renderLbcCollectionConfirmPage();
    // Focus the confirm button
    try {
        lbcConfirmPageConfirmBtn?.focus({ preventScroll: true });
    } catch (_error) {
        lbcConfirmPageConfirmBtn?.focus();
    }
}

function closeLbcCollectionConfirmPage() {
    lbcToolbarState.scanModalOpen = false;
    lbcToolbarState.scanPreview = null;
    renderLbcCollectionConfirmPage();
}

function renderLbcCollectionConfirmPage() {
    if (!lbcCollectionConfirmSection || !lbcConfirmPageDetails) {
        return;
    }
    const row = lbcToolbarState.scanPreview;
    const isOpen = Boolean(lbcToolbarState.scanModalOpen && row);
    
    if (!isOpen) {
        lbcCollectionConfirmSection.hidden = true;
        lbcConfirmPageDetails.innerHTML = '';
        return;
    }
    
    // Show the confirmation page
    lbcCollectionConfirmSection.hidden = false;
    
    // Set the title and subtitle
    const trackingNumber = normalizeLbcText(row.trackingNumber) || 'Scanned tracking';
    const clientName = normalizeLbcText(row.clientName) || 'this client';
    
    if (lbcConfirmPageTitle) {
        lbcConfirmPageTitle.textContent = `${trackingNumber} ready for confirmation`;
    }
    if (lbcConfirmPageTrackingTitle) {
        lbcConfirmPageTrackingTitle.textContent = trackingNumber;
    }
    if (lbcConfirmPageSubtitle) {
        lbcConfirmPageSubtitle.textContent = `Review ${clientName}'s delivery details below, then press Confirm to complete the collection.`;
    }
    
    // Build the details
    const details = [
        ['Client', normalizeLbcText(row.clientName) || '-'],
        ['Amount', formatLbcAmount(row.amountToCollect)],
        ['Date', row.saleDate ? formatDate(row.saleDate) : '-'],
        ['Tracking Number', normalizeLbcText(row.trackingNumber) || '-'],
        ['Order Number', normalizeLbcText(row.orderNumber || row.receiptNumber || row.orderKey) || '-'],
        ['Receipt Number', normalizeLbcText(row.receiptNumber || row.orderNumber || row.orderKey) || '-'],
        ['Branch', normalizeLbcText(row.branch) || '-'],
        ['Courier', normalizeLbcText(row.courier) || '-'],
        ['Payment Method', normalizeLbcText(row.paymentMethod) || '-'],
        ['Collection Status', normalizeLbcText(row.collectionStatus) || '-']
    ];
    
    lbcConfirmPageDetails.innerHTML = details.map(([label, value]) => `
        <div class="lbc-confirm-page-detail">
            <span class="lbc-confirm-page-label">${appClient.escapeHtml(label)}</span>
            <span class="lbc-confirm-page-value">${appClient.escapeHtml(value)}</span>
        </div>
    `).join('');
}

async function handleLbcCollectionPageConfirm() {
    if (!dashboardState.isLbcCollectionAssignee) {
        showLbcCollectionToast('You are not assigned to confirm LBC collections.', 'error');
        return;
    }
    if (lbcToolbarState.scanBusy || !lbcToolbarState.scanPreview) {
        return;
    }
    
    const row = lbcToolbarState.scanPreview;
    const normalizedOrderKey = String(row.orderKey || '').trim();
    const normalizedTrackingEntryId = String(row.trackingEntryId || '').trim();
    
    // Disable button while processing
    if (lbcConfirmPageConfirmBtn) {
        lbcConfirmPageConfirmBtn.disabled = true;
        lbcConfirmPageConfirmBtn.textContent = 'Processing...';
    }
    
    try {
        // Call the API to confirm collection
        const updated = await appClient.confirmLbcCollection(normalizedOrderKey, {
            status: 'Confirmed',
            trackingEntryId: normalizedTrackingEntryId
        });
        
        // Close the confirmation page
        closeLbcCollectionConfirmPage();
        
        // Reload records to reflect updated state
        await loadLbcCollectionRecords();
        
        const orderLabel = updated?.orderNumber || updated?.receiptNumber || normalizedOrderKey;
        const targetLabel = row.trackingNumber || orderLabel;
        showLbcCollectionToast(`Collection confirmed for ${targetLabel}.`);
        
    } catch (error) {
        console.error('Error confirming collection:', error);
        // Re-enable button
        if (lbcConfirmPageConfirmBtn) {
            lbcConfirmPageConfirmBtn.disabled = false;
            lbcConfirmPageConfirmBtn.textContent = 'Confirm Collection';
        }
        showLbcCollectionToast(error.message || 'Error confirming collection. Please try again.', 'error');
    }
}

function renderLbcCollectionScanConfirmModal() {
    if (!lbcCollectionScanConfirmModal || !lbcScanConfirmModalDetails) {
        return;
    }
    const row = lbcToolbarState.scanPreview;
    const isOpen = Boolean(lbcToolbarState.scanModalOpen && row);
    lbcCollectionScanConfirmModal.hidden = !isOpen;
    lbcCollectionScanConfirmModal.setAttribute('aria-hidden', String(!isOpen));
    if (!isOpen) {
        lbcScanConfirmModalDetails.innerHTML = '';
        return;
    }

    const trackingNumber = normalizeLbcText(row.trackingNumber) || 'Scanned tracking';
    const clientName = normalizeLbcText(row.clientName) || 'this client';
    if (lbcScanConfirmModalTitle) {
        lbcScanConfirmModalTitle.textContent = `${trackingNumber} ready for confirmation`;
    }
    if (lbcScanConfirmModalSubtitle) {
        lbcScanConfirmModalSubtitle.textContent = `Review ${clientName}'s delivery details below, then press Enter to confirm collection.`;
    }

    const details = [
        ['Client', normalizeLbcText(row.clientName) || '-'],
        ['Amount', formatLbcAmount(row.amountToCollect)],
        ['Date', row.saleDate ? formatDate(row.saleDate) : '-'],
        ['Tracking Number', normalizeLbcText(row.trackingNumber) || '-'],
        ['Order Number', normalizeLbcText(row.orderNumber || row.receiptNumber || row.orderKey) || '-'],
        ['Receipt Number', normalizeLbcText(row.receiptNumber || row.orderNumber || row.orderKey) || '-'],
        ['Branch', normalizeLbcText(row.branch) || '-'],
        ['Courier', normalizeLbcText(row.courier) || '-'],
        ['Payment Method', normalizeLbcText(row.paymentMethod) || '-'],
        ['Collection Status', normalizeLbcText(row.collectionStatus) || '-']
    ];

    lbcScanConfirmModalDetails.innerHTML = details.map(([label, value]) => `
        <article class="lbc-scan-confirm-modal-detail">
          <span class="lbc-scan-confirm-modal-label">${appClient.escapeHtml(label)}</span>
          <span class="lbc-scan-confirm-modal-value">${appClient.escapeHtml(value)}</span>
        </article>
    `).join('');
}

async function handleLbcCollectionScanConfirm() {
    if (!dashboardState.isLbcCollectionAssignee) {
        setLbcCollectionScanStatus('You are not assigned to confirm LBC collections.', true);
        return;
    }
    if (lbcToolbarState.scanBusy || lbcToolbarState.scanModalOpen) {
        return;
    }

    const trackingNumber = normalizeLbcText(lbcCollectionScanInput?.value).toUpperCase();
    if (!trackingNumber) {
        setLbcCollectionScanStatus('Tracking number is required for collection confirmation.', true);
        focusLbcCollectionScanInput({ select: true });
        return;
    }
    if (!LBC_TRACKING_NUMBER_REGEX.test(trackingNumber)) {
        setLbcCollectionScanStatus('Tracking number must be alphanumeric and up to 12 characters.', true);
        focusLbcCollectionScanInput({ select: true });
        return;
    }

    lbcToolbarState.scanBusy = true;
    if (lbcCollectionScanConfirmBtn) {
        lbcCollectionScanConfirmBtn.disabled = true;
        lbcCollectionScanConfirmBtn.textContent = 'Looking up...';
    }
    setLbcCollectionScanStatus(`Looking up delivered tracking ${trackingNumber}...`);

    try {
        const payload = await appClient.listLbcCollections({
            branch: lbcToolbarState.branch || '',
            search: trackingNumber,
            status: 'all',
            dateFrom: getDateFromScope(lbcToolbarState.dateScope)
        });
        const matches = (Array.isArray(payload?.items) ? payload.items : []).filter((row) =>
            normalizeLbcText(row.trackingNumber || '').toUpperCase() === trackingNumber
        );

        if (!matches.length) {
            setLbcCollectionScanStatus(`No delivered collection row found for ${trackingNumber} in the current branch/date scope.`, true);
            return;
        }

        const pendingMatches = matches.filter((row) => normalizeLbcText(row.collectionStatus).toLowerCase() !== 'confirmed');
        if (pendingMatches.length > 1 || (!pendingMatches.length && matches.length > 1)) {
            setLbcCollectionScanStatus(`Multiple delivered rows matched ${trackingNumber}. Confirm the correct row from the table.`, true);
            return;
        }

        const targetRow = pendingMatches[0] || matches[0];
        if (normalizeLbcText(targetRow.collectionStatus).toLowerCase() === 'confirmed') {
            setLbcCollectionScanStatus(`${trackingNumber} is already collection-confirmed.`);
            if (lbcCollectionScanInput) {
                lbcCollectionScanInput.value = '';
            }
            return;
        }

        const orderLookup = normalizeLbcText(targetRow.orderKey || targetRow.orderNumber || targetRow.receiptNumber);
        const trackingEntryId = normalizeLbcText(targetRow.trackingEntryId || '');
        if (!orderLookup || !trackingEntryId) {
            setLbcCollectionScanStatus(`Tracking ${trackingNumber} is missing confirmation metadata.`, true);
            return;
        }

        openLbcCollectionScanConfirmModal(targetRow);
        setLbcCollectionScanStatus(`Scanned ${trackingNumber}. Review the popup details, then confirm collection.`);
    } catch (error) {
        console.error('Failed to confirm collection by tracking scan:', error);
        setLbcCollectionScanStatus(error?.message || 'Failed to confirm collection by tracking.', true);
    } finally {
        lbcToolbarState.scanBusy = false;
        if (lbcCollectionScanConfirmBtn) {
            lbcCollectionScanConfirmBtn.disabled = false;
            lbcCollectionScanConfirmBtn.textContent = 'Confirm by Tracking';
        }
        if (!lbcToolbarState.scanModalOpen) {
            focusLbcCollectionScanInput({ select: true });
        }
    }
}

async function handleLbcCollectionScanModalConfirm() {
    const targetRow = lbcToolbarState.scanPreview;
    if (!targetRow || lbcToolbarState.scanBusy) {
        closeLbcCollectionScanConfirmModal();
        return;
    }

    const orderLookup = normalizeLbcText(targetRow.orderKey || targetRow.orderNumber || targetRow.receiptNumber);
    const trackingEntryId = normalizeLbcText(targetRow.trackingEntryId || '');
    const trackingNumber = normalizeLbcText(targetRow.trackingNumber || '');
    if (!orderLookup) {
        setLbcCollectionScanStatus('Order key is missing for collection confirmation.', true);
        closeLbcCollectionScanConfirmModal();
        return;
    }

    lbcToolbarState.scanBusy = true;
    if (lbcScanConfirmModalConfirmBtn) {
        lbcScanConfirmModalConfirmBtn.disabled = true;
        lbcScanConfirmModalConfirmBtn.textContent = 'Confirming...';
    }

    try {
        const updated = await appClient.confirmLbcCollection(orderLookup, {
            status: 'Confirmed',
            trackingEntryId
        });
        if (lbcCollectionScanInput) {
            lbcCollectionScanInput.value = '';
        }
        closeLbcCollectionScanConfirmModal({ clearPreview: true, restoreFocus: false });
        await loadLbcCollectionRecords();
        const orderLabel = updated?.orderNumber || updated?.receiptNumber || orderLookup;
        const targetLabel = trackingNumber || orderLabel;
        setLbcCollectionScanStatus(`Collection confirmed for ${targetLabel}.`);
        showLbcCollectionToast(`Collection confirmed for ${targetLabel}.`);
        focusLbcCollectionScanInput({ select: true });
    } catch (error) {
        console.error('Error confirming scanned collection:', error);
        setLbcCollectionScanStatus(error?.message || 'Error confirming collection.', true);
        showLbcCollectionToast(error?.message || 'Error confirming collection.', 'error');
    } finally {
        lbcToolbarState.scanBusy = false;
        if (lbcScanConfirmModalConfirmBtn) {
            lbcScanConfirmModalConfirmBtn.disabled = false;
            lbcScanConfirmModalConfirmBtn.textContent = 'Confirm Collection';
        }
    }
}

function renderLbcCollectionEmpty(message = 'No records found.') {
    if (!lbcCollectionModalBody) return;

    const summaryContainer = document.getElementById('lbcCollectionSummaryContainer');
    if (summaryContainer) {
        summaryContainer.innerHTML = '';
    }

    lbcCollectionModalBody.innerHTML = `
        <div class="lbc-collection-empty">
            <i class="fa-solid fa-inbox"></i>
            <p>${message}</p>
        </div>
    `;
}

function computeLbcCollectionSummary(records) {
    let pendingCount = 0;
    let confirmedCount = 0;
    let pendingAmount = 0;
    let confirmedAmount = 0;
    
    records.forEach(record => {
        const status = String(record.collectionStatus || '').toLowerCase();
        const amount = Number(record.amountToCollect || 0);
        if (status === 'confirmed') {
            confirmedCount++;
            confirmedAmount += amount;
        } else {
            pendingCount++;
            pendingAmount += amount;
        }
    });
    
    return {
        pendingCount,
        confirmedCount,
        pendingAmount,
        confirmedAmount,
        pendingAmountDisplay: '₱' + pendingAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 }),
        confirmedAmountDisplay: '₱' + confirmedAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })
    };
}

function renderLbcCollectionSummary(summary) {
    const container = document.getElementById('lbcCollectionSummaryContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="collection-summary-cards">
            <div class="collection-stat pending">
                <span class="collection-stat-label">Pending</span>
                <strong id="empCollectionPendingCount">${summary.pendingCount.toLocaleString('en-PH')}</strong>
                <span class="collection-stat-note">Needs owner confirmation</span>
            </div>
            <div class="collection-stat confirmed">
                <span class="collection-stat-label">Confirmed</span>
                <strong id="empCollectionConfirmedCount">${summary.confirmedCount.toLocaleString('en-PH')}</strong>
                <span class="collection-stat-note">Already reconciled</span>
            </div>
            <div class="collection-stat amount-pending">
                <span class="collection-stat-label">Pending Amount</span>
                <strong id="empCollectionPendingAmount">${summary.pendingAmountDisplay}</strong>
                <span class="collection-stat-note">To be collected</span>
            </div>
            <div class="collection-stat amount-confirmed">
                <span class="collection-stat-label">Confirmed Amount</span>
                <strong id="empCollectionConfirmedAmount">${summary.confirmedAmountDisplay}</strong>
                <span class="collection-stat-note">Collected cash</span>
            </div>
        </div>
    `;
}

function renderLbcCollectionRecords(records, { skipSummary = false } = {}) {
    if (!lbcCollectionModalBody) return;
    
    // Compute and render summary
    if (!skipSummary) {
        const summary = computeLbcCollectionSummary(records);
        renderLbcCollectionSummary(summary);
    }
    
    if (!records || records.length === 0) {
        lbcCollectionModalBody.innerHTML = `
            <div class="lbc-collection-empty">
                <i class="fa-solid fa-inbox"></i>
                <p>No collection records found with current filters.</p>
            </div>
        `;
        return;
    }
    
    const tableHtml = `
        <div class="table-wrap lbc-collection-table-wrap">
            <table class="lbc-collection-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Order #</th>
                        <th>Client</th>
                        <th>Tracking #</th>
                        <th>Branch</th>
                        <th>Amount</th>
                        <th>Collection Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.map(record => {
                        const orderNumber = record.orderNumber || record.receiptNumber || record.orderKey || '-';
                        const trackingNumber = record.trackingNumber || record.tracking_no || '-';
                        const clientName = record.clientName || '-';
                        const branch = record.branch || '-';
                        const amountToCollect = record.amountToCollect || 0;
                        const collectionStatus = record.collectionStatus || 'Pending';
                        const orderLookup = record.orderKey || record.orderNumber || '';
                        const trackingEntryId = record.trackingEntryId || '';
                        const isConfirmed = collectionStatus.toLowerCase() === 'confirmed';
                        const confirmedBy = record.collectionConfirmedBy || '';
                        const confirmedAt = record.collectionConfirmedAt || '';
                        
                        const formattedAmount = typeof amountToCollect === 'number' 
                            ? '₱' + amountToCollect.toLocaleString('en-PH', { minimumFractionDigits: 2 })
                            : '₱0.00';
                        
                        let actionHtml = '';
                        if (isConfirmed) {
                            actionHtml = `
                                <div class="collection-action-stack">
                                    <span class="collection-note">Confirmed${confirmedBy ? ` by ${confirmedBy}` : ''}${confirmedAt ? ` on ${formatDate(confirmedAt)}` : ''}</span>
                                    <div class="collection-action-buttons">
                                        <button type="button" class="undo-btn btn-secondary" data-action="undo" 
                                            data-order-lookup="${appClient.escapeHtml(orderLookup)}"
                                            data-tracking-entry-id="${appClient.escapeHtml(trackingEntryId)}"
                                            data-tracking-number="${appClient.escapeHtml(trackingNumber)}">
                                            Undo Confirm
                                        </button>
                                        <button type="button" class="return-btn btn-warning" data-action="return" 
                                            data-order-lookup="${appClient.escapeHtml(orderLookup)}"
                                            data-tracking-entry-id="${appClient.escapeHtml(trackingEntryId)}"
                                            data-tracking-number="${appClient.escapeHtml(trackingNumber)}">
                                            Return to In Transit
                                        </button>
                                    </div>
                                </div>
                            `;
                        } else {
                            actionHtml = `
                                <div class="collection-action-stack">
                                    <div class="collection-action-buttons">
                                        <button type="button" class="confirm-btn btn-primary" data-action="confirm" 
                                            data-order-lookup="${appClient.escapeHtml(orderLookup)}"
                                            data-tracking-entry-id="${appClient.escapeHtml(trackingEntryId)}"
                                            data-tracking-number="${appClient.escapeHtml(trackingNumber)}">
                                            Confirm Collection
                                        </button>
                                        <button type="button" class="return-btn btn-warning" data-action="return" 
                                            data-order-lookup="${appClient.escapeHtml(orderLookup)}"
                                            data-tracking-entry-id="${appClient.escapeHtml(trackingEntryId)}"
                                            data-tracking-number="${appClient.escapeHtml(trackingNumber)}">
                                            Return to In Transit
                                        </button>
                                    </div>
                                </div>
                            `;
                        }
                        
                        return `
                            <tr data-order-lookup="${appClient.escapeHtml(orderLookup)}" data-tracking-entry-id="${appClient.escapeHtml(trackingEntryId)}">
                                <td>${record.saleDate ? formatDate(record.saleDate) : '-'}</td>
                                <td class="order-number">${appClient.escapeHtml(orderNumber)}</td>
                                <td>${appClient.escapeHtml(clientName)}</td>
                                <td class="tracking-number">${appClient.escapeHtml(trackingNumber)}</td>
                                <td><span class="collection-branch-pill branch-${branch.toLowerCase()}">${appClient.escapeHtml(branch)}</span></td>
                                <td class="amount">${formattedAmount}</td>
                                <td>
                                    <span class="collection-status-pill status-${collectionStatus.toLowerCase()}">${collectionStatus}</span>
                                </td>
                                <td class="collection-action-cell">${actionHtml}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    lbcCollectionModalBody.innerHTML = tableHtml;
    
    // Bind all action buttons
    lbcCollectionModalBody.querySelectorAll('.confirm-btn').forEach(btn => {
        btn.addEventListener('click', handleLbcCollectionConfirm);
    });
    lbcCollectionModalBody.querySelectorAll('.undo-btn').forEach(btn => {
        btn.addEventListener('click', handleLbcUndoCollectionConfirm);
    });
    lbcCollectionModalBody.querySelectorAll('.return-btn').forEach(btn => {
        btn.addEventListener('click', handleLbcReturnToTransit);
    });
}

async function handleLbcCollectionConfirm(event) {
    const btn = event.currentTarget;
    const orderLookup = btn.dataset.orderLookup;
    const trackingEntryId = btn.dataset.trackingEntryId;
    const trackingNumber = btn.dataset.trackingNumber;
    const row = btn.closest('tr');
    
    if (!orderLookup) {
        showLbcCollectionToast('Order key is missing for collection confirmation.', 'error');
        return;
    }
    
    // Disable button while processing
    btn.disabled = true;
    btn.textContent = 'Processing...';
    
    try {
        // Call the API to confirm collection - matching admin workspace pattern
        const normalizedOrderKey = String(orderLookup || '').trim();
        const normalizedTrackingEntryId = String(trackingEntryId || '').trim();
        
        const updated = await appClient.confirmLbcCollection(normalizedOrderKey, {
            status: 'Confirmed',
            trackingEntryId: normalizedTrackingEntryId
        });
        
        // Reload records to reflect updated state
        await loadLbcCollectionRecords();
        
        const orderLabel = updated?.orderNumber || updated?.receiptNumber || normalizedOrderKey;
        const targetLabel = trackingNumber || orderLabel;
        showLbcCollectionToast(`Collection confirmed for ${targetLabel}.`);
        
    } catch (error) {
        console.error('Error confirming collection:', error);
        btn.disabled = false;
        btn.textContent = 'Confirm Collection';
        showLbcCollectionToast(error.message || 'Error confirming collection. Please try again.', 'error');
    }
}

async function handleLbcUndoCollectionConfirm(event) {
    const btn = event.currentTarget;
    const orderLookup = btn.dataset.orderLookup;
    const trackingEntryId = btn.dataset.trackingEntryId;
    const trackingNumber = btn.dataset.trackingNumber;
    
    if (!orderLookup) {
        showLbcCollectionToast('Order key is missing for undo confirmation.', 'error');
        return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Reverting...';
    
    try {
        const normalizedOrderKey = String(orderLookup || '').trim();
        const normalizedTrackingEntryId = String(trackingEntryId || '').trim();
        
        const updated = await appClient.confirmLbcCollection(normalizedOrderKey, {
            status: 'Pending',
            trackingEntryId: normalizedTrackingEntryId
        });
        
        await loadLbcCollectionRecords();
        
        const orderLabel = updated?.orderNumber || updated?.receiptNumber || normalizedOrderKey;
        const targetLabel = trackingNumber || orderLabel;
        showLbcCollectionToast(`Collection confirmation reverted for ${targetLabel}.`);
        
    } catch (error) {
        console.error('Error reverting collection confirmation:', error);
        btn.disabled = false;
        btn.textContent = 'Undo Confirm';
        showLbcCollectionToast(error.message || 'Error reverting collection confirmation.', 'error');
    }
}

async function handleLbcReturnToTransit(event) {
    const btn = event.currentTarget;
    const orderLookup = btn.dataset.orderLookup;
    const trackingEntryId = btn.dataset.trackingEntryId;
    const trackingNumber = btn.dataset.trackingNumber;
    
    if (!orderLookup) {
        showLbcCollectionToast('Order key is missing for return action.', 'error');
        return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Returning...';
    
    try {
        const normalizedOrderKey = String(orderLookup || '').trim();
        const normalizedTrackingEntryId = String(trackingEntryId || '').trim();
        
        const updated = await appClient.updateLbcTracking(normalizedOrderKey, {
            deliveryStatus: 'In Transit',
            dateMonitored: new Date().toISOString(),
            trackingEntryId: normalizedTrackingEntryId
        });
        
        await loadLbcCollectionRecords();
        
        const orderLabel = updated?.orderNumber || updated?.receiptNumber || normalizedOrderKey;
        const targetLabel = trackingNumber || orderLabel;
        showLbcCollectionToast(`${targetLabel} moved back to In Transit.`);
        
    } catch (error) {
        console.error('Error returning to In Transit:', error);
        btn.disabled = false;
        btn.textContent = 'Return to In Transit';
        showLbcCollectionToast(error.message || 'Error returning to In Transit.', 'error');
    }
}

function showLbcCollectionToast(message, type = 'success') {
    // Remove existing toast
    const existingToast = document.querySelector('.lbc-collection-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Create toast
    const toast = document.createElement('div');
    toast.className = `lbc-collection-toast ${type === 'error' ? 'is-error' : 'is-success'}`;
    toast.innerHTML = `
        <i class="fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i>
        <span>${message}</span>
    `;
    
    // Add styles
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 20px;
        border-radius: 12px;
        background: ${type === 'error' ? '#fef2f2' : '#f0fdf4'};
        color: ${type === 'error' ? '#b91c1c' : '#166534'};
        border: 1px solid ${type === 'error' ? '#fecaca' : '#bbf7d0'};
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        font-size: 14px;
        font-weight: 600;
        animation: slideInUp 300ms ease;
    `;
    
    // Add animation keyframes if not exists
    if (!document.querySelector('#lbc-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'lbc-toast-styles';
        style.textContent = `
            @keyframes slideInUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideInUp 300ms ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Track disable state for collection buttons during operations
let lbcCollectionActionLoading = false;

function setLbcCollectionActionLoading(isLoading) {
    lbcCollectionActionLoading = Boolean(isLoading);
    const modalBody = document.getElementById('lbcCollectionModalBody');
    if (modalBody) {
        const buttons = modalBody.querySelectorAll('.confirm-btn, .undo-btn, .return-btn');
        buttons.forEach((btn) => {
            btn.disabled = isLoading;
        });
    }
    if (lbcCollectionScanConfirmBtn) {
        lbcCollectionScanConfirmBtn.disabled = Boolean(isLoading || lbcToolbarState.scanBusy);
    }
    if (lbcCollectionScanInput) {
        lbcCollectionScanInput.disabled = Boolean(isLoading || lbcToolbarState.scanBusy);
    }
}
