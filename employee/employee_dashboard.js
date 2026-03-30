const appClient = window.appClient;
const timeCardBtn = document.getElementById('timeCardBtn');
const timeInOutBtn = document.getElementById('timeInOutBtn');
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

const dashboardState = {
    bulletin: createEmptyBulletin(),
    calendarMonth: getMonthStartDate(getTodayKey()),
    selectedDate: getTodayKey(),
    modalRestoreFocus: null,
    companyUpdatesOpen: false
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
    }
]);

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'employee' });
    if (!session) {
        return;
    }

    const [bootstrap, bulletin] = await Promise.all([
        loadBootstrap(),
        loadCompanyBulletin()
    ]);
    bindCoreCards();
    bindCompanyCalendarControls();
    renderWorkspaceOverview(session, bootstrap);
    renderCompanyBulletin(bulletin || bootstrap?.companyBulletin || null);
    await renderGrantedFeatureCards(session, bootstrap);
    bindLogoutListener();
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

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            window.location.href = '/employee/settings.html';
        });
    }

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
            ? 'Use Time Card, Time In / Out, and account settings while the rest of the workspace stays streamlined.'
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
        coreToolCount.textContent = '4';
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

    if (isAttendanceOnlyWorkspace(bootstrap)) {
        if (featureCount) {
            featureCount.textContent = '0';
        }
        return;
    }

    try {
        const modules = (bootstrap && typeof bootstrap.modules === 'object' && !Array.isArray(bootstrap.modules))
            ? bootstrap.modules
            : {};
        const featureAccess = appClient.normalizeUserFeatureAccess(
            bootstrap?.user?.feature_access || session?.feature_access || {}
        );

        const allowedCards = FEATURE_UI_CONFIG.filter((item) => (
            Boolean(modules[item.module])
            && Boolean(featureAccess[item.key])
        ));

        if (!allowedCards.length) {
            return;
        }

        const normalizedRole = String(session?.role || '').trim().toLowerCase();
        const isStaffUser = normalizedRole === 'staff';

        featureCards.innerHTML = allowedCards.map((item) => {
            const isInventoryCard = item.key === 'inventory';
            const isWorkflowCard = item.key === 'order_form';
            const targetPath = isInventoryCard && isStaffUser
                ? '/head_admin/inventory_levels.html'
                : (isWorkflowCard ? '/head_admin/communication_panel.html' : item.path);
            const description = isInventoryCard && isStaffUser
                ? 'View and update current stock levels.'
                : (isWorkflowCard
                    ? (isStaffUser
                        ? 'Open the shared order workflow for staff receipt, prep, and dispatch lanes.'
                        : 'Submit orders to the shared workflow and monitor head admin approval and prep status.')
                    : item.description);
            const title = isWorkflowCard
                ? (isStaffUser ? 'Workflow Panel' : 'Order Workflow')
                : item.label;

            return `
                <button type="button" class="action-card feature-card" data-target-path="${targetPath}">
                  <span class="action-icon"><i class="${item.iconClass}"></i></span>
                  <h3 class="action-title">${title}</h3>
                  <p class="action-copy">${description}</p>
                  <div class="action-footer">
                    <span>Open module</span>
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                  </div>
                </button>
            `;
        }).join('');

        Array.from(featureCards.querySelectorAll('button[data-target-path]')).forEach((button) => {
            button.addEventListener('click', () => {
                window.location.href = button.dataset.targetPath;
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
