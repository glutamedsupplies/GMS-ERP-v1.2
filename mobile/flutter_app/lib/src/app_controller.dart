import 'dart:async';

import 'package:flutter/foundation.dart';

import 'models.dart';
import 'services/gms_api_client.dart';
import 'services/google_oauth_service.dart';
import 'services/session_store.dart';

enum AppScreen {
  splash,
  login,
  workspace,
}

enum AuthMode {
  login,
  forgotPassword,
}

class AppController extends ChangeNotifier {
  AppController({
    GmsApiClient? apiClient,
    GmsGoogleOAuthService? googleOAuthService,
    GmsSessionStore? sessionStore,
  })  : _apiClient = apiClient ?? GmsApiClient(),
        _googleOAuthService = googleOAuthService ?? GmsGoogleOAuthService(),
        _sessionStore = sessionStore ?? GmsSessionStore();

  final GmsApiClient _apiClient;
  final GmsGoogleOAuthService _googleOAuthService;
  final GmsSessionStore _sessionStore;

  Timer? _brandingDebounce;
  StreamSubscription<Uri>? _googleCallbackSubscription;
  bool _googleLoginPending = false;
  bool _googleCallbackHandling = false;

  AppScreen screen = AppScreen.splash;
  Branding branding = const Branding();
  SessionUser? user;
  BootstrapPayload? bootstrap;

  String companyCode = '';
  String username = '';
  String password = '';
  String errorMessage = '';
  String infoMessage = '';
  String lastSyncedLabel = '';
  bool isBusy = false;
  AuthMode authMode = AuthMode.login;

  String selectedTabId = 'overview';
  String serverDateKey = '';
  DateTime selectedCutoffDate = DateTime.now();

  AttendanceRecord? todayAttendance;
  List<AttendanceRecord> cutoffCard = const <AttendanceRecord>[];
  List<AttendanceRecord> attendanceSnapshot = const <AttendanceRecord>[];
  List<InventoryItem> inventory = const <InventoryItem>[];
  List<SessionUser> teamMembers = const <SessionUser>[];
  List<SessionUser> people = const <SessionUser>[];
  BulletinFeed bulletin = const BulletinFeed();
  CompanySettings? companySettings;

  String inventoryBranch = '';
  String inventoryFilter = '';
  String teamFilter = '';
  String peopleFilter = '';

  final Set<String> _loadingSections = <String>{};
  final Map<String, String> _sectionErrors = <String, String>{};

  static const int lowStockThreshold = 5;

  String get apiBaseUrl => _apiClient.baseUrl;

  bool get isHeadAdminLike => user?.isHeadAdminLike ?? false;
  bool get hasAttendanceModule => bootstrap?.modules['attendance'] ?? false;
  bool get hasReportsModule => bootstrap?.modules['reports'] ?? false;
  bool get hasInventoryModule => bootstrap?.modules['inventory'] ?? false;
  bool get canUseInventory =>
      hasInventoryModule &&
      (isHeadAdminLike ||
          user?.featureAccess['inventory'] == true ||
          user?.featureAccess['order_form'] == true);
  bool get canSeeBulletin => bootstrap != null;
  bool get canSeeAdminAttendance => isHeadAdminLike && hasAttendanceModule;
  bool get canSeePeople => isHeadAdminLike;
  bool get canSeeTeam => !isHeadAdminLike;

  List<String> get availableTabIds {
    final tabs = <String>['overview'];
    if (hasAttendanceModule) {
      tabs.add('attendance');
      if (!isHeadAdminLike) {
        tabs.add('timecard');
      }
    }
    if (canUseInventory) {
      tabs.add('inventory');
    }
    if (canSeePeople) {
      tabs.add('people');
    }
    if (isHeadAdminLike) {
      tabs.add('branches');
    }
    if (canSeeTeam) {
      tabs.add('team');
    }
    if (canSeeBulletin && isHeadAdminLike) {
      tabs.add('bulletin');
    }
    tabs.add('settings');
    return tabs;
  }

  bool isSectionLoading(String id) => _loadingSections.contains(id);
  String sectionError(String id) => _sectionErrors[id] ?? '';

  Future<void> initialize() async {
    final stored = await _sessionStore.load();
    companyCode = stored.companyCode;
    username = stored.username;
    user = stored.user;
    _apiClient.cookieHeader = stored.cookieHeader;
    _bindGoogleCallbackListener();
    if (companyCode.isNotEmpty) {
      await refreshBranding(companyCode, notify: false);
    }
    final initialGoogleCallback =
        await _googleOAuthService.getInitialGoogleCallback();
    if (initialGoogleCallback != null) {
      await _completeGoogleLoginFromCallback(initialGoogleCallback);
      return;
    }
    await restoreSession();
  }

  void updateCompanyCode(String value) {
    companyCode = value.trim();
    errorMessage = '';
    infoMessage = '';
    notifyListeners();
    unawaited(
      _sessionStore.saveLoginHints(
          companyCode: companyCode, username: username),
    );
    _brandingDebounce?.cancel();
    _brandingDebounce = Timer(const Duration(milliseconds: 220), () {
      if (companyCode.isEmpty) {
        branding = const Branding();
        notifyListeners();
        return;
      }
      unawaited(refreshBranding(companyCode));
    });
  }

  void updateUsername(String value) {
    username = value.trim();
    errorMessage = '';
    notifyListeners();
    unawaited(
      _sessionStore.saveLoginHints(
          companyCode: companyCode, username: username),
    );
  }

  void updatePassword(String value) {
    password = value;
    errorMessage = '';
    notifyListeners();
  }

  Future<void> refreshBranding(String code, {bool notify = true}) async {
    final requestedCode = code.trim();
    if (requestedCode.isEmpty) {
      branding = const Branding();
      if (notify) {
        notifyListeners();
      }
      return;
    }

    try {
      final nextBranding = await _apiClient.getPublicBranding(requestedCode);
      if (!_isCurrentCompanyCode(requestedCode)) {
        return;
      }
      branding = nextBranding.companyCode.isEmpty
          ? nextBranding.copyWith(companyCode: requestedCode)
          : nextBranding;
      if (notify) {
        notifyListeners();
      }
    } catch (_) {
      if (!_isCurrentCompanyCode(requestedCode)) {
        return;
      }
      branding = branding.copyWith(companyCode: requestedCode);
      if (notify) {
        notifyListeners();
      }
    }
  }

  bool _isCurrentCompanyCode(String code) {
    return companyCode.trim().toLowerCase() == code.trim().toLowerCase();
  }

  Future<void> submitLogin() async {
    if (companyCode.isEmpty) {
      errorMessage = 'Company ID is required.';
      infoMessage = '';
      notifyListeners();
      return;
    }
    if (username.isEmpty) {
      errorMessage = 'Username or email is required.';
      infoMessage = '';
      notifyListeners();
      return;
    }
    if (password.isEmpty) {
      errorMessage = 'Password is required.';
      infoMessage = '';
      notifyListeners();
      return;
    }

    isBusy = true;
    errorMessage = '';
    infoMessage = 'Signing in...';
    notifyListeners();

    try {
      final nextUser = await _apiClient.login(
        companyCode: companyCode,
        username: username,
        password: password,
      );
      await _enterWorkspace(nextUser,
          successMessage: 'Signed in successfully.');
    } catch (error) {
      isBusy = false;
      errorMessage = _messageFor(error, fallback: 'Unable to sign in.');
      infoMessage = '';
      notifyListeners();
    }
  }

  Future<void> submitGoogleLogin() async {
    final requestedCompanyCode = companyCode.trim();
    if (requestedCompanyCode.isEmpty) {
      errorMessage = 'Company ID is required for Google login.';
      infoMessage = '';
      notifyListeners();
      return;
    }

    isBusy = true;
    errorMessage = '';
    infoMessage = 'Opening Google sign-in...';
    _googleLoginPending = true;
    notifyListeners();
    unawaited(
      _sessionStore.saveLoginHints(
        companyCode: requestedCompanyCode,
        username: username,
      ),
    );

    try {
      final authUri = _apiClient.buildMobileGoogleLoginUri(requestedCompanyCode);
      await _googleOAuthService.launchGoogleSignIn(authUri);
      isBusy = false;
      infoMessage =
          'Finish Google sign-in in your browser. The app will continue automatically.';
      notifyListeners();
    } catch (error) {
      _googleLoginPending = false;
      isBusy = false;
      errorMessage = _messageFor(
        error,
        fallback: 'Unable to complete Google login.',
      );
      infoMessage = '';
      notifyListeners();
    }
  }

  Future<void> restoreSession() async {
    isBusy = true;
    screen = AppScreen.splash;
    errorMessage = '';
    infoMessage = 'Restoring session...';
    notifyListeners();

    try {
      final nextUser = await _apiClient.restoreSession();
      if (nextUser == null) {
        await _sessionStore.clearSession();
        isBusy = false;
        screen = AppScreen.login;
        authMode = AuthMode.login;
        infoMessage = '';
        errorMessage = '';
        notifyListeners();
        return;
      }

      await _enterWorkspace(nextUser, successMessage: 'Session restored.');
    } catch (error) {
      _apiClient.cookieHeader = '';
      await _sessionStore.clearSession();
      isBusy = false;
      screen = AppScreen.login;
      authMode = AuthMode.login;
      infoMessage = '';
      errorMessage = _messageFor(error, fallback: 'Unable to restore session.');
      notifyListeners();
    }
  }

  Future<void> _enterWorkspace(
    SessionUser nextUser, {
    required String successMessage,
  }) async {
    user = nextUser;
    companyCode =
        nextUser.companyCode.isEmpty ? companyCode : nextUser.companyCode;
    var usedFallbackBootstrap = false;
    var workspaceEntryMessage = successMessage;
    BootstrapPayload? nextBootstrap;
    try {
      nextBootstrap = await _apiClient.getBootstrap();
    } catch (error) {
      usedFallbackBootstrap = true;
      nextBootstrap = _buildFallbackBootstrap(nextUser);
      bootstrap = nextBootstrap;
      branding = nextBootstrap.branding;
      bulletin = nextBootstrap.companyBulletin;
      workspaceEntryMessage =
          '${successMessage.trim()} Finishing workspace sync in the background.';
    }

    bootstrap = nextBootstrap;
    branding = nextBootstrap.branding;
    bulletin = nextBootstrap.companyBulletin;
    if (nextBootstrap.user != null) {
      user = nextBootstrap.user;
    }

    serverDateKey = await _resolveServerDateKey();
    final resolvedDate = _parseDateKey(serverDateKey);
    if (resolvedDate != null) {
      selectedCutoffDate = resolvedDate;
    }
    _syncInventoryBranch();
    _syncSelectedTab();

    await _sessionStore.saveSession(
      companyCode: companyCode,
      username: username,
      cookieHeader: _apiClient.cookieHeader,
      user: user,
    );

    password = '';
    isBusy = false;
    screen = AppScreen.workspace;
    authMode = AuthMode.login;
    errorMessage = '';
    infoMessage = workspaceEntryMessage;
    lastSyncedLabel = _timestampLabel();
    notifyListeners();

    if (usedFallbackBootstrap) {
      unawaited(_reloadBootstrap());
      return;
    }

    await refreshActiveTab(force: true);
  }

  Future<void> reloadWorkspace() async {
    await _reloadBootstrap();
    await refreshActiveTab(force: true);
  }

  Future<void> logout() async {
    isBusy = true;
    infoMessage = 'Signing out...';
    errorMessage = '';
    notifyListeners();

    try {
      await _apiClient.logout();
    } catch (_) {}

    await _sessionStore.clearSession();
    _apiClient.cookieHeader = '';
    bootstrap = null;
    user = null;
    todayAttendance = null;
    cutoffCard = const <AttendanceRecord>[];
    attendanceSnapshot = const <AttendanceRecord>[];
    inventory = const <InventoryItem>[];
    teamMembers = const <SessionUser>[];
    people = const <SessionUser>[];
    companySettings = null;
    bulletin = const BulletinFeed();
    inventoryBranch = '';
    inventoryFilter = '';
    teamFilter = '';
    peopleFilter = '';
    selectedTabId = 'overview';
    isBusy = false;
    password = '';
    screen = AppScreen.login;
    authMode = AuthMode.login;
    lastSyncedLabel = _timestampLabel();
    infoMessage = 'Signed out.';
    errorMessage = '';
    notifyListeners();
  }

  void showLoginMode() {
    authMode = AuthMode.login;
    password = '';
    errorMessage = '';
    infoMessage = '';
    notifyListeners();
  }

  void showForgotPasswordMode() {
    authMode = AuthMode.forgotPassword;
    password = '';
    errorMessage = '';
    infoMessage = '';
    notifyListeners();
  }

  Future<void> requestPasswordResetCode({
    required String companyCode,
    required String email,
  }) async {
    isBusy = true;
    errorMessage = '';
    infoMessage = 'Sending verification code...';
    notifyListeners();

    try {
      await _apiClient.requestPasswordResetCode(
        companyCode: companyCode,
        email: email,
      );
      isBusy = false;
      infoMessage = 'Verification code sent. Check your email inbox.';
      errorMessage = '';
      notifyListeners();
    } catch (error) {
      isBusy = false;
      errorMessage = _messageFor(error, fallback: 'Unable to send reset code.');
      infoMessage = '';
      notifyListeners();
      rethrow;
    }
  }

  Future<void> verifyPasswordResetCode({
    required String companyCode,
    required String email,
    required String code,
  }) async {
    isBusy = true;
    errorMessage = '';
    infoMessage = 'Verifying code...';
    notifyListeners();

    try {
      await _apiClient.verifyPasswordResetCode(
        companyCode: companyCode,
        email: email,
        code: code,
      );
      isBusy = false;
      infoMessage = 'Code verified. You can set a new password now.';
      errorMessage = '';
      notifyListeners();
    } catch (error) {
      isBusy = false;
      errorMessage = _messageFor(error, fallback: 'Unable to verify code.');
      infoMessage = '';
      notifyListeners();
      rethrow;
    }
  }

  Future<void> confirmPasswordReset({
    required String companyCode,
    required String email,
    required String code,
    required String password,
  }) async {
    isBusy = true;
    errorMessage = '';
    infoMessage = 'Resetting password...';
    notifyListeners();

    try {
      await _apiClient.confirmPasswordReset(
        companyCode: companyCode,
        email: email,
        code: code,
        password: password,
      );
      isBusy = false;
      authMode = AuthMode.login;
      infoMessage = 'Password reset successful. You can sign in now.';
      errorMessage = '';
      notifyListeners();
    } catch (error) {
      isBusy = false;
      errorMessage = _messageFor(error, fallback: 'Unable to reset password.');
      infoMessage = '';
      notifyListeners();
      rethrow;
    }
  }

  Future<void> selectTab(String id) async {
    if (selectedTabId == id) {
      return;
    }
    selectedTabId = id;
    _syncSelectedTab();
    notifyListeners();
    await refreshActiveTab();
  }

  Future<void> refreshActiveTab({bool force = false}) async {
    switch (selectedTabId) {
      case 'attendance':
        if (isHeadAdminLike) {
          await loadAttendanceSnapshot(force: force);
        } else {
          await loadTodayAttendance(force: force);
        }
        break;
      case 'timecard':
        await loadCutoffCard(force: force);
        break;
      case 'inventory':
        await loadInventory(force: force);
        break;
      case 'team':
        await loadTeamMembers(force: force);
        break;
      case 'people':
        await loadPeople(force: force);
        break;
      case 'branches':
        await _reloadBootstrap();
        break;
      case 'bulletin':
        await loadBulletin(force: force);
        break;
      case 'settings':
        await loadCompanySettings(force: force);
        break;
      case 'overview':
      default:
        await _reloadBootstrap();
        if (!isHeadAdminLike && hasAttendanceModule) {
          await loadTodayAttendance(force: force);
        }
        if (isHeadAdminLike) {
          await loadCompanySettings(force: force);
        }
        break;
    }
  }

  Future<void> loadTodayAttendance({bool force = false}) async {
    if (user == null || !hasAttendanceModule) {
      return;
    }
    await _runSection('attendance', () async {
      todayAttendance = await _apiClient.getTodayAttendance(user!.id);
      lastSyncedLabel = _timestampLabel();
    }, force: force);
  }

  Future<void> timeIn() async {
    if (user == null) {
      return;
    }
    await _runSection('attendance-action', () async {
      final result = await _apiClient.recordTimeIn(user!.id);
      todayAttendance = result.record;
      infoMessage = result.status.isEmpty
          ? 'Timed in at ${result.time}.'
          : '${result.status} at ${result.time}.';
      errorMessage = '';
      lastSyncedLabel = _timestampLabel();
    }, force: true);
    await loadTodayAttendance(force: true);
  }

  Future<void> timeOut() async {
    if (user == null) {
      return;
    }
    await _runSection('attendance-action', () async {
      final result = await _apiClient.recordTimeOut(user!.id);
      todayAttendance = result.record;
      final hoursLabel = result.workedHours.isEmpty
          ? ''
          : ' Total hours: ${result.workedHours}.';
      infoMessage = 'Timed out at ${result.time}.$hoursLabel';
      errorMessage = '';
      lastSyncedLabel = _timestampLabel();
    }, force: true);
    await loadTodayAttendance(force: true);
  }

  Future<void> setCutoffDate(DateTime value) async {
    selectedCutoffDate = value;
    notifyListeners();
    await loadCutoffCard(force: true);
  }

  Future<void> loadCutoffCard({bool force = false}) async {
    if (user == null || !hasAttendanceModule) {
      return;
    }
    await _runSection('timecard', () async {
      cutoffCard = await _apiClient.getCutoffTimeCard(
        userId: user!.id,
        dateKey: selectedCutoffDateKey,
      );
      lastSyncedLabel = _timestampLabel();
    }, force: force);
  }

  void updateInventoryFilter(String value) {
    inventoryFilter = value.trim();
    notifyListeners();
  }

  void updateInventoryBranch(String value) {
    inventoryBranch = value.trim();
    notifyListeners();
  }

  Future<void> loadInventory({bool force = false}) async {
    if (!canUseInventory) {
      return;
    }
    _syncInventoryBranch();
    if (inventoryBranch.isEmpty) {
      inventory = const <InventoryItem>[];
      _sectionErrors['inventory'] = 'No active branch is available yet.';
      notifyListeners();
      return;
    }
    await _runSection('inventory', () async {
      inventory = await _apiClient.listInventory(
        branch: inventoryBranch,
        filter: inventoryFilter,
      );
      lastSyncedLabel = _timestampLabel();
    }, force: force);
  }

  void updateTeamFilter(String value) {
    teamFilter = value.trim();
    notifyListeners();
  }

  Future<void> loadTeamMembers({bool force = false}) async {
    if (!canSeeTeam && !isHeadAdminLike) {
      return;
    }
    await _runSection('team', () async {
      teamMembers = await _apiClient.listEmployees(filter: teamFilter);
      lastSyncedLabel = _timestampLabel();
    }, force: force);
  }

  void updatePeopleFilter(String value) {
    peopleFilter = value.trim();
    notifyListeners();
  }

  Future<void> loadPeople({bool force = false}) async {
    if (!canSeePeople) {
      return;
    }
    await _runSection('people', () async {
      people = await _apiClient.listUsers(filter: peopleFilter);
      lastSyncedLabel = _timestampLabel();
    }, force: force);
  }

  Future<void> createUser({
    required String id,
    required String name,
    required String password,
    required String role,
    String branchId = '',
    String branchName = '',
  }) async {
    await _runSection('people-create', () async {
      await _apiClient.createUser(
        id: id,
        name: name,
        password: password,
        role: role,
        branchId: branchId,
        branchName: branchName,
      );
      infoMessage = 'User created successfully.';
      lastSyncedLabel = _timestampLabel();
      await _reloadBootstrap();
      await loadPeople(force: true);
      await loadTeamMembers(force: true);
    }, force: true);
  }

  Future<void> updateUser({
    required String userId,
    required String name,
    required String role,
    required String branchId,
    required String branchName,
    required String accountStatus,
    required String timeIn,
    required String timeOut,
    String? password,
  }) async {
    await _runSection('people-edit', () async {
      await _apiClient.updateUser(
        userId: userId,
        name: name,
        role: role,
        password: password,
        branchId: branchId,
        branchName: branchName,
        accountStatus: accountStatus,
        timeIn: timeIn,
        timeOut: timeOut,
      );
      infoMessage = 'User updated successfully.';
      lastSyncedLabel = _timestampLabel();
      await _reloadBootstrap();
      await loadPeople(force: true);
      await loadTeamMembers(force: true);
    }, force: true);
  }

  Future<void> deleteUser(String userId) async {
    await _runSection('people-edit', () async {
      await _apiClient.deleteUser(userId);
      infoMessage = 'User deleted successfully.';
      lastSyncedLabel = _timestampLabel();
      await _reloadBootstrap();
      await loadPeople(force: true);
      await loadTeamMembers(force: true);
    }, force: true);
  }

  Future<void> createBranch({
    required String name,
    String address = '',
  }) async {
    await _runSection('branches-create', () async {
      await _apiClient.createBranch(name: name, address: address);
      infoMessage = 'Branch created successfully.';
      lastSyncedLabel = _timestampLabel();
      await _reloadBootstrap();
    }, force: true);
  }

  Future<void> updateBranch({
    required String branchId,
    required String name,
    required String address,
    required bool isActive,
  }) async {
    await _runSection('branches-edit', () async {
      await _apiClient.updateBranch(
        branchId: branchId,
        name: name,
        address: address,
        isActive: isActive,
      );
      infoMessage = 'Branch updated successfully.';
      lastSyncedLabel = _timestampLabel();
      await _reloadBootstrap();
    }, force: true);
  }

  Future<void> deleteBranch(String branchId) async {
    await _runSection('branches-edit', () async {
      await _apiClient.deleteBranch(branchId);
      infoMessage = 'Branch deleted successfully.';
      lastSyncedLabel = _timestampLabel();
      await _reloadBootstrap();
    }, force: true);
  }

  Future<void> loadAttendanceSnapshot({bool force = false}) async {
    if (!canSeeAdminAttendance) {
      return;
    }
    await _runSection('attendance-admin', () async {
      if (!hasReportsModule) {
        attendanceSnapshot = const <AttendanceRecord>[];
        _sectionErrors['attendance-admin'] =
            'Reports module is not enabled for daily snapshot access.';
        notifyListeners();
        return;
      }
      attendanceSnapshot = await _apiClient.getAttendanceSnapshot(
        dateKey: serverDateKey.isEmpty ? null : serverDateKey,
      );
      lastSyncedLabel = _timestampLabel();
    }, force: force);
  }

  Future<void> loadBulletin({bool force = false}) async {
    if (!canSeeBulletin) {
      return;
    }
    await _runSection('bulletin', () async {
      bulletin = await _apiClient.getCompanyBulletin();
      lastSyncedLabel = _timestampLabel();
    }, force: force);
  }

  Future<void> saveCompanyAnnouncement({
    required String title,
    required String message,
    required String startsOn,
    required String endsOn,
  }) async {
    await _runSection('bulletin-save', () async {
      bulletin = await _apiClient.updateCompanyAnnouncement(
        title: title,
        message: message,
        startsOn: startsOn,
        endsOn: endsOn,
      );
      infoMessage = 'Announcement updated successfully.';
      lastSyncedLabel = _timestampLabel();
    }, force: true);
  }

  Future<void> clearCompanyAnnouncement() async {
    await _runSection('bulletin-save', () async {
      bulletin = await _apiClient.clearCompanyAnnouncement();
      infoMessage = 'Announcement cleared.';
      lastSyncedLabel = _timestampLabel();
    }, force: true);
  }

  Future<void> createCompanyHoliday({
    required String name,
    required String startDate,
    required String endDate,
    required String type,
    String timeLabel = '',
    String note = '',
  }) async {
    await _runSection('bulletin-save', () async {
      bulletin = await _apiClient.createCompanyHoliday(
        name: name,
        startDate: startDate,
        endDate: endDate,
        type: type,
        timeLabel: timeLabel,
        note: note,
      );
      infoMessage = 'Calendar item added successfully.';
      lastSyncedLabel = _timestampLabel();
    }, force: true);
  }

  Future<void> updateCompanyHoliday({
    required String holidayId,
    required String name,
    required String startDate,
    required String endDate,
    required String type,
    String timeLabel = '',
    String note = '',
  }) async {
    await _runSection('bulletin-save', () async {
      bulletin = await _apiClient.updateCompanyHoliday(
        holidayId: holidayId,
        name: name,
        startDate: startDate,
        endDate: endDate,
        type: type,
        timeLabel: timeLabel,
        note: note,
      );
      infoMessage = 'Calendar item updated successfully.';
      lastSyncedLabel = _timestampLabel();
    }, force: true);
  }

  Future<void> deleteCompanyHoliday(String holidayId) async {
    await _runSection('bulletin-save', () async {
      bulletin = await _apiClient.deleteCompanyHoliday(holidayId);
      infoMessage = 'Calendar item deleted successfully.';
      lastSyncedLabel = _timestampLabel();
    }, force: true);
  }

  Future<void> loadCompanySettings({bool force = false}) async {
    if (!isHeadAdminLike) {
      companySettings = CompanySettings.fromBootstrap(bootstrap);
      notifyListeners();
      return;
    }
    await _runSection('settings', () async {
      companySettings = await _apiClient.getCompanySettings();
      lastSyncedLabel = _timestampLabel();
    }, force: force);
  }

  Future<void> saveCompanySettings({
    required String name,
    required String companyCode,
    required String appName,
    required String primaryColor,
    required String address,
    required String contact,
    String logoPath = '',
    String loginBackgroundPath = '',
  }) async {
    await _runSection('settings-save', () async {
      companySettings = await _apiClient.updateCompanySettings(
        name: name,
        companyCode: companyCode,
        appName: appName,
        primaryColor: primaryColor,
        address: address,
        contact: contact,
        logoPath: logoPath,
        loginBackgroundPath: loginBackgroundPath,
      );
      infoMessage = 'Company settings updated.';
      lastSyncedLabel = _timestampLabel();
      await _reloadBootstrap();
    }, force: true);
  }

  String get selectedCutoffDateKey {
    final month = selectedCutoffDate.month.toString().padLeft(2, '0');
    final day = selectedCutoffDate.day.toString().padLeft(2, '0');
    return '${selectedCutoffDate.year}-$month-$day';
  }

  DateTime get maxSelectableDate =>
      _parseDateKey(serverDateKey) ?? DateTime.now();

  List<BranchSummary> get activeBranches {
    return (bootstrap?.branches ?? const <BranchSummary>[])
        .where((branch) => branch.isActive)
        .toList();
  }

  Future<void> _reloadBootstrap() async {
    if (user == null) {
      return;
    }
    await _runSection('bootstrap', () async {
      final nextBootstrap = await _apiClient.getBootstrap();
      bootstrap = nextBootstrap;
      branding = nextBootstrap.branding;
      bulletin = nextBootstrap.companyBulletin;
      if (nextBootstrap.user != null) {
        user = nextBootstrap.user;
      }
      _syncInventoryBranch();
      _syncSelectedTab();
      await _sessionStore.saveSession(
        companyCode: companyCode,
        username: username,
        cookieHeader: _apiClient.cookieHeader,
        user: user,
      );
      lastSyncedLabel = _timestampLabel();
    }, force: true);
  }

  void _bindGoogleCallbackListener() {
    unawaited(_googleCallbackSubscription?.cancel());
    _googleCallbackSubscription = _googleOAuthService.callbackStream.listen(
      (Uri uri) {
        unawaited(_completeGoogleLoginFromCallback(uri));
      },
      onError: (Object error) {
        if (!_googleLoginPending) {
          return;
        }
        _googleLoginPending = false;
        isBusy = false;
        screen = AppScreen.login;
        authMode = AuthMode.login;
        infoMessage = '';
        errorMessage = _messageFor(
          error,
          fallback: 'Unable to complete Google login.',
        );
        notifyListeners();
      },
    );
  }

  Future<void> _completeGoogleLoginFromCallback(Uri uri) async {
    if (_googleCallbackHandling) {
      return;
    }
    _googleCallbackHandling = true;
    try {
      final callbackCompanyCode =
          (uri.queryParameters['companyCode'] ?? '').trim();
      if (callbackCompanyCode.isNotEmpty) {
        companyCode = callbackCompanyCode;
        await refreshBranding(callbackCompanyCode, notify: false);
      }

      final callbackError = (uri.queryParameters['error'] ?? '').trim();
      if (callbackError.isNotEmpty) {
        _googleLoginPending = false;
        isBusy = false;
        screen = AppScreen.login;
        authMode = AuthMode.login;
        infoMessage = '';
        errorMessage = callbackError;
        notifyListeners();
        return;
      }

      final handoffCode = (uri.queryParameters['code'] ?? '').trim();
      if (handoffCode.isEmpty) {
        _googleLoginPending = false;
        isBusy = false;
        screen = AppScreen.login;
        authMode = AuthMode.login;
        infoMessage = '';
        errorMessage = 'Google login did not return a handoff code.';
        notifyListeners();
        return;
      }

      _googleLoginPending = false;
      isBusy = true;
      screen = AppScreen.splash;
      errorMessage = '';
      infoMessage = 'Completing Google sign-in...';
      notifyListeners();

      final nextUser = await _apiClient.completeMobileGoogleLogin(handoffCode);
      await _enterWorkspace(nextUser, successMessage: 'Signed in with Google.');
    } catch (error) {
      _googleLoginPending = false;
      _apiClient.cookieHeader = '';
      await _sessionStore.clearSession();
      isBusy = false;
      screen = AppScreen.login;
      authMode = AuthMode.login;
      infoMessage = '';
      errorMessage = _messageFor(
        error,
        fallback: 'Unable to complete Google login.',
      );
      notifyListeners();
    } finally {
      _googleCallbackHandling = false;
    }
  }

  BootstrapPayload _buildFallbackBootstrap(SessionUser nextUser) {
    final fallbackBranding = branding.copyWith(
      appName: branding.appName.isEmpty ? 'GMS ERP' : branding.appName,
      companyCode: companyCode,
    );
    return BootstrapPayload(
      user: nextUser,
      role: nextUser.role,
      branding: fallbackBranding,
      company: CompanySummary(
        id: nextUser.companyId,
        name: fallbackBranding.companyName,
        companyCode: companyCode,
        primaryColorHex: fallbackBranding.primaryColorHex,
        appName: fallbackBranding.appName,
        logoPath: fallbackBranding.logoPath,
      ),
    );
  }

  Future<void> _runSection(
    String sectionId,
    Future<void> Function() action, {
    bool force = false,
  }) async {
    if (!force && _loadingSections.contains(sectionId)) {
      return;
    }

    _loadingSections.add(sectionId);
    _sectionErrors.remove(sectionId);
    errorMessage = '';
    notifyListeners();

    try {
      await action();
    } catch (error) {
      final message = _messageFor(error, fallback: 'Request failed.');
      _sectionErrors[sectionId] = message;
      errorMessage = message;
    } finally {
      _loadingSections.remove(sectionId);
      notifyListeners();
    }
  }

  Future<String> _resolveServerDateKey() async {
    try {
      final payload = await _apiClient.getServerInfo();
      return jsonString(payload['dateKey']);
    } catch (_) {
      return '';
    }
  }

  void _syncInventoryBranch() {
    if (inventoryBranch.isNotEmpty &&
        activeBranches.any((branch) => branch.name == inventoryBranch)) {
      return;
    }
    inventoryBranch =
        activeBranches.isNotEmpty ? activeBranches.first.name : '';
  }

  void _syncSelectedTab() {
    final tabs = availableTabIds;
    if (!tabs.contains(selectedTabId)) {
      selectedTabId = tabs.first;
    }
  }

  DateTime? _parseDateKey(String value) {
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value)) {
      return null;
    }
    return DateTime.tryParse('${value}T00:00:00');
  }

  String _timestampLabel() {
    final now = DateTime.now();
    final month = _monthLabel(now.month);
    final hourValue =
        now.hour == 0 ? 12 : (now.hour > 12 ? now.hour - 12 : now.hour);
    final minute = now.minute.toString().padLeft(2, '0');
    final suffix = now.hour >= 12 ? 'PM' : 'AM';
    return '$month ${now.day}, $hourValue:$minute $suffix';
  }

  String _monthLabel(int month) {
    const labels = <String>[
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return labels[(month - 1).clamp(0, 11)];
  }

  String _messageFor(Object error, {required String fallback}) {
    if (error is ApiException) {
      return error.message;
    }
    if (error is Exception) {
      final message = error.toString().replaceFirst('Exception: ', '').trim();
      final normalized = message.toLowerCase();
      if (normalized.contains('failed to fetch') ||
          normalized.contains('clientexception') ||
          normalized.contains('xmlhttprequest error') ||
          normalized.contains('network')) {
        return 'Unable to reach the server right now. Please check your connection and try again.';
      }
      if (message.isNotEmpty) {
        return message;
      }
    }
    return fallback;
  }

  @override
  void dispose() {
    _brandingDebounce?.cancel();
    unawaited(_googleCallbackSubscription?.cancel());
    super.dispose();
  }
}
