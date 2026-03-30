const appClient = window.appClient;

const elements = {
    pageStatus: document.getElementById('pageStatus'),
    todayNoticeCountValue: document.getElementById('todayNoticeCountValue'),
    todayNoticeSummary: document.getElementById('todayNoticeSummary'),
    nextScheduleValue: document.getElementById('nextScheduleValue'),
    nextScheduleSummary: document.getElementById('nextScheduleSummary'),
    announcementStateValue: document.getElementById('announcementStateValue'),
    announcementWindowValue: document.getElementById('announcementWindowValue'),
    calendarMonthLabel: document.getElementById('calendarMonthLabel'),
    prevMonthBtn: document.getElementById('prevMonthBtn'),
    todayMonthBtn: document.getElementById('todayMonthBtn'),
    nextMonthBtn: document.getElementById('nextMonthBtn'),
    calendarGrid: document.getElementById('calendarGrid'),
    selectedDateLabel: document.getElementById('selectedDateLabel'),
    selectedDateItems: document.getElementById('selectedDateItems'),
    holidayForm: document.getElementById('holidayForm'),
    holidayDateInput: document.getElementById('holidayDateInput'),
    holidayEndDateInput: document.getElementById('holidayEndDateInput'),
    holidayTypeInput: document.getElementById('holidayTypeInput'),
    holidayNameInput: document.getElementById('holidayNameInput'),
    holidayTimeInput: document.getElementById('holidayTimeInput'),
    holidayNoteInput: document.getElementById('holidayNoteInput'),
    holidayFormMeta: document.getElementById('holidayFormMeta'),
    saveHolidayBtn: document.getElementById('saveHolidayBtn'),
    cancelHolidayEditBtn: document.getElementById('cancelHolidayEditBtn'),
    holidayTableBody: document.getElementById('holidayTableBody'),
    announcementForm: document.getElementById('announcementForm'),
    announcementTitleInput: document.getElementById('announcementTitleInput'),
    announcementMessageInput: document.getElementById('announcementMessageInput'),
    announcementStartInput: document.getElementById('announcementStartInput'),
    announcementEndInput: document.getElementById('announcementEndInput'),
    saveAnnouncementBtn: document.getElementById('saveAnnouncementBtn'),
    clearAnnouncementBtn: document.getElementById('clearAnnouncementBtn'),
    announcementPreviewMeta: document.getElementById('announcementPreviewMeta'),
    announcementPreviewTitle: document.getElementById('announcementPreviewTitle'),
    announcementPreviewMessage: document.getElementById('announcementPreviewMessage')
};

const ITEM_TYPE_META = Object.freeze({
    regular_holiday: {
        label: 'Regular Holiday',
        badgeClass: 'is-holiday',
        dotClass: 'is-holiday'
    },
    special_holiday: {
        label: 'Special Holiday',
        badgeClass: 'is-holiday',
        dotClass: 'is-holiday'
    },
    company_event: {
        label: 'Company Event',
        badgeClass: 'is-event',
        dotClass: 'is-event'
    },
    news_update: {
        label: 'Company News',
        badgeClass: 'is-news',
        dotClass: 'is-news'
    }
});

const state = {
    bulletin: createEmptyBulletin(),
    calendarMonth: getMonthStartDate(getTodayKey()),
    selectedDate: '',
    selectedRangeStart: '',
    selectedRangeEnd: '',
    rangeAnchorDate: '',
    editingHolidayId: '',
    savingHoliday: false,
    savingAnnouncement: false
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    bindEvents();
    await loadPage();
}

function bindEvents() {
    elements.prevMonthBtn?.addEventListener('click', () => {
        state.calendarMonth = shiftMonth(state.calendarMonth, -1);
        renderCalendar();
    });

    elements.todayMonthBtn?.addEventListener('click', () => {
        const todayKey = state.bulletin.todayKey || getTodayKey();
        state.calendarMonth = getMonthStartDate(todayKey);
        setSelectedRange(todayKey, todayKey, {
            selectedDate: todayKey,
            anchor: ''
        });
        renderAll();
    });

    elements.nextMonthBtn?.addEventListener('click', () => {
        state.calendarMonth = shiftMonth(state.calendarMonth, 1);
        renderCalendar();
    });

    elements.calendarGrid?.addEventListener('click', (event) => {
        const button = event.target instanceof Element
            ? event.target.closest('button[data-date-key]')
            : null;
        if (!(button instanceof HTMLButtonElement)) {
            return;
        }

        handleCalendarDateClick(String(button.dataset.dateKey || '').trim());
    });

    elements.selectedDateItems?.addEventListener('click', handleItemActionClick);
    elements.holidayTableBody?.addEventListener('click', handleItemActionClick);

    elements.holidayDateInput?.addEventListener('change', handleHolidayDateInputChange);
    elements.holidayEndDateInput?.addEventListener('change', handleHolidayDateInputChange);

    elements.holidayForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await saveHoliday();
    });

    elements.cancelHolidayEditBtn?.addEventListener('click', () => {
        state.editingHolidayId = '';
        resetHolidayForm();
        renderSelectedRangePanel();
        renderHolidayTable();
    });

    elements.announcementForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await saveAnnouncement();
    });

    elements.clearAnnouncementBtn?.addEventListener('click', async () => {
        await clearAnnouncement();
    });

    [
        elements.announcementTitleInput,
        elements.announcementMessageInput,
        elements.announcementStartInput,
        elements.announcementEndInput
    ].forEach((field) => {
        field?.addEventListener('input', renderAnnouncementPreviewFromDraft);
        field?.addEventListener('change', renderAnnouncementPreviewFromDraft);
    });
}

async function loadPage() {
    setPageStatus('Loading company calendar...');

    try {
        const [bootstrap, bulletin] = await Promise.all([
            appClient.getBootstrap(),
            appClient.getCompanyBulletin()
        ]);

        appClient.applyBootstrapBrandTheme(bootstrap);
        applyBulletin(bulletin || bootstrap?.companyBulletin || null, {
            resetSelection: true
        });
        populateAnnouncementForm();
        resetHolidayForm();
        renderAll();
        setPageStatus('Company calendar ready.');
    } catch (error) {
        console.error('Failed to load company bulletin page:', error);
        applyBulletin(null, { resetSelection: true });
        populateAnnouncementForm();
        resetHolidayForm();
        renderAll();
        setPageStatus(error.message || 'Failed to load company calendar.', true);
    }
}

function applyBulletin(value = null, { resetSelection = false } = {}) {
    state.bulletin = normalizeBulletin(value);

    const fallbackDate = state.bulletin.todayKey || getTodayKey();
    const defaultDate = state.bulletin.todayItems[0]?.startDate
        || state.bulletin.upcomingItems[0]?.startDate
        || fallbackDate;

    if (
        resetSelection
        || !state.selectedRangeStart
        || !state.selectedRangeEnd
    ) {
        setSelectedRange(defaultDate, defaultDate, {
            selectedDate: defaultDate,
            anchor: ''
        });
        state.calendarMonth = getMonthStartDate(defaultDate);
        return;
    }

    setSelectedRange(state.selectedRangeStart, state.selectedRangeEnd, {
        selectedDate: state.selectedDate || state.selectedRangeEnd || defaultDate,
        anchor: ''
    });
}

function createEmptyBulletin() {
    return {
        announcement: createEmptyAnnouncement(),
        activeAnnouncement: null,
        calendarItems: [],
        holidays: [],
        upcomingItems: [],
        upcomingHolidays: [],
        todayItems: [],
        notificationItems: [],
        todayKey: getTodayKey()
    };
}

function createEmptyAnnouncement() {
    return {
        title: '',
        message: '',
        startsOn: '',
        endsOn: '',
        windowLabel: '',
        isActive: false,
        isScheduled: false,
        isExpired: false,
        hasContent: false
    };
}

function normalizeBulletin(value = null) {
    const source = (value && typeof value === 'object' && !Array.isArray(value))
        ? value
        : {};
    const todayKey = normalizeDateKey(source.todayKey || source.today_key || '') || getTodayKey();
    const calendarItems = sortCalendarItems(
        (Array.isArray(source.calendarItems) ? source.calendarItems : (
            Array.isArray(source.holidays) ? source.holidays : []
        ))
            .map((item) => normalizeCalendarItem(item))
            .filter(Boolean)
    );
    const announcement = normalizeAnnouncement(source.announcement || source.activeAnnouncement || null);
    const todayItems = calendarItems.filter((item) => doesItemCoverDate(item, todayKey));
    const upcomingItems = calendarItems.filter((item) => item.endDate >= todayKey);
    const notificationItems = (Array.isArray(source.notificationItems) ? source.notificationItems : [])
        .map((item) => normalizeCalendarItem(item))
        .filter(Boolean);

    return {
        announcement,
        activeAnnouncement: announcement.isActive ? announcement : null,
        calendarItems,
        holidays: calendarItems,
        upcomingItems,
        upcomingHolidays: upcomingItems,
        todayItems,
        notificationItems,
        todayKey
    };
}

function normalizeAnnouncement(value = null) {
    if (!value || typeof value !== 'object') {
        return createEmptyAnnouncement();
    }

    const title = String(value.title || '').trim();
    const message = String(value.message || '').trim();
    const startsOn = normalizeDateKey(value.starts_on || value.startsOn || '');
    const endsOn = normalizeDateKey(value.ends_on || value.endsOn || '');
    const windowLabel = String(value.window_label || value.windowLabel || '').trim();
    const isActive = Boolean(value.is_active ?? value.isActive);
    const isScheduled = Boolean(value.is_scheduled ?? value.isScheduled);
    const isExpired = Boolean(value.is_expired ?? value.isExpired);
    const hasContentSource = value.has_content ?? value.hasContent;
    const hasContent = typeof hasContentSource === 'boolean'
        ? hasContentSource
        : Boolean(title || message);

    if (!hasContent && !title && !message) {
        return createEmptyAnnouncement();
    }

    return {
        title: title || 'Company Announcement',
        message,
        startsOn,
        endsOn,
        windowLabel,
        isActive,
        isScheduled,
        isExpired,
        hasContent
    };
}

function normalizeCalendarItem(value = null) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const name = String(value.name || value.title || '').trim();
    const startDate = normalizeDateKey(value.start_date || value.startDate || value.date || '');
    const endDate = normalizeDateKey(value.end_date || value.endDate || value.date || value.start_date || '');
    if (!name || !startDate) {
        return null;
    }

    const normalizedEndDate = endDate && endDate >= startDate
        ? endDate
        : startDate;

    return {
        id: String(value.id || '').trim(),
        name,
        note: String(value.note || value.description || '').trim(),
        date: startDate,
        startDate,
        endDate: normalizedEndDate,
        timeLabel: String(value.time_label || value.timeLabel || value.when || '').trim(),
        type: normalizeCalendarItemType(value.type || 'regular_holiday')
    };
}

function normalizeCalendarItemType(value = '') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/-/g, '_');
    return ITEM_TYPE_META[normalized]
        ? normalized
        : 'regular_holiday';
}

function sortCalendarItems(items = []) {
    return [...items].sort((first, second) => {
        const startDiff = String(first.startDate || '').localeCompare(String(second.startDate || ''));
        if (startDiff !== 0) {
            return startDiff;
        }

        const endDiff = String(first.endDate || '').localeCompare(String(second.endDate || ''));
        if (endDiff !== 0) {
            return endDiff;
        }

        const timeDiff = String(first.timeLabel || '').localeCompare(String(second.timeLabel || ''));
        if (timeDiff !== 0) {
            return timeDiff;
        }

        return String(first.name || '').localeCompare(String(second.name || ''));
    });
}

function setPageStatus(message, isError = false) {
    if (!elements.pageStatus) {
        return;
    }

    elements.pageStatus.textContent = message;
    elements.pageStatus.classList.toggle('is-error', Boolean(isError));
}

function renderAll() {
    renderSummary();
    renderCalendar();
    renderSelectedRangePanel();
    renderHolidayTable();
    renderAnnouncementPreviewFromDraft();
    renderHolidayFormState();
}

function renderSummary() {
    const todayItems = state.bulletin.todayItems;
    const nextItem = state.bulletin.upcomingItems[0] || null;
    const announcement = state.bulletin.announcement;

    if (elements.todayNoticeCountValue) {
        elements.todayNoticeCountValue.textContent = String(todayItems.length);
    }
    if (elements.todayNoticeSummary) {
        elements.todayNoticeSummary.textContent = todayItems.length
            ? todayItems.map((item) => item.name).slice(0, 2).join(' | ')
            : 'No company notice scheduled for today.';
    }

    if (elements.nextScheduleValue) {
        elements.nextScheduleValue.textContent = nextItem
            ? formatSummaryRange(nextItem.startDate, nextItem.endDate)
            : 'None';
    }
    if (elements.nextScheduleSummary) {
        elements.nextScheduleSummary.textContent = nextItem
            ? `${nextItem.name} | ${getItemTypeMeta(nextItem.type).label}`
            : 'Select a date on the calendar to create the first item.';
    }

    if (elements.announcementStateValue) {
        elements.announcementStateValue.textContent = getAnnouncementStateLabel(announcement);
    }
    if (elements.announcementWindowValue) {
        elements.announcementWindowValue.textContent = announcement.hasContent
            ? getAnnouncementWindowLabel(announcement)
            : 'Optional banner for broader company reminders.';
    }
}

function renderCalendar() {
    if (!elements.calendarGrid || !elements.calendarMonthLabel) {
        return;
    }

    const monthStart = getMonthStartDate(state.calendarMonth);
    const monthStartDay = monthStart.getDay();
    const calendarStart = addDays(monthStart, -monthStartDay);
    const selectedStart = state.selectedRangeStart;
    const selectedEnd = state.selectedRangeEnd;
    const selectedDate = state.selectedDate;
    const todayKey = state.bulletin.todayKey || getTodayKey();
    const itemsByDate = buildItemsByDateMap(state.bulletin.calendarItems);
    const cells = [];

    for (let index = 0; index < 42; index += 1) {
        const currentDate = addDays(calendarStart, index);
        const dateKey = toDateKey(currentDate);
        const itemDots = itemsByDate.get(dateKey) || [];
        const inShownMonth = currentDate.getMonth() === monthStart.getMonth();
        const inRange = Boolean(selectedStart && selectedEnd && dateKey >= selectedStart && dateKey <= selectedEnd);
        const isRangeStart = dateKey === selectedStart;
        const isRangeEnd = dateKey === selectedEnd;
        const isSingleDaySelection = isRangeStart && isRangeEnd;

        cells.push(`
            <button
              type="button"
              class="calendar-day${inShownMonth ? '' : ' is-outside'}${dateKey === todayKey ? ' is-today' : ''}${isSingleDaySelection ? ' is-selected' : ''}${isRangeStart ? ' is-range-start' : ''}${isRangeEnd ? ' is-range-end' : ''}${inRange ? ' is-in-range' : ''}${dateKey === selectedDate ? ' is-current' : ''}"
              data-date-key="${dateKey}"
              aria-label="${appClient.escapeHtml(formatDisplayDate(dateKey))}"
            >
              <span class="calendar-day-number">${currentDate.getDate()}</span>
              <span class="calendar-dots">${renderCalendarDots(itemDots)}</span>
            </button>
        `);
    }

    elements.calendarMonthLabel.textContent = formatMonthLabel(monthStart);
    elements.calendarGrid.innerHTML = cells.join('');
}

function renderCalendarDots(dotTypes = []) {
    if (!Array.isArray(dotTypes) || !dotTypes.length) {
        return '';
    }

    return dotTypes.slice(0, 3).map((type) => {
        const dotClass = getItemTypeMeta(type).dotClass;
        return `<span class="calendar-dot ${dotClass}"></span>`;
    }).join('');
}

function renderSelectedRangePanel() {
    renderSelectedRangeLabel();
    renderSelectedRangeItems();
    renderHolidayFormState();
}

function renderSelectedRangeLabel() {
    if (!elements.selectedDateLabel) {
        return;
    }

    elements.selectedDateLabel.textContent = formatRangeLabel(
        state.selectedRangeStart,
        state.selectedRangeEnd
    );
}

function renderSelectedRangeItems() {
    if (!elements.selectedDateItems) {
        return;
    }

    const selectedItems = getItemsForSelectedRange();
    if (!selectedItems.length) {
        elements.selectedDateItems.innerHTML = `
            <div class="date-feed-empty">
              Walang holiday, event, o news na tumatama sa range na ito pa. Gamitin ang form sa kanan para gumawa ng bago.
            </div>
        `;
        return;
    }

    elements.selectedDateItems.innerHTML = selectedItems.map((item) => {
        const typeMeta = getItemTypeMeta(item.type);
        return `
            <article class="entry-card">
              <div class="entry-meta">
                <span class="entry-badge ${typeMeta.badgeClass}">${appClient.escapeHtml(typeMeta.label)}</span>
                <span class="entry-time">${appClient.escapeHtml(buildCalendarItemMeta(item) || 'Whole day')}</span>
              </div>
              <h4 class="entry-title">${appClient.escapeHtml(item.name)}</h4>
              <p class="entry-note">${appClient.escapeHtml(item.note || 'No extra details provided.')}</p>
              <div class="entry-actions">
                <button type="button" class="mini-button edit" data-action="edit" data-holiday-id="${appClient.escapeHtml(item.id)}">Edit</button>
                <button type="button" class="mini-button delete" data-action="delete" data-holiday-id="${appClient.escapeHtml(item.id)}">Delete</button>
              </div>
            </article>
        `;
    }).join('');
}

function renderHolidayFormState() {
    if (elements.holidayDateInput) {
        elements.holidayDateInput.value = state.selectedRangeStart || '';
    }
    if (elements.holidayEndDateInput) {
        elements.holidayEndDateInput.value = state.selectedRangeEnd || state.selectedRangeStart || '';
    }

    const editingItem = getEditingHoliday();
    if (elements.holidayFormMeta) {
        elements.holidayFormMeta.textContent = editingItem
            ? `Editing ${editingItem.name}. Changes to this range will update the employee calendar and notices.`
            : 'Click one date for the start, then another for the end. You can still adjust the range manually below.';
    }

    if (elements.saveHolidayBtn) {
        elements.saveHolidayBtn.textContent = editingItem
            ? (state.savingHoliday ? 'Updating...' : 'Update Calendar Item')
            : (state.savingHoliday ? 'Saving...' : 'Save Calendar Item');
        elements.saveHolidayBtn.disabled = state.savingHoliday;
    }

    if (elements.cancelHolidayEditBtn) {
        elements.cancelHolidayEditBtn.hidden = !editingItem;
        elements.cancelHolidayEditBtn.disabled = state.savingHoliday;
    }
}

function renderHolidayTable() {
    if (!elements.holidayTableBody) {
        return;
    }

    if (!state.bulletin.calendarItems.length) {
        elements.holidayTableBody.innerHTML = `
            <tr>
              <td class="empty-row" colspan="5">No calendar entries yet. Save the first holiday, event, or news item to start the shared company calendar.</td>
            </tr>
        `;
        return;
    }

    elements.holidayTableBody.innerHTML = state.bulletin.calendarItems.map((item) => {
        const typeMeta = getItemTypeMeta(item.type);
        return `
            <tr>
              <td>${appClient.escapeHtml(formatRangeLabel(item.startDate, item.endDate))}</td>
              <td>
                <div class="row-title">${appClient.escapeHtml(item.name)}</div>
                <div class="row-note">${appClient.escapeHtml(item.note || 'No extra details provided.')}</div>
              </td>
              <td>${appClient.escapeHtml(typeMeta.label)}</td>
              <td>${appClient.escapeHtml(item.timeLabel || 'Whole day')}</td>
              <td>
                <div class="button-row">
                  <button type="button" class="mini-button edit" data-action="edit" data-holiday-id="${appClient.escapeHtml(item.id)}">Edit</button>
                  <button type="button" class="mini-button delete" data-action="delete" data-holiday-id="${appClient.escapeHtml(item.id)}">Delete</button>
                </div>
              </td>
            </tr>
        `;
    }).join('');
}

function populateAnnouncementForm() {
    const announcement = state.bulletin.announcement;

    if (elements.announcementTitleInput) {
        elements.announcementTitleInput.value = announcement.title || '';
    }
    if (elements.announcementMessageInput) {
        elements.announcementMessageInput.value = announcement.message || '';
    }
    if (elements.announcementStartInput) {
        elements.announcementStartInput.value = announcement.startsOn || '';
    }
    if (elements.announcementEndInput) {
        elements.announcementEndInput.value = announcement.endsOn || '';
    }
}

function renderAnnouncementPreviewFromDraft() {
    const draft = getAnnouncementDraft();
    const preview = draft.hasContent
        ? draft
        : state.bulletin.announcement;

    if (elements.announcementPreviewTitle) {
        elements.announcementPreviewTitle.textContent = preview.hasContent
            ? (preview.title || 'Company Announcement')
            : 'No active announcement yet.';
    }

    if (elements.announcementPreviewMessage) {
        elements.announcementPreviewMessage.textContent = preview.hasContent
            ? (preview.message || 'No message body provided yet.')
            : 'Create a company-wide message that employees can immediately see from their workspace.';
    }

    if (elements.announcementPreviewMeta) {
        elements.announcementPreviewMeta.textContent = preview.hasContent
            ? getAnnouncementWindowLabel(preview)
            : 'Waiting for announcement';
    }

    if (elements.saveAnnouncementBtn) {
        elements.saveAnnouncementBtn.disabled = state.savingAnnouncement;
        elements.saveAnnouncementBtn.textContent = state.savingAnnouncement
            ? 'Saving...'
            : 'Save Pinned Notice';
    }

    if (elements.clearAnnouncementBtn) {
        elements.clearAnnouncementBtn.disabled = state.savingAnnouncement || !state.bulletin.announcement.hasContent;
    }
}

function handleCalendarDateClick(dateKey = '') {
    const normalizedDate = normalizeDateKey(dateKey);
    if (!normalizedDate) {
        return;
    }

    if (!state.rangeAnchorDate) {
        setSelectedRange(normalizedDate, normalizedDate, {
            selectedDate: normalizedDate,
            anchor: normalizedDate
        });
    } else {
        const startDate = normalizedDate < state.rangeAnchorDate
            ? normalizedDate
            : state.rangeAnchorDate;
        const endDate = normalizedDate > state.rangeAnchorDate
            ? normalizedDate
            : state.rangeAnchorDate;
        setSelectedRange(startDate, endDate, {
            selectedDate: normalizedDate,
            anchor: ''
        });
    }

    state.calendarMonth = getMonthStartDate(normalizedDate);
    renderAll();
}

function handleHolidayDateInputChange() {
    const startDate = normalizeDateKey(elements.holidayDateInput?.value || '');
    const endDate = normalizeDateKey(elements.holidayEndDateInput?.value || '');

    if (!startDate && !endDate) {
        return;
    }

    const resolvedStartDate = startDate || endDate;
    const resolvedEndDate = endDate && endDate >= resolvedStartDate
        ? endDate
        : resolvedStartDate;

    setSelectedRange(resolvedStartDate, resolvedEndDate, {
        selectedDate: resolvedEndDate,
        anchor: ''
    });
    state.calendarMonth = getMonthStartDate(resolvedStartDate);
    renderAll();
}

function handleItemActionClick(event) {
    const button = event.target instanceof Element
        ? event.target.closest('button[data-action][data-holiday-id]')
        : null;
    if (!(button instanceof HTMLButtonElement)) {
        return;
    }

    const action = String(button.dataset.action || '').trim();
    const holidayId = String(button.dataset.holidayId || '').trim();
    if (!holidayId) {
        return;
    }

    if (action === 'edit') {
        startEditingHoliday(holidayId);
        return;
    }

    if (action === 'delete') {
        void deleteHoliday(holidayId);
    }
}

function startEditingHoliday(holidayId = '') {
    const item = state.bulletin.calendarItems.find((entry) => entry.id === holidayId);
    if (!item) {
        return;
    }

    state.editingHolidayId = item.id;
    setSelectedRange(item.startDate, item.endDate, {
        selectedDate: item.endDate,
        anchor: ''
    });
    state.calendarMonth = getMonthStartDate(item.startDate);

    if (elements.holidayTypeInput) {
        elements.holidayTypeInput.value = item.type;
    }
    if (elements.holidayNameInput) {
        elements.holidayNameInput.value = item.name;
    }
    if (elements.holidayTimeInput) {
        elements.holidayTimeInput.value = item.timeLabel || '';
    }
    if (elements.holidayNoteInput) {
        elements.holidayNoteInput.value = item.note || '';
    }

    renderAll();
    setPageStatus(`Editing ${item.name}.`, false);
}

function resetHolidayForm() {
    if (elements.holidayTypeInput) {
        elements.holidayTypeInput.value = 'regular_holiday';
    }
    if (elements.holidayNameInput) {
        elements.holidayNameInput.value = '';
    }
    if (elements.holidayTimeInput) {
        elements.holidayTimeInput.value = '';
    }
    if (elements.holidayNoteInput) {
        elements.holidayNoteInput.value = '';
    }

    renderHolidayFormState();
}

function getEditingHoliday() {
    if (!state.editingHolidayId) {
        return null;
    }

    return state.bulletin.calendarItems.find((item) => item.id === state.editingHolidayId) || null;
}

async function saveHoliday() {
    const startDate = normalizeDateKey(elements.holidayDateInput?.value || '');
    const endDate = normalizeDateKey(elements.holidayEndDateInput?.value || '') || startDate;
    const name = String(elements.holidayNameInput?.value || '').trim();

    if (!startDate) {
        setPageStatus('Start date is required.', true);
        elements.holidayDateInput?.focus();
        return;
    }

    if (!name) {
        setPageStatus('Title is required.', true);
        elements.holidayNameInput?.focus();
        return;
    }

    if (endDate < startDate) {
        setPageStatus('End date cannot be earlier than the start date.', true);
        elements.holidayEndDateInput?.focus();
        return;
    }

    state.savingHoliday = true;
    renderHolidayFormState();

    const payload = {
        start_date: startDate,
        end_date: endDate,
        type: String(elements.holidayTypeInput?.value || 'regular_holiday').trim(),
        name,
        time_label: String(elements.holidayTimeInput?.value || '').trim(),
        note: String(elements.holidayNoteInput?.value || '').trim()
    };

    try {
        const bulletin = state.editingHolidayId
            ? await appClient.updateCompanyHoliday(state.editingHolidayId, payload)
            : await appClient.createCompanyHoliday(payload);

        const itemLabel = state.editingHolidayId ? 'updated' : 'saved';
        setSelectedRange(startDate, endDate, {
            selectedDate: endDate,
            anchor: ''
        });
        applyBulletin(bulletin);
        state.editingHolidayId = '';
        resetHolidayForm();
        renderAll();
        setPageStatus(`Calendar item ${itemLabel}.`);
    } catch (error) {
        console.error('Failed to save company calendar item:', error);
        setPageStatus(error.message || 'Failed to save calendar item.', true);
    } finally {
        state.savingHoliday = false;
        renderHolidayFormState();
    }
}

async function deleteHoliday(holidayId = '') {
    const item = state.bulletin.calendarItems.find((entry) => entry.id === holidayId);
    if (!item) {
        return;
    }

    const confirmed = window.confirm(`Delete "${item.name}" from the company calendar?`);
    if (!confirmed) {
        return;
    }

    try {
        const bulletin = await appClient.deleteCompanyHoliday(holidayId);
        if (state.editingHolidayId === holidayId) {
            state.editingHolidayId = '';
            resetHolidayForm();
        }
        applyBulletin(bulletin);
        renderAll();
        setPageStatus(`Deleted ${item.name} from the company calendar.`);
    } catch (error) {
        console.error('Failed to delete company calendar item:', error);
        setPageStatus(error.message || 'Failed to delete calendar item.', true);
    }
}

async function saveAnnouncement() {
    const draft = getAnnouncementDraft();
    if (!draft.message) {
        setPageStatus('Announcement message is required.', true);
        elements.announcementMessageInput?.focus();
        return;
    }

    if (draft.endsOn && draft.startsOn && draft.endsOn < draft.startsOn) {
        setPageStatus('Announcement end date cannot be earlier than the start date.', true);
        elements.announcementEndInput?.focus();
        return;
    }

    state.savingAnnouncement = true;
    renderAnnouncementPreviewFromDraft();

    try {
        const bulletin = await appClient.updateCompanyAnnouncement({
            title: draft.title,
            message: draft.message,
            starts_on: draft.startsOn,
            ends_on: draft.endsOn
        });

        applyBulletin(bulletin);
        populateAnnouncementForm();
        renderAll();
        setPageStatus('Pinned announcement saved.');
    } catch (error) {
        console.error('Failed to save company announcement:', error);
        setPageStatus(error.message || 'Failed to save announcement.', true);
    } finally {
        state.savingAnnouncement = false;
        renderAnnouncementPreviewFromDraft();
    }
}

async function clearAnnouncement() {
    if (!state.bulletin.announcement.hasContent) {
        return;
    }

    const confirmed = window.confirm('Clear the pinned company announcement?');
    if (!confirmed) {
        return;
    }

    state.savingAnnouncement = true;
    renderAnnouncementPreviewFromDraft();

    try {
        const bulletin = await appClient.clearCompanyAnnouncement();
        applyBulletin(bulletin);
        populateAnnouncementForm();
        renderAll();
        setPageStatus('Pinned announcement cleared.');
    } catch (error) {
        console.error('Failed to clear company announcement:', error);
        setPageStatus(error.message || 'Failed to clear announcement.', true);
    } finally {
        state.savingAnnouncement = false;
        renderAnnouncementPreviewFromDraft();
    }
}

function getAnnouncementDraft() {
    return normalizeAnnouncement({
        title: String(elements.announcementTitleInput?.value || '').trim(),
        message: String(elements.announcementMessageInput?.value || '').trim(),
        starts_on: String(elements.announcementStartInput?.value || '').trim(),
        ends_on: String(elements.announcementEndInput?.value || '').trim(),
        is_active: false,
        is_scheduled: false,
        is_expired: false,
        has_content: Boolean(
            String(elements.announcementTitleInput?.value || '').trim()
            || String(elements.announcementMessageInput?.value || '').trim()
        )
    });
}

function getItemsForSelectedRange() {
    const selectedStart = state.selectedRangeStart;
    const selectedEnd = state.selectedRangeEnd;
    if (!selectedStart || !selectedEnd) {
        return [];
    }

    return state.bulletin.calendarItems.filter((item) => (
        item.startDate <= selectedEnd && item.endDate >= selectedStart
    ));
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

function doesItemCoverDate(item = {}, dateKey = '') {
    const normalizedDate = normalizeDateKey(dateKey);
    if (!normalizedDate) {
        return false;
    }

    return normalizedDate >= item.startDate && normalizedDate <= item.endDate;
}

function setSelectedRange(startDate, endDate, { selectedDate = '', anchor = '' } = {}) {
    const normalizedStartDate = normalizeDateKey(startDate);
    const normalizedEndDate = normalizeDateKey(endDate) || normalizedStartDate;

    if (!normalizedStartDate) {
        return;
    }

    const resolvedStartDate = normalizedEndDate < normalizedStartDate
        ? normalizedEndDate
        : normalizedStartDate;
    const resolvedEndDate = normalizedEndDate < normalizedStartDate
        ? normalizedStartDate
        : normalizedEndDate;

    state.selectedRangeStart = resolvedStartDate;
    state.selectedRangeEnd = resolvedEndDate;
    state.selectedDate = normalizeDateKey(selectedDate) || resolvedEndDate;
    state.rangeAnchorDate = normalizeDateKey(anchor) || '';
}

function getItemTypeMeta(type = '') {
    return ITEM_TYPE_META[normalizeCalendarItemType(type)] || ITEM_TYPE_META.regular_holiday;
}

function buildCalendarItemMeta(item = {}) {
    return [
        formatRangeLabel(item.startDate, item.endDate),
        item.timeLabel
    ].filter(Boolean).join(' | ');
}

function getAnnouncementStateLabel(announcement = createEmptyAnnouncement()) {
    if (!announcement.hasContent) {
        return 'None';
    }
    if (announcement.isScheduled) {
        return 'Scheduled';
    }
    if (announcement.isExpired) {
        return 'Expired';
    }
    if (announcement.isActive) {
        return 'Active';
    }
    return 'Saved';
}

function getAnnouncementWindowLabel(announcement = createEmptyAnnouncement()) {
    if (!announcement.hasContent) {
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

function formatSummaryRange(startDate = '', endDate = '') {
    const normalizedStartDate = normalizeDateKey(startDate);
    const normalizedEndDate = normalizeDateKey(endDate) || normalizedStartDate;
    if (!normalizedStartDate) {
        return 'None';
    }

    const start = parseDateKey(normalizedStartDate);
    const end = parseDateKey(normalizedEndDate);
    if (!start || !end) {
        return normalizedStartDate;
    }

    if (normalizedStartDate === normalizedEndDate) {
        return start.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }

    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
        return `${start.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        })}-${end.getDate()}`;
    }

    return `${start.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    })} to ${end.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    })}`;
}

function formatRangeLabel(startDate = '', endDate = '') {
    const normalizedStartDate = normalizeDateKey(startDate);
    const normalizedEndDate = normalizeDateKey(endDate) || normalizedStartDate;
    if (!normalizedStartDate) {
        return 'No date selected';
    }

    if (normalizedStartDate === normalizedEndDate) {
        return formatDisplayDate(normalizedStartDate);
    }

    return `${formatDisplayDate(normalizedStartDate)} to ${formatDisplayDate(normalizedEndDate)}`;
}

function formatMonthLabel(value) {
    const date = value instanceof Date ? value : parseDateKey(value);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return 'Calendar';
    }

    return date.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });
}

function formatDisplayDate(value = '') {
    const parsed = value instanceof Date
        ? value
        : parseDateKey(value);
    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
        return String(value || '').trim() || 'No date';
    }

    return parsed.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function getMonthStartDate(value = '') {
    const parsed = value instanceof Date
        ? new Date(value.getFullYear(), value.getMonth(), 1, 12, 0, 0, 0)
        : parseDateKey(value);
    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0, 0);
    }
    return new Date(parsed.getFullYear(), parsed.getMonth(), 1, 12, 0, 0, 0);
}

function shiftMonth(value, offset = 0) {
    const baseDate = getMonthStartDate(value);
    return new Date(baseDate.getFullYear(), baseDate.getMonth() + Number(offset || 0), 1, 12, 0, 0, 0);
}

function addDays(value, days = 0) {
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

function eachDateInRange(startDate = '', endDate = '', iteratee = () => {}) {
    const start = parseDateKey(startDate);
    const end = parseDateKey(endDate);
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
