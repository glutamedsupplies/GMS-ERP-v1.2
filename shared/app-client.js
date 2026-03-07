(function attachAppClient() {
    const SESSION_KEYS = ['userId', 'userName', 'role', 'companyId', 'companyCode'];
    const KNOWN_SECTIONS = new Set(['employee', 'head_admin', 'super_admin']);
    const USER_FEATURE_DEFAULTS = Object.freeze({
        expenses: true,
        order_form: true,
        inventory: true,
        composite: true,
        lbc_tracking: false
    });
    const mobileTableObservers = new WeakMap();
    const mobileTableRefreshFrames = new WeakMap();
    let mobileTableDocumentObserver = null;
    let redirectPending = false;

    ensureResponsiveDocumentSetup();

    function ensureResponsiveDocumentSetup() {
        const metadata = getPathMetadata();
        ensureViewportMeta();
        applyAppDataAttributes(metadata);
        ensureMobileStylesheet(metadata);
        ensureMobileTableCardMode();
    }

    function getPathMetadata() {
        const normalizedPath = String(window.location.pathname || '').replace(/\\/g, '/');
        const segments = normalizedPath.split('/').filter(Boolean);
        const fileName = segments[segments.length - 1] || 'index.html';
        const parentSegment = segments[segments.length - 2] || '';

        return {
            page: fileName.replace(/\.html$/i, '') || 'index',
            section: KNOWN_SECTIONS.has(parentSegment) ? parentSegment : 'root'
        };
    }

    function ensureViewportMeta() {
        if (document.querySelector('meta[name="viewport"]')) {
            return;
        }

        const viewportMeta = document.createElement('meta');
        viewportMeta.name = 'viewport';
        viewportMeta.content = 'width=device-width, initial-scale=1.0';
        document.head?.appendChild(viewportMeta);
    }

    function applyAppDataAttributes(metadata) {
        document.documentElement.dataset.appPage = metadata.page;
        document.documentElement.dataset.appSection = metadata.section;
        document.documentElement.dataset.appMobile = 'true';

        if (!document.body) {
            return;
        }

        document.body.dataset.appPage = metadata.page;
        document.body.dataset.appSection = metadata.section;
        document.body.dataset.appMobile = 'true';
    }

    function ensureMobileStylesheet(metadata) {
        if (document.querySelector('link[data-app-mobile-stylesheet="true"]')) {
            return;
        }

        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.dataset.appMobileStylesheet = 'true';
        stylesheet.href = resolveMobileStylesheetHref(metadata.section);
        document.head?.appendChild(stylesheet);
    }

    function resolveMobileStylesheetHref(section) {
        const scriptSource = getAppClientScriptSource();

        if (scriptSource) {
            return new URL('mobile.css', scriptSource).href;
        }

        return section === 'root' ? 'shared/mobile.css' : '../shared/mobile.css';
    }

    function getAppClientScriptSource() {
        const activeScript = document.currentScript;
        if (activeScript?.src) {
            return activeScript.src;
        }

        const matchingScript = Array.from(document.scripts).find((script) =>
            /app-client\.js(?:\?|$)/i.test(script.src || '')
        );

        return matchingScript?.src || '';
    }

    function ensureMobileTableCardMode() {
        const bootstrap = () => {
            enhanceTablesForMobile(document);
            observeDocumentForMobileTables();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
            return;
        }

        bootstrap();
    }

    function observeDocumentForMobileTables() {
        if (mobileTableDocumentObserver || !document.body) {
            return;
        }

        mobileTableDocumentObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof Element)) {
                        return;
                    }

                    if (node.matches('table')) {
                        prepareTableForMobileCards(node);
                    }

                    node.querySelectorAll('table').forEach((table) => {
                        prepareTableForMobileCards(table);
                    });
                });
            });
        });

        mobileTableDocumentObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function enhanceTablesForMobile(rootNode) {
        if (!rootNode || !rootNode.querySelectorAll) {
            return;
        }

        rootNode.querySelectorAll('table').forEach((table) => {
            prepareTableForMobileCards(table);
        });
    }

    function prepareTableForMobileCards(table) {
        if (!(table instanceof HTMLTableElement)) {
            return;
        }

        observeTableForMobileRows(table);

        if (!isTableEligibleForMobileCards(table)) {
            table.removeAttribute('data-mobile-card-ready');
            return;
        }

        applyMobileLabelsToTable(table);
    }

    function observeTableForMobileRows(table) {
        if (mobileTableObservers.has(table)) {
            return;
        }

        const observer = new MutationObserver(() => {
            scheduleMobileTableRefresh(table);
        });

        observer.observe(table, {
            childList: true,
            subtree: true
        });
        mobileTableObservers.set(table, observer);
    }

    function scheduleMobileTableRefresh(table) {
        if (mobileTableRefreshFrames.has(table)) {
            return;
        }

        const frameHandle = window.requestAnimationFrame(() => {
            mobileTableRefreshFrames.delete(table);
            if (!table.isConnected) {
                return;
            }

            prepareTableForMobileCards(table);
        });

        mobileTableRefreshFrames.set(table, frameHandle);
    }

    function isTableEligibleForMobileCards(table) {
        if (table.dataset.mobileCard === 'off' || table.closest('[data-mobile-card="off"]')) {
            return false;
        }

        return Boolean(extractTableHeaderLabels(table).length);
    }

    function applyMobileLabelsToTable(table) {
        const headerLabels = extractTableHeaderLabels(table);
        if (!headerLabels.length) {
            table.removeAttribute('data-mobile-card-ready');
            return;
        }

        const bodyRows = getTableBodyRows(table);
        if (!bodyRows.length) {
            table.removeAttribute('data-mobile-card-ready');
            return;
        }

        table.dataset.mobileCardReady = 'true';

        bodyRows.forEach((row) => {
            applyMobileLabelsToRow(row, headerLabels);
        });
    }

    function extractTableHeaderLabels(table) {
        let headerRow = null;

        if (table.tHead && table.tHead.rows.length) {
            headerRow = table.tHead.rows[table.tHead.rows.length - 1];
        } else {
            headerRow = Array.from(table.rows).find((row) =>
                Array.from(row.cells).some((cell) => cell.tagName === 'TH')
            ) || null;
        }

        if (!headerRow) {
            return [];
        }

        const labels = [];
        Array.from(headerRow.cells).forEach((cell) => {
            if (cell.tagName !== 'TH') {
                return;
            }

            const normalizedLabel = normalizeTableHeaderLabel(cell);
            const columnSpan = getCellSpan(cell);

            for (let index = 0; index < columnSpan; index += 1) {
                labels.push(normalizedLabel || `Column ${labels.length + 1}`);
            }
        });

        return labels;
    }

    function normalizeTableHeaderLabel(headerCell) {
        const explicitLabel = headerCell.getAttribute('data-mobile-label');
        if (explicitLabel) {
            return String(explicitLabel).replace(/\s+/g, ' ').trim();
        }

        return String(headerCell.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function getTableBodyRows(table) {
        if (table.tBodies && table.tBodies.length) {
            return Array.from(table.tBodies).flatMap((tbody) => Array.from(tbody.rows));
        }

        return Array.from(table.rows).filter((row) => row.closest('thead') === null);
    }

    function applyMobileLabelsToRow(row, headerLabels) {
        let columnIndex = 0;

        Array.from(row.cells).forEach((cell) => {
            const columnSpan = getCellSpan(cell);

            if (cell.tagName !== 'TD') {
                columnIndex += columnSpan;
                return;
            }

            const labelSource = String(cell.dataset.appMobileLabel || '').trim().toLowerCase();
            const existingLabel = String(cell.dataset.label || '').trim();
            const shouldAutoLabel = !existingLabel || labelSource === 'auto';

            if (labelSource !== 'custom' && shouldAutoLabel) {
                cell.dataset.label = resolveTableCellLabel(headerLabels, columnIndex, columnSpan);
                cell.dataset.appMobileLabel = 'auto';
            }

            columnIndex += columnSpan;
        });
    }

    function resolveTableCellLabel(headerLabels, columnIndex, columnSpan) {
        const spanLabels = headerLabels
            .slice(columnIndex, columnIndex + columnSpan)
            .filter(Boolean);

        if (!spanLabels.length) {
            return `Column ${columnIndex + 1}`;
        }

        if (spanLabels.length === 1) {
            return spanLabels[0];
        }

        return `${spanLabels[0]} to ${spanLabels[spanLabels.length - 1]}`;
    }

    function getCellSpan(cell) {
        const rawSpan = Number.parseInt(cell.getAttribute('colspan') || '1', 10);
        return Number.isFinite(rawSpan) && rawSpan > 0 ? rawSpan : 1;
    }

    async function callElectronOrHttp(electronCall, httpCall) {
        if (typeof electronCall === 'function') {
            try {
                const result = await electronCall();
                if (result !== undefined) {
                    return result;
                }
            } catch (error) {
                const message = String(error && error.message ? error.message : error || '');
                if (!message.includes('No handler registered')) {
                    throw error;
                }
            }
        }

        return httpCall();
    }

    async function request(path, options = {}) {
        const requestOptions = {
            method: options.method || 'GET',
            headers: { ...(options.headers || {}) },
            credentials: 'same-origin'
        };

        if (options.body !== undefined) {
            requestOptions.headers['Content-Type'] = 'application/json';
            requestOptions.body = typeof options.body === 'string'
                ? options.body
                : JSON.stringify(options.body);
        }

        const response = await fetch(path, requestOptions);
        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
            ? await response.json()
            : { success: response.ok, data: await response.text() };

        if (!response.ok || payload.success === false) {
            const errorMessage = payload.error || `Request failed (${response.status})`;

            if (response.status === 401 && !options.skipAuthRedirect) {
                handleUnauthorized();
            }

            const error = new Error(errorMessage);
            error.code = payload.code || `HTTP_${response.status}`;
            throw error;
        }

        return Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
    }

    function setSessionUser(user) {
        if (!user || !user.id) {
            clearStoredSession();
            return;
        }

        localStorage.setItem('userId', user.id);
        localStorage.setItem('userName', user.name || '');
        localStorage.setItem('role', user.role || 'employee');
        localStorage.setItem('companyId', user.company_id || '');
        localStorage.setItem('companyCode', user.company_code || '');
    }

    function clearStoredSession() {
        SESSION_KEYS.forEach((key) => {
            localStorage.removeItem(key);
        });
        sessionStorage.clear();
    }

    async function clearSession() {
        clearStoredSession();

        try {
            await request('/api/logout', {
                method: 'POST',
                skipAuthRedirect: true
            });
        } catch (_error) {
            // Ignore logout transport errors after the local session is cleared.
        }
    }

    function getSession() {
        return {
            userId: localStorage.getItem('userId'),
            userName: localStorage.getItem('userName') || '',
            role: localStorage.getItem('role') || '',
            companyId: localStorage.getItem('companyId') || '',
            companyCode: localStorage.getItem('companyCode') || ''
        };
    }

    function buildAvatarUrl(name, background = '4e73df', color = 'ffffff') {
        return `https://ui-avatars.com/api/?background=${background}&color=${color}&name=${encodeURIComponent(name || 'User')}`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function navigateTo(path) {
        const targetWindow = window.top && window.top !== window
            ? window.top
            : window;

        if (targetWindow.location.pathname !== path) {
            targetWindow.location.replace(path);
        }
    }

    function redirectToLogin() {
        navigateTo('/index.html');
    }

    function normalizeRole(role) {
        return String(role || '').trim().toLowerCase();
    }

    function isEmployeeLikeRole(role) {
        const normalizedRole = normalizeRole(role);
        return normalizedRole === 'employee' || normalizedRole === 'staff';
    }

    function redirectByRole(role) {
        const normalizedRole = normalizeRole(role);
        if (normalizedRole === 'super_admin') {
            navigateTo('/super_admin/dashboard.html');
            return;
        }

        if (normalizedRole === 'head_admin' || normalizedRole === 'company_admin') {
            navigateTo('/head_admin/dashboard.html');
            return;
        }

        navigateTo('/employee/employee.html');
    }

    function attachEmployeeBackButton(session, {
        id = 'appEmployeeBackButton',
        label = 'Back to Employee Dashboard',
        path = '/employee/employee.html',
        top = '14px',
        right = '14px'
    } = {}) {
        if (!isEmployeeLikeRole(session?.role)) {
            return null;
        }

        const existing = document.getElementById(id);
        if (existing) {
            return existing;
        }

        if (!document.body) {
            return null;
        }

        const button = document.createElement('button');
        button.id = id;
        button.type = 'button';
        button.textContent = String(label || 'Back');
        button.dataset.appEmployeeBackButton = 'true';
        Object.assign(button.style, {
            position: 'fixed',
            top: String(top || '14px'),
            right: String(right || '14px'),
            zIndex: '2147483647',
            padding: '10px 14px',
            borderRadius: '999px',
            border: '1px solid rgba(17, 24, 39, 0.16)',
            backgroundColor: '#111827',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: '700',
            lineHeight: '1',
            cursor: 'pointer',
            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.22)'
        });
        button.addEventListener('click', () => {
            navigateTo(path);
        });
        document.body.appendChild(button);
        return button;
    }

    function isCompanyAdminRole(role) {
        const normalizedRole = normalizeRole(role);
        return normalizedRole === 'head_admin' || normalizedRole === 'company_admin';
    }

    function normalizeUserFeatureAccess(value = {}) {
        const source = (value && typeof value === 'object' && !Array.isArray(value))
            ? value
            : {};

        return Object.keys(USER_FEATURE_DEFAULTS).reduce((access, key) => {
            access[key] = Object.prototype.hasOwnProperty.call(source, key)
                ? Boolean(source[key])
                : Boolean(USER_FEATURE_DEFAULTS[key]);
            return access;
        }, {});
    }

    function normalizeFeatureList(value = []) {
        if (Array.isArray(value)) {
            return value
                .map((item) => String(item || '').trim().toLowerCase())
                .filter(Boolean);
        }

        if (typeof value === 'string') {
            return value
                .split(',')
                .map((item) => item.trim().toLowerCase())
                .filter(Boolean);
        }

        return [];
    }

    function hasUserFeatureAccess(user, featureKey) {
        const key = String(featureKey || '').trim().toLowerCase();
        if (!key) {
            return true;
        }

        const access = normalizeUserFeatureAccess(user?.feature_access || {});
        return Boolean(access[key]);
    }

    function canEmployeeAccessCompanyAdminView({ expectedRole = '', user = null, allowedFeatures = [] } = {}) {
        const normalizedExpectedRole = String(expectedRole || '').trim().toLowerCase();
        if (!['head_admin', 'company_admin'].includes(normalizedExpectedRole)) {
            return false;
        }

        if (!isEmployeeLikeRole(user?.role)) {
            return false;
        }

        const featureKeys = normalizeFeatureList(allowedFeatures);
        if (!featureKeys.length) {
            return false;
        }

        return featureKeys.every((featureKey) => hasUserFeatureAccess(user, featureKey));
    }

    function roleMatches(expectedRole, actualRole) {
        const normalizedExpected = normalizeRole(expectedRole);
        const normalizedActual = normalizeRole(actualRole);
        if (!normalizedExpected) {
            return true;
        }
        if (normalizedExpected === normalizedActual) {
            return true;
        }
        if (normalizedExpected === 'employee' && isEmployeeLikeRole(normalizedActual)) {
            return true;
        }
        if ((normalizedExpected === 'head_admin' || normalizedExpected === 'company_admin') && isCompanyAdminRole(normalizedActual)) {
            return true;
        }
        return false;
    }

    function handleUnauthorized() {
        clearStoredSession();

        if (redirectPending) {
            return;
        }

        redirectPending = true;
        window.setTimeout(() => {
            redirectPending = false;
            redirectToLogin();
        }, 0);
    }

    async function getCurrentSession() {
        const user = await request('/api/session', {
            skipAuthRedirect: true
        });

        if (user && user.id) {
            setSessionUser(user);
            return user;
        }

        clearStoredSession();
        return null;
    }

    async function ensureSession({ role = '', allowEmployeeFeature = '', allowEmployeeFeatures = [] } = {}) {
        const user = await getCurrentSession();
        if (!user) {
            redirectToLogin();
            return null;
        }

        const allowedFeatures = Array.from(new Set([
            ...normalizeFeatureList(allowEmployeeFeature),
            ...normalizeFeatureList(allowEmployeeFeatures)
        ]));
        const employeeOverrideAllowed = canEmployeeAccessCompanyAdminView({
            expectedRole: role,
            user,
            allowedFeatures
        });

        if (role && !roleMatches(role, user.role) && !employeeOverrideAllowed) {
            redirectByRole(user.role);
            return null;
        }

        return {
            userId: user.id,
            userName: user.name || '',
            role: user.role || '',
            companyId: user.company_id || '',
            companyCode: user.company_code || '',
            feature_access: normalizeUserFeatureAccess(user.feature_access || {})
        };
    }

    window.appClient = {
        request,
        buildAvatarUrl,
        clearSession,
        escapeHtml,
        getSession,
        getCurrentSession,
        ensureSession,
        attachEmployeeBackButton,
        hasUserFeatureAccess,
        normalizeUserFeatureAccess,
        setSessionUser,
        getServerInfo: () => request('/api/server-info', {
            skipAuthRedirect: true
        }),
        getClientConfig: () => request('/api/client-config'),
        getPublicBranding: ({ companyCode = '' } = {}) => request(`/api/public-branding?companyCode=${encodeURIComponent(companyCode)}`, {
            skipAuthRedirect: true
        }),
        createPublicCustomerRequest: (payload) => request('/api/public/customer-requests', {
            method: 'POST',
            body: payload,
            skipAuthRedirect: true
        }),
        getPublicCustomerRequest: ({ companyCode = '', requestCode = '', contactNumber = '' } = {}) => request(
            `/api/public/customer-requests/${encodeURIComponent(requestCode)}?companyCode=${encodeURIComponent(companyCode)}&contactNumber=${encodeURIComponent(contactNumber)}`,
            { skipAuthRedirect: true }
        ),
        updatePublicCustomerRequest: (requestCode, payload = {}, { companyCode = '', contactNumber = '' } = {}) => request(
            `/api/public/customer-requests/${encodeURIComponent(requestCode)}?companyCode=${encodeURIComponent(companyCode)}&contactNumber=${encodeURIComponent(contactNumber)}`,
            {
                method: 'PUT',
                body: {
                    ...payload,
                    companyCode,
                    authContactNumber: payload.authContactNumber || contactNumber
                },
                skipAuthRedirect: true
            }
        ),
        sendPublicCustomerRequestMessage: (requestCode, payload = {}, { companyCode = '', contactNumber = '' } = {}) => request(
            `/api/public/customer-requests/${encodeURIComponent(requestCode)}/messages?companyCode=${encodeURIComponent(companyCode)}`,
            {
                method: 'POST',
                body: {
                    ...payload,
                    companyCode,
                    authContactNumber: payload.authContactNumber || contactNumber
                },
                skipAuthRedirect: true
            }
        ),
        getBootstrap: () => request('/api/bootstrap'),
        parseOrderDraftWithAi: (payload) => request('/api/order-form/ai-parse', {
            method: 'POST',
            body: payload
        }),
        listClients: (filter = '') => request(`/api/clients?filter=${encodeURIComponent(filter)}`),
        addClient: (payload) => request('/api/clients', {
            method: 'POST',
            body: payload
        }),
        updateClient: (id, payload) => request(`/api/clients/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteClient: (id) => request(`/api/clients/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        }),
        listCustomerRequests: ({ filter = '', status = '', limit = 200 } = {}) => request(
            `/api/customer-requests?filter=${encodeURIComponent(filter)}&status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}`
        ),
        getCustomerRequestThread: (requestCode) => request(`/api/customer-requests/${encodeURIComponent(requestCode)}`),
        updateCustomerRequestByCode: (requestCode, payload) => request(`/api/customer-requests/${encodeURIComponent(requestCode)}`, {
            method: 'PATCH',
            body: payload
        }),
        sendCustomerRequestMessage: (requestCode, payload) => request(`/api/customer-requests/${encodeURIComponent(requestCode)}/messages`, {
            method: 'POST',
            body: payload
        }),
        getSalesReferences: () => request('/api/sales/references'),
        listProducts: (filter = '') => request(`/api/products?filter=${encodeURIComponent(filter)}`),
        listInventoryVariants: ({ productName = '', setName = '', search = '' } = {}) => callElectronOrHttp(
            () => window.electronAPI?.inventoryVariants?.list({ productName, setName, search }),
            () => request(`/api/inventory-variants?productName=${encodeURIComponent(productName)}&setName=${encodeURIComponent(setName)}&search=${encodeURIComponent(search)}`)
        ),
        createInventoryVariant: (payload) => request('/api/inventory-variants', {
            method: 'POST',
            body: payload
        }),
        updateInventoryVariant: (id, payload) => request(`/api/inventory-variants/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteInventoryVariant: (id) => request(`/api/inventory-variants/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        }),
        importInventoryVariants: (payload = {}) => request('/api/inventory-variants/import', {
            method: 'POST',
            body: payload
        }),
        listInventoryVariantProducts: () => callElectronOrHttp(
            () => window.electronAPI?.inventoryVariants?.listProducts(),
            () => request('/api/inventory-variants/products')
        ),
        listInventoryVariantSets: (productName) => callElectronOrHttp(
            () => window.electronAPI?.inventoryVariants?.listSetsByProduct(productName),
            () => request(`/api/inventory-variants/sets?productName=${encodeURIComponent(productName || '')}`)
        ),
        resolveInventoryVariant: ({ productName = '', setName = '' } = {}) => callElectronOrHttp(
            () => window.electronAPI?.inventoryVariants?.resolve({ productName, setName }),
            () => request(`/api/inventory-variants/resolve?productName=${encodeURIComponent(productName)}&setName=${encodeURIComponent(setName)}`)
        ),
        listInventory: ({ branch = '', filter = '' } = {}) => request(`/api/inventory?branch=${encodeURIComponent(branch)}&filter=${encodeURIComponent(filter)}`),
        updateInventoryQuantity: (helper, payload) => request(`/api/inventory/${encodeURIComponent(helper)}`, {
            method: 'PATCH',
            body: payload
        }),
        deleteInventoryItem: (inventoryId, { branch = '' } = {}) => request(
            `/api/inventory/${encodeURIComponent(inventoryId)}?branch=${encodeURIComponent(branch)}`,
            { method: 'DELETE' }
        ),
        listCompositeItems: (filter = '') => request(`/api/composite-items?filter=${encodeURIComponent(filter)}`),
        upsertCompositeItem: (payload) => request('/api/composite-items', {
            method: 'POST',
            body: payload
        }),
        deleteCompositeItem: (compositeKey) => request(`/api/composite-items/${encodeURIComponent(compositeKey)}`, {
            method: 'DELETE'
        }),
        listSales: ({ dateFrom = '', dateTo = '', branch = '', cashBranch = '', paymentOption = '', adminName = '', salesRepresentative = '', search = '' } = {}) => request(
            `/api/sales?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&branch=${encodeURIComponent(branch)}&cashBranch=${encodeURIComponent(cashBranch)}&paymentOption=${encodeURIComponent(paymentOption)}&adminName=${encodeURIComponent(adminName)}&salesRepresentative=${encodeURIComponent(salesRepresentative)}&search=${encodeURIComponent(search)}`
        ),
        addSale: (payload) => request('/api/sales', {
            method: 'POST',
            body: payload
        }),
        listLbcTracking: ({ branch = '', search = '', deliveryStatus = '', quickFilter = 'all' } = {}) => request(
            `/api/lbc-tracking?branch=${encodeURIComponent(branch)}&search=${encodeURIComponent(search)}&deliveryStatus=${encodeURIComponent(deliveryStatus)}&quickFilter=${encodeURIComponent(quickFilter)}`
        ),
        listLbcCollections: ({ branch = '', search = '', status = 'all' } = {}) => request(
            `/api/lbc-tracking/collections?branch=${encodeURIComponent(branch)}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`
        ),
        updateLbcTracking: (orderKey, payload) => request(`/api/lbc-tracking/${encodeURIComponent(orderKey)}`, {
            method: 'PUT',
            body: payload
        }),
        confirmLbcCollection: (orderKey, payload = {}) => request(`/api/lbc-tracking/collections/${encodeURIComponent(orderKey)}/confirm`, {
            method: 'POST',
            body: payload
        }),
        bulkAssignLbcTracking: (payload = {}) => request('/api/lbc-tracking/bulk-assign', {
            method: 'POST',
            body: payload
        }),
        refreshLbcTrackingStatuses: (payload = {}) => request('/api/lbc-tracking/refresh', {
            method: 'POST',
            body: payload
        }),
        listExpenses: ({ dateFrom = '', dateTo = '', branch = '', search = '' } = {}) => request(
            `/api/expenses?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&branch=${encodeURIComponent(branch)}&search=${encodeURIComponent(search)}`
        ),
        addExpense: (payload) => request('/api/expenses', {
            method: 'POST',
            body: payload
        }),
        updateExpense: (entryId, payload) => request(`/api/expenses/${encodeURIComponent(entryId)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteExpense: (entryId) => request(`/api/expenses/${encodeURIComponent(entryId)}`, {
            method: 'DELETE'
        }),
        clearExpenses: () => request('/api/expenses', {
            method: 'DELETE'
        }),
        listCashIncome: ({ dateFrom = '', dateTo = '', branch = '', search = '' } = {}) => request(
            `/api/cash-income?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&branch=${encodeURIComponent(branch)}&search=${encodeURIComponent(search)}`
        ),
        addCashIncome: (payload) => request('/api/cash-income', {
            method: 'POST',
            body: payload
        }),
        updateCashIncome: (entryId, payload) => request(`/api/cash-income/${encodeURIComponent(entryId)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteCashIncome: (entryId) => request(`/api/cash-income/${encodeURIComponent(entryId)}`, {
            method: 'DELETE'
        }),
        clearCashIncome: () => request('/api/cash-income', {
            method: 'DELETE'
        }),
        createOrder: (payload) => request('/api/sales', {
            method: 'POST',
            body: payload
        }),
        getOrder: (orderNumber) => callElectronOrHttp(
            () => window.electronAPI?.orders?.get(orderNumber),
            () => request(`/api/orders/${encodeURIComponent(orderNumber)}`)
        ),
        updateOrder: (orderNumber, payload) => request(`/api/orders/${encodeURIComponent(orderNumber)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteOrder: (orderNumber) => request(`/api/orders/${encodeURIComponent(orderNumber)}`, {
            method: 'DELETE'
        }),
        previewOrderNumber: (saleDate = '') => callElectronOrHttp(
            () => window.electronAPI?.orders?.preview(saleDate),
            () => request(`/api/orders/next-number?saleDate=${encodeURIComponent(saleDate)}`)
        ),
        login: async (idOrPayload, password = '') => {
            const payload = typeof idOrPayload === 'object' && idOrPayload
                ? {
                    companyCode: String(idOrPayload.companyCode || idOrPayload.company_code || '').trim(),
                    username: String(idOrPayload.username || idOrPayload.id || '').trim(),
                    password: String(idOrPayload.password || '').trim()
                }
                : {
                    companyCode: '',
                    username: String(idOrPayload || '').trim(),
                    password: String(password || '').trim()
                };

            const user = await request('/api/login', {
                method: 'POST',
                body: payload,
                skipAuthRedirect: true
            });

            setSessionUser(user);
            return user;
        },
        getCompanySettings: () => request('/api/company/settings'),
        updateCompanySettings: (payload) => request('/api/company/settings', {
            method: 'PUT',
            body: payload
        }),
        getCompanyWorkspaceConfig: () => request('/api/company/workspace-config'),
        updateCompanyWorkspaceConfig: (payload) => request('/api/company/workspace-config', {
            method: 'PUT',
            body: payload
        }),
        getCompanyInvoiceTemplate: () => request('/api/company/invoice-template'),
        updateCompanyInvoiceTemplate: (payload) => request('/api/company/invoice-template', {
            method: 'PUT',
            body: payload
        }),
        listBranches: () => request('/api/branches'),
        createBranch: (payload) => request('/api/branches', {
            method: 'POST',
            body: payload
        }),
        updateBranch: (branchId, payload) => request(`/api/branches/${encodeURIComponent(branchId)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteBranch: (branchId) => request(`/api/branches/${encodeURIComponent(branchId)}`, {
            method: 'DELETE'
        }),
        listUsers: ({ role = '', filter = '' } = {}) => request(`/api/users?role=${encodeURIComponent(role)}&filter=${encodeURIComponent(filter)}`),
        createUser: (payload) => request('/api/users', {
            method: 'POST',
            body: payload
        }),
        updateUser: (userId, payload) => request(`/api/users/${encodeURIComponent(userId)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteUser: (userId) => request(`/api/users/${encodeURIComponent(userId)}`, {
            method: 'DELETE'
        }),
        getSuperBootstrap: () => request('/api/super/bootstrap'),
        listSuperCompanies: () => request('/api/super/companies'),
        listSuperCustomerRequests: ({ companyId = '', filter = '', status = '', limit = 200 } = {}) => request(
            `/api/super/customer-requests?companyId=${encodeURIComponent(companyId)}&filter=${encodeURIComponent(filter)}&status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}`
        ),
        getSuperCustomerRequestThread: (companyId, requestCode) => request(
            `/api/super/customer-requests/${encodeURIComponent(requestCode)}?companyId=${encodeURIComponent(companyId)}`
        ),
        updateSuperCustomerRequestByCode: (companyId, requestCode, payload = {}) => request(
            `/api/super/customer-requests/${encodeURIComponent(requestCode)}`,
            {
                method: 'PATCH',
                body: {
                    ...payload,
                    companyId
                }
            }
        ),
        sendSuperCustomerRequestMessage: (companyId, requestCode, payload = {}) => request(
            `/api/super/customer-requests/${encodeURIComponent(requestCode)}/messages`,
            {
                method: 'POST',
                body: {
                    ...payload,
                    companyId
                }
            }
        ),
        createSuperCompany: (payload) => request('/api/super/companies', {
            method: 'POST',
            body: payload
        }),
        updateSuperCompany: (companyId, payload) => request(`/api/super/companies/${encodeURIComponent(companyId)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteSuperCompany: (companyId) => request(`/api/super/companies/${encodeURIComponent(companyId)}`, {
            method: 'DELETE'
        }),
        updateSuperCompanyAdminCredentials: (companyId, payload) => request(`/api/super/companies/${encodeURIComponent(companyId)}/admin-credentials`, {
            method: 'PUT',
            body: payload
        }),
        listSuperPlans: () => request('/api/super/plans'),
        createSuperPlan: (payload) => request('/api/super/plans', {
            method: 'POST',
            body: payload
        }),
        updateSuperPlan: (planId, payload) => request(`/api/super/plans/${encodeURIComponent(planId)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteSuperPlan: (planId) => request(`/api/super/plans/${encodeURIComponent(planId)}`, {
            method: 'DELETE'
        }),
        updateSuperCompanySubscription: (companyId, payload) => request(`/api/super/companies/${encodeURIComponent(companyId)}/subscription`, {
            method: 'PUT',
            body: payload
        }),
        updateSuperCompanyAddon: (companyId, addonKey, payload) => request(`/api/super/companies/${encodeURIComponent(companyId)}/addons/${encodeURIComponent(addonKey)}`, {
            method: 'PUT',
            body: payload
        }),
        getSuperCompanyUsage: (companyId, month = '') => request(`/api/super/companies/${encodeURIComponent(companyId)}/usage?month=${encodeURIComponent(month)}`),
        listSuperAuditLogs: ({ companyId = '', limit = 200, offset = 0 } = {}) => request(`/api/super/audit-logs?companyId=${encodeURIComponent(companyId)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`),
        getUser: (userId) => request(`/api/users/${encodeURIComponent(userId)}`),
        saveUserProfile: (payload) => request(`/api/users/${encodeURIComponent(payload.id)}/profile`, {
            method: 'PUT',
            body: payload
        }),
        listEmployees: (filter = '') => request(`/api/employees?filter=${encodeURIComponent(filter)}`),
        addEmployee: (payload) => request('/api/employees', {
            method: 'POST',
            body: payload
        }),
        updateEmployee: (employeeId, payload) => request(`/api/employees/${encodeURIComponent(employeeId)}`, {
            method: 'PUT',
            body: payload
        }),
        updateEmployeeTime: (employeeId, field, value) => request(`/api/employees/${encodeURIComponent(employeeId)}/schedule`, {
            method: 'PATCH',
            body: { field, value }
        }),
        updateEmployeeSchedule: (employeeId, weeklySchedule) => request(`/api/employees/${encodeURIComponent(employeeId)}/schedule`, {
            method: 'PATCH',
            body: { weeklySchedule }
        }),
        deleteEmployee: (employeeId) => request(`/api/employees/${encodeURIComponent(employeeId)}`, {
            method: 'DELETE'
        }),
        getAttendanceByUser: (userId) => request(`/api/attendance/user/${encodeURIComponent(userId)}`),
        getUserTimeCard: (userId, { year, month }) => request(`/api/attendance/user/${encodeURIComponent(userId)}/time-card?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`),
        getUserWeeklyTimeCard: (userId, { dateKey = '' } = {}) => request(`/api/attendance/user/${encodeURIComponent(userId)}/weekly-card?dateKey=${encodeURIComponent(dateKey)}`),
        getTodayAttendanceRecord: (userId) => request(`/api/attendance/user/${encodeURIComponent(userId)}/today`),
        getAttendanceForMonth: ({ userId, year, month }) => request(`/api/attendance/month?userId=${encodeURIComponent(userId)}&year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`),
        getAttendanceReport: ({ employeeId = 'all', range = 'daily', dateKey = '' }) => request(`/api/attendance/report?employeeId=${encodeURIComponent(employeeId)}&range=${encodeURIComponent(range)}&dateKey=${encodeURIComponent(dateKey)}`),
        getDailyAttendanceSnapshot: (dateKey = '') => request(`/api/attendance/snapshot?dateKey=${encodeURIComponent(dateKey)}`),
        updateDailyAttendanceStatus: (userId, status, dateKey = '') => request(`/api/attendance/status/${encodeURIComponent(userId)}`, {
            method: 'PATCH',
            body: { status, dateKey }
        }),
        recordTimeIn: (userId) => request('/api/attendance/time-in', {
            method: 'POST',
            body: { userId }
        }),
        recordTimeOut: (userId) => request('/api/attendance/time-out', {
            method: 'POST',
            body: { userId }
        })
    };
})();
