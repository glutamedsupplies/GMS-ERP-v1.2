import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app_controller.dart';
import '../models.dart';

const String _defaultBrandAsset = 'assets/branding/logo.png';

const Color _webDarkBg = Color(0xFFF6F2E9);
const Color _webDarkBgAlt = Color(0xFFEAF4ED);
const Color _webDarkSurface = Color(0xFFFDFCF8);
const Color _webDarkCard = Color(0xFFFFFFFF);
const Color _webText = Color(0xFF173126);
const Color _webMuted = Color(0xFF6A7E72);
const Color _webGold = Color(0xFFD4B27A);
const Color _webClay = Color(0xFFBE8D63);
const Color _webBorder = Color(0xFFD3E2D6);
const Color _glassTop = Color(0xF9FFFFFF);
const Color _glassBase = Color(0xF3F7FBF6);
const Color _glassBottom = Color(0xEBEEF6F0);
const Color _loginPrimary = Color(0xFF15734E);
const Color _loginMuted = Color(0xFF667C73);
const Color _loginTeal = Color(0xFF15947B);
const Color _loginAccent = Color(0xFF21936B);
const Color _loginGreen = Color(0xFF5AA868);
const Color _loginSun = Color(0xFFD59B42);
const String _headingFontFamily = 'Georgia';
const List<String> _headingFontFallback = <String>['Times New Roman'];
const double _radiusMd = 12;
const double _radiusLg = 18;
const double _radiusXl = 24;

class GmsMobileApp extends StatelessWidget {
  const GmsMobileApp({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final seed = _parseHexColor(controller.branding.primaryColorHex);
        return MaterialApp(
          debugShowCheckedModeBanner: false,
          title: controller.branding.appName,
          themeMode: ThemeMode.light,
          theme: _buildTheme(seed),
          darkTheme: _buildTheme(seed),
          home: RootScreen(controller: controller),
        );
      },
    );
  }

  ThemeData _buildTheme(Color seed) {
    final base = ThemeData(
      brightness: Brightness.light,
      useMaterial3: true,
    );
    final scheme = ColorScheme.fromSeed(
      seedColor: seed,
      brightness: Brightness.light,
    );
    final primary = _warmBrandColor(seed);
    final secondary = _blendColors(primary, _webGold, 0.34);
    final onPrimary =
        primary.computeLuminance() > 0.58 ? _webText : Colors.white;
    const panel = _webDarkSurface;
    const panelAlt = _webDarkCard;
    const border = _webBorder;
    return base.copyWith(
      colorScheme: scheme.copyWith(
        primary: primary,
        secondary: secondary,
        onPrimary: onPrimary,
        surface: _webDarkBgAlt,
        surfaceContainer: panel,
        surfaceContainerHigh: panelAlt,
        surfaceContainerHighest: _webDarkCard,
        onSurface: _webText,
        onSurfaceVariant: _webMuted,
        outline: border,
        outlineVariant: _webMuted.withValues(alpha: 0.22),
      ),
      scaffoldBackgroundColor: _webDarkBg,
      textTheme: base.textTheme
          .apply(
            bodyColor: _webText,
            displayColor: _webText,
          )
          .copyWith(
            headlineLarge: base.textTheme.headlineLarge?.copyWith(
              fontFamily: _headingFontFamily,
              fontFamilyFallback: _headingFontFallback,
              fontWeight: FontWeight.w900,
              letterSpacing: 0,
            ),
            headlineMedium: base.textTheme.headlineMedium?.copyWith(
              fontFamily: _headingFontFamily,
              fontFamilyFallback: _headingFontFallback,
              fontWeight: FontWeight.w800,
              letterSpacing: 0,
            ),
            titleLarge: base.textTheme.titleLarge?.copyWith(
              fontFamily: _headingFontFamily,
              fontFamilyFallback: _headingFontFallback,
              fontWeight: FontWeight.w800,
              letterSpacing: 0,
            ),
            titleMedium: base.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
            bodyLarge: base.textTheme.bodyLarge?.copyWith(
              color: _webText.withValues(alpha: 0.86),
              height: 1.42,
            ),
            bodyMedium: base.textTheme.bodyMedium?.copyWith(
              color: _webText.withValues(alpha: 0.8),
              height: 1.42,
            ),
          ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: _webText,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        toolbarHeight: 86,
        titleTextStyle: base.textTheme.titleLarge?.copyWith(
          color: _webText,
          fontWeight: FontWeight.w800,
        ),
      ),
      cardTheme: CardThemeData(
        color: panel,
        elevation: 0,
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        shadowColor: const Color(0x1A19352A),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(_radiusLg),
          side: BorderSide(color: border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: _webDarkCard.withValues(alpha: 0.96),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        hintStyle: TextStyle(color: _webMuted.withValues(alpha: 0.74)),
        labelStyle: TextStyle(color: _webText.withValues(alpha: 0.72)),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radiusMd),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radiusMd),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radiusMd),
          borderSide: BorderSide(color: primary, width: 1.4),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(50),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          backgroundColor: primary,
          foregroundColor: onPrimary,
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.1,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(_radiusMd),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: secondary,
          textStyle: const TextStyle(
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
          foregroundColor: _webText,
          side: BorderSide(color: _webText.withValues(alpha: 0.14)),
          textStyle: const TextStyle(
            fontWeight: FontWeight.w700,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(_radiusMd),
          ),
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: _webDarkBgAlt.withValues(alpha: 0.9),
        side: const BorderSide(color: _webBorder),
        labelStyle: TextStyle(
          color: _webText.withValues(alpha: 0.9),
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.transparent,
        indicatorColor: primary.withValues(alpha: 0.18),
        labelTextStyle: WidgetStatePropertyAll(
          TextStyle(
            color: _webText.withValues(alpha: 0.92),
            fontWeight: FontWeight.w700,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            color: selected ? primary : _webMuted.withValues(alpha: 0.82),
          );
        }),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: Colors.transparent,
        indicatorColor: primary.withValues(alpha: 0.18),
        selectedIconTheme: IconThemeData(color: primary),
        unselectedIconTheme:
            IconThemeData(color: _webText.withValues(alpha: 0.72)),
        selectedLabelTextStyle: TextStyle(
          color: _webText.withValues(alpha: 0.92),
          fontWeight: FontWeight.w700,
        ),
        unselectedLabelTextStyle: TextStyle(
          color: _webMuted.withValues(alpha: 0.76),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: _webText,
          backgroundColor: _webDarkCard.withValues(alpha: 0.92),
          disabledBackgroundColor: _webDarkSurface.withValues(alpha: 0.72),
          disabledForegroundColor: _webMuted.withValues(alpha: 0.48),
          minimumSize: const Size(44, 44),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(_radiusMd),
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: _webText,
        contentTextStyle: const TextStyle(color: Colors.white),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(_radiusLg),
        ),
      ),
    );
  }
}

class RootScreen extends StatelessWidget {
  const RootScreen({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final seed = _parseHexColor(controller.branding.primaryColorHex);
    final loginChrome = controller.screen != AppScreen.workspace;
    final loginPalette = _buildLoginPalette(_loginPrimaryColor(controller));
    final backgroundUrl = _resolveMediaUrl(
      controller.branding.backgroundImagePath,
      controller.apiBaseUrl,
    );
    return Material(
      type: MaterialType.transparency,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: loginChrome
                ? <Color>[
                    loginPalette.lead,
                    loginPalette.dusk,
                    loginPalette.deep,
                  ]
                : <Color>[
                    _webDarkBg,
                    Color.alphaBlend(
                      seed.withValues(alpha: 0.08),
                      _webDarkBgAlt,
                    ),
                    const Color(0xFFF7FBF7),
                  ],
          ),
        ),
        child: Stack(
          children: <Widget>[
            if (backgroundUrl != null &&
                controller.screen != AppScreen.workspace)
              _BrandBackgroundImage(imageUrl: backgroundUrl),
            loginChrome
                ? _LoginAmbientBackground(palette: loginPalette)
                : _AmbientBackground(seedColor: seed),
            SafeArea(
              child: switch (controller.screen) {
                AppScreen.splash => SplashScreen(controller: controller),
                AppScreen.login => LoginScreen(controller: controller),
                AppScreen.workspace => WorkspaceShell(controller: controller),
              },
            ),
          ],
        ),
      ),
    );
  }
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: _GlassCard(
        maxWidth: 460,
        padding: const EdgeInsets.all(30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const _SectionTag(
              label: 'MOBILE ERP',
              icon: Icons.mobile_friendly_rounded,
            ),
            const SizedBox(height: 22),
            _BrandMark(
              controller: controller,
              size: 108,
              radius: 32,
            ),
            const SizedBox(height: 24),
            Text(
              controller.branding.appName,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              controller.infoMessage.isEmpty
                  ? 'Preparing your branded mobile workspace...'
                  : controller.infoMessage,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: _webMuted.withValues(alpha: 0.94),
                  ),
            ),
            const SizedBox(height: 16),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 10,
              runSpacing: 10,
              children: const <Widget>[
                _MetricPill(
                  icon: Icons.lock_rounded,
                  label: 'Secure sign-in',
                ),
                _MetricPill(
                  icon: Icons.palette_rounded,
                  label: 'Tenant branding ready',
                ),
              ],
            ),
            const SizedBox(height: 20),
            const SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(strokeWidth: 2.6),
            ),
          ],
        ),
      ),
    );
  }
}

class LoginScreen extends StatelessWidget {
  const LoginScreen({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final tablet = constraints.maxWidth >= 640;
        final horizontalPadding = tablet ? 20.0 : 14.0;
        return SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            horizontalPadding,
            tablet ? 24 : 14,
            horizontalPadding,
            24,
          ),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: controller.authMode == AuthMode.login
                  ? _LoginForm(controller: controller)
                  : _ForgotPasswordForm(controller: controller),
            ),
          ),
        );
      },
    );
  }
}

class WorkspaceShell extends StatelessWidget {
  const WorkspaceShell({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final tabs = _buildTabs(controller);
    final matchingIndex =
        tabs.indexWhere((tab) => tab.id == controller.selectedTabId);
    final currentIndex = matchingIndex < 0 ? 0 : matchingIndex;
    final tab = tabs[currentIndex];
    final appName = controller.bootstrap?.company.appName.isNotEmpty == true
        ? controller.bootstrap!.company.appName
        : controller.branding.appName;
    final companyName = controller.bootstrap?.company.name.isNotEmpty == true
        ? controller.bootstrap!.company.name
        : controller.branding.companyName;

    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 960;
        final extendedRail = constraints.maxWidth >= 1180;
        return Scaffold(
          backgroundColor: Colors.transparent,
          appBar: AppBar(
            titleSpacing: 16,
            title: Row(
              children: <Widget>[
                _BrandMark(
                  controller: controller,
                  size: 46,
                  radius: 16,
                  showGlow: false,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        appName,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                      ),
                      Text(
                        companyName.isEmpty ? 'Mobile workspace' : companyName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelLarge?.copyWith(
                              color: _webMuted.withValues(alpha: 0.9),
                              letterSpacing: 0.2,
                            ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            actions: <Widget>[
              if (wide && controller.lastSyncedLabel.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Center(
                    child: _HeaderBadge(
                      icon: Icons.sync_rounded,
                      label: 'Synced ${controller.lastSyncedLabel}',
                    ),
                  ),
                ),
              IconButton(
                tooltip: 'Refresh',
                onPressed: controller.isBusy
                    ? null
                    : () {
                        unawaited(controller.reloadWorkspace());
                      },
                icon: const Icon(Icons.refresh_rounded),
              ),
              IconButton(
                tooltip: 'Logout',
                onPressed: controller.isBusy
                    ? null
                    : () {
                        unawaited(controller.logout());
                      },
                icon: const Icon(Icons.logout_rounded),
              ),
              const SizedBox(width: 12),
            ],
          ),
          body: wide
              ? Row(
                  children: <Widget>[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 10, 16),
                      child: SizedBox(
                        width: extendedRail ? 270 : 96,
                        child: _RailCard(
                          child: NavigationRail(
                            backgroundColor: Colors.transparent,
                            extended: extendedRail,
                            selectedIndex: currentIndex,
                            groupAlignment: -0.85,
                            minWidth: 84,
                            minExtendedWidth: 244,
                            onDestinationSelected: (index) {
                              unawaited(controller.selectTab(tabs[index].id));
                            },
                            labelType: NavigationRailLabelType.none,
                            leading: Padding(
                              padding:
                                  const EdgeInsets.fromLTRB(10, 14, 10, 22),
                              child: _RailBrandHeader(
                                controller: controller,
                                extended: extendedRail,
                              ),
                            ),
                            destinations: tabs
                                .map(
                                  (tab) => NavigationRailDestination(
                                    icon: Icon(tab.icon),
                                    selectedIcon:
                                        Icon(tab.activeIcon ?? tab.icon),
                                    label: Text(tab.label),
                                  ),
                                )
                                .toList(),
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(10, 0, 16, 16),
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 260),
                          child: KeyedSubtree(
                            key: ValueKey<String>(tab.id),
                            child: tab.builder(context, controller),
                          ),
                        ),
                      ),
                    ),
                  ],
                )
              : Column(
                  children: <Widget>[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                      child: _GlassCard(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 16,
                        ),
                        child: _UserHeader(controller: controller),
                      ),
                    ),
                    Expanded(
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 260),
                        child: KeyedSubtree(
                          key: ValueKey<String>(tab.id),
                          child: tab.builder(context, controller),
                        ),
                      ),
                    ),
                  ],
                ),
          bottomNavigationBar: wide
              ? null
              : Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  child: _MobileTabDock(
                    controller: controller,
                    tabs: tabs,
                    currentIndex: currentIndex,
                  ),
                ),
        );
      },
    );
  }
}

List<_WorkspaceTab> _buildTabs(AppController controller) {
  final tabs = <_WorkspaceTab>[
    _WorkspaceTab(
      id: 'overview',
      label: 'Overview',
      icon: Icons.dashboard_rounded,
      activeIcon: Icons.dashboard_customize_rounded,
      builder: (context, value) => OverviewPage(controller: value),
    ),
  ];

  if (controller.hasAttendanceModule) {
    tabs.add(
      _WorkspaceTab(
        id: 'attendance',
        label: 'Attendance',
        icon: Icons.schedule_rounded,
        activeIcon: Icons.punch_clock_rounded,
        builder: (context, value) => value.isHeadAdminLike
            ? AdminAttendancePage(controller: value)
            : EmployeeAttendancePage(controller: value),
      ),
    );
    if (!controller.isHeadAdminLike) {
      tabs.add(
        _WorkspaceTab(
          id: 'timecard',
          label: 'Time Card',
          icon: Icons.event_note_rounded,
          activeIcon: Icons.history_toggle_off_rounded,
          builder: (context, value) => TimeCardPage(controller: value),
        ),
      );
    }
  }

  if (controller.canUseInventory) {
    tabs.add(
      _WorkspaceTab(
        id: 'inventory',
        label: 'Inventory',
        icon: Icons.inventory_2_outlined,
        activeIcon: Icons.inventory_2_rounded,
        builder: (context, value) => InventoryPage(controller: value),
      ),
    );
  }

  if (controller.canSeePeople) {
    tabs.add(
      _WorkspaceTab(
        id: 'people',
        label: 'People',
        icon: Icons.groups_outlined,
        activeIcon: Icons.groups_rounded,
        builder: (context, value) => PeoplePage(controller: value),
      ),
    );
  }

  if (controller.isHeadAdminLike) {
    tabs.add(
      _WorkspaceTab(
        id: 'branches',
        label: 'Branches',
        icon: Icons.store_mall_directory_outlined,
        activeIcon: Icons.store_mall_directory_rounded,
        builder: (context, value) => BranchesPage(controller: value),
      ),
    );
  }

  if (controller.canSeeTeam) {
    tabs.add(
      _WorkspaceTab(
        id: 'team',
        label: 'Team',
        icon: Icons.people_alt_outlined,
        activeIcon: Icons.people_alt_rounded,
        builder: (context, value) => TeamPage(controller: value),
      ),
    );
  }

  if (controller.canSeeBulletin && controller.isHeadAdminLike) {
    tabs.add(
      _WorkspaceTab(
        id: 'bulletin',
        label: 'Bulletin',
        icon: Icons.campaign_outlined,
        activeIcon: Icons.campaign_rounded,
        builder: (context, value) => BulletinPage(controller: value),
      ),
    );
  }

  tabs.add(
    _WorkspaceTab(
      id: 'settings',
      label: 'Settings',
      icon: Icons.settings_outlined,
      activeIcon: Icons.settings_rounded,
      builder: (context, value) => SettingsPage(controller: value),
    ),
  );
  return tabs;
}

class OverviewPage extends StatelessWidget {
  const OverviewPage({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final bootstrap = controller.bootstrap;
    final modules = bootstrap?.enabledModules ?? const <String>[];
    final workspaceConfig =
        bootstrap?.workspaceConfig ?? const <String, dynamic>{};
    final shell = jsonMap(workspaceConfig['shell']);
    final limits = bootstrap?.limits ?? const <String, dynamic>{};
    final branchLimit = jsonMap(limits['branches']);
    final userLimit = jsonMap(limits['users']);
    final invoiceLimit = jsonMap(limits['invoices']);
    final activeAnnouncement = controller.bulletin.activeAnnouncement;

    return _WorkspacePageFrame(
      title: 'Overview',
      subtitle: shell['workspaceTag']?.toString().trim().isNotEmpty == true
          ? shell['workspaceTag'].toString().trim()
          : 'Mobile ERP workspace',
      controller: controller,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _HeroPanel(
            title: shell['appShellName']?.toString().trim().isNotEmpty == true
                ? shell['appShellName'].toString().trim()
                : controller.branding.appName,
            eyebrow: controller.user?.role.replaceAll('_', ' ').toUpperCase() ??
                'WORKSPACE',
            body: shell['workspaceCopy']?.toString().trim().isNotEmpty == true
                ? shell['workspaceCopy'].toString().trim()
                : (controller.branding.subtitle.isNotEmpty
                    ? controller.branding.subtitle
                    : 'Responsive mobile access for attendance, inventory, and admin workflows.'),
            trailing: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                _MetricPill(
                  icon: Icons.apartment_rounded,
                  label: controller.bootstrap?.company.companyCode
                              .toUpperCase()
                              .isNotEmpty ==
                          true
                      ? controller.bootstrap!.company.companyCode.toUpperCase()
                      : 'TENANT',
                ),
                const SizedBox(height: 10),
                _MetricPill(
                  icon: Icons.sync_rounded,
                  label: controller.lastSyncedLabel.isEmpty
                      ? 'Live'
                      : 'Synced ${controller.lastSyncedLabel}',
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 16,
            runSpacing: 16,
            children: <Widget>[
              _MetricCard(
                title: 'Modules',
                value: '${modules.length}',
                caption: 'Enabled workspace modules',
                icon: Icons.grid_view_rounded,
              ),
              _MetricCard(
                title: 'Branches',
                value: '${jsonInt(branchLimit['current'])}',
                caption:
                    'of ${jsonInt(branchLimit['max']) == 0 ? 'unlimited' : jsonInt(branchLimit['max'])}',
                icon: Icons.storefront_rounded,
              ),
              _MetricCard(
                title: 'Users',
                value: '${jsonInt(userLimit['current'])}',
                caption:
                    'of ${jsonInt(userLimit['max']) == 0 ? 'unlimited' : jsonInt(userLimit['max'])}',
                icon: Icons.groups_rounded,
              ),
              _MetricCard(
                title: 'Invoices',
                value: '${jsonInt(invoiceLimit['current'])}',
                caption: 'Monthly usage snapshot',
                icon: Icons.receipt_long_rounded,
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (activeAnnouncement != null && activeAnnouncement.hasContent)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: _InfoCard(
                title: activeAnnouncement.title,
                subtitle: activeAnnouncement.windowLabel.isEmpty
                    ? 'Live announcement'
                    : activeAnnouncement.windowLabel,
                body: activeAnnouncement.message,
                leading: const Icon(Icons.campaign_rounded),
                tone: _CardTone.highlight,
              ),
            ),
          _GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Enabled modules',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 14),
                if (modules.isEmpty)
                  const _EmptyState(
                    title: 'No modules enabled yet',
                    body:
                        'This tenant has not published a mobile-ready module set yet.',
                  )
                else
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: modules
                        .map(
                          (module) => Chip(
                            avatar: const Icon(Icons.check_circle_rounded,
                                size: 18),
                            label: Text(_titleize(module)),
                          ),
                        )
                        .toList(),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class EmployeeAttendancePage extends StatelessWidget {
  const EmployeeAttendancePage({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final record = controller.todayAttendance;
    final busy = controller.isSectionLoading('attendance') ||
        controller.isSectionLoading('attendance-action');
    final normalizedStatus = (record?.status ?? '').toLowerCase();
    final locked =
        normalizedStatus == 'inactive' || normalizedStatus == 'suspended';
    final canTimeIn = !busy &&
        !locked &&
        (record == null || (record.timeIn.isEmpty && record.timeOut.isEmpty));
    final canTimeOut = !busy &&
        !locked &&
        record != null &&
        record.timeIn.isNotEmpty &&
        record.timeOut.isEmpty;

    return _WorkspacePageFrame(
      title: 'Attendance',
      subtitle: 'Safe for daily phone use with large touch targets.',
      controller: controller,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    const Expanded(child: _LiveClockCard()),
                    const SizedBox(width: 14),
                    Expanded(
                      child: _InfoCard(
                        title: record?.status.isNotEmpty == true
                            ? record!.status
                            : 'Ready to record time',
                        subtitle: record?.displayDate.isNotEmpty == true
                            ? record!.displayDate
                            : 'Current workday',
                        body: controller.sectionError('attendance').isNotEmpty
                            ? controller.sectionError('attendance')
                            : (record == null
                                ? 'Tap time in to start today.'
                                : _attendanceSummary(record)),
                        leading: Icon(
                          locked
                              ? Icons.lock_person_rounded
                              : (record?.timeOut.isNotEmpty == true
                                  ? Icons.verified_rounded
                                  : Icons.av_timer_rounded),
                        ),
                        tone: locked ? _CardTone.warning : _CardTone.neutral,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: canTimeIn
                            ? () {
                                unawaited(controller.timeIn());
                              }
                            : null,
                        icon: busy
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.login_rounded),
                        label: const Text('Time In'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: canTimeOut
                            ? () {
                                unawaited(controller.timeOut());
                              }
                            : null,
                        icon: const Icon(Icons.logout_rounded),
                        label: const Text('Time Out'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 16,
            runSpacing: 16,
            children: <Widget>[
              _MetricCard(
                title: 'Time In',
                value: record?.timeIn.isNotEmpty == true
                    ? record!.timeIn
                    : '--:--',
                caption:
                    'Scheduled: ${record?.scheduledTimeIn.isNotEmpty == true ? record!.scheduledTimeIn : '--:--'}',
                icon: Icons.alarm_add_rounded,
              ),
              _MetricCard(
                title: 'Time Out',
                value: record?.timeOut.isNotEmpty == true
                    ? record!.timeOut
                    : '--:--',
                caption:
                    'Scheduled: ${record?.scheduledTimeOut.isNotEmpty == true ? record!.scheduledTimeOut : '--:--'}',
                icon: Icons.alarm_off_rounded,
              ),
              _MetricCard(
                title: 'Worked',
                value: record?.workedHours ?? '0.00',
                caption: 'Hours logged today',
                icon: Icons.timelapse_rounded,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class AdminAttendancePage extends StatelessWidget {
  const AdminAttendancePage({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final rows = controller.attendanceSnapshot;
    final loading = controller.isSectionLoading('attendance-admin');
    final counts = <String, int>{
      'on_time': 0,
      'late': 0,
      'absent': 0,
      'suspended': 0,
      'excuse': 0,
    };
    for (final row in rows) {
      final key = row.statusGroup;
      if (counts.containsKey(key)) {
        counts[key] = counts[key]! + 1;
      }
    }

    return _WorkspacePageFrame(
      title: 'Attendance Board',
      subtitle: 'Daily visibility for head-admin mobile checks.',
      controller: controller,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Wrap(
            spacing: 16,
            runSpacing: 16,
            children: <Widget>[
              _MetricCard(
                title: 'Employees',
                value: '${rows.length}',
                caption: 'Visible in today snapshot',
                icon: Icons.people_alt_rounded,
              ),
              _MetricCard(
                title: 'On Time',
                value: '${counts['on_time']}',
                caption: 'Started on schedule',
                icon: Icons.task_alt_rounded,
              ),
              _MetricCard(
                title: 'Late',
                value: '${counts['late']}',
                caption: 'Needs follow-up',
                icon: Icons.warning_amber_rounded,
              ),
              _MetricCard(
                title: 'Absent',
                value: '${counts['absent']}',
                caption: 'No attendance activity',
                icon: Icons.event_busy_rounded,
              ),
            ],
          ),
          const SizedBox(height: 16),
          _GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Today snapshot',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 14),
                if (controller.sectionError('attendance-admin').isNotEmpty)
                  _InlineMessage(
                    message: controller.sectionError('attendance-admin'),
                    isError: true,
                  )
                else if (loading)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 28),
                      child: CircularProgressIndicator(),
                    ),
                  )
                else if (rows.isEmpty)
                  const _EmptyState(
                    title: 'No attendance rows yet',
                    body:
                        'The daily snapshot becomes visible here once employees are available.',
                  )
                else
                  Column(
                    children: rows
                        .map(
                          (row) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _PersonCard(
                              title: row.name,
                              subtitle: row.id,
                              badge: row.status,
                              meta: <String>[
                                'In ${row.timeIn.isEmpty ? '--:--' : row.timeIn}',
                                'Out ${row.timeOut.isEmpty ? '--:--' : row.timeOut}',
                                'Worked ${row.workedHours}',
                              ],
                              note: row.displayRemarks.isEmpty
                                  ? 'Branch ${row.branchId.isEmpty ? '-' : row.branchId}'
                                  : row.displayRemarks,
                            ),
                          ),
                        )
                        .toList(),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class TimeCardPage extends StatelessWidget {
  const TimeCardPage({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final rows = controller.cutoffCard;
    final loading = controller.isSectionLoading('timecard');
    final presentDays = rows
        .where((row) => row.timeIn.isNotEmpty || row.timeOut.isNotEmpty)
        .length;
    final lateDays = rows.where((row) => row.statusGroup == 'late').length;

    return _WorkspacePageFrame(
      title: 'Time Card',
      subtitle: 'Semi-monthly cutoff view that stays readable on phones.',
      controller: controller,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Selected cutoff date',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 8),
                Text(
                  controller.selectedCutoffDateKey,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: controller.selectedCutoffDate,
                      firstDate: DateTime(2024, 1, 1),
                      lastDate: controller.maxSelectableDate,
                    );
                    if (picked != null) {
                      await controller.setCutoffDate(picked);
                    }
                  },
                  icon: const Icon(Icons.calendar_month_rounded),
                  label: const Text('Choose date'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 16,
            runSpacing: 16,
            children: <Widget>[
              _MetricCard(
                title: 'Rows',
                value: '${rows.length}',
                caption: 'Current cutoff entries',
                icon: Icons.table_rows_rounded,
              ),
              _MetricCard(
                title: 'Present',
                value: '$presentDays',
                caption: 'Days with clock activity',
                icon: Icons.fact_check_rounded,
              ),
              _MetricCard(
                title: 'Late',
                value: '$lateDays',
                caption: 'Days flagged late',
                icon: Icons.timer_off_rounded,
              ),
            ],
          ),
          const SizedBox(height: 16),
          _GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Cutoff records',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 14),
                if (controller.sectionError('timecard').isNotEmpty)
                  _InlineMessage(
                    message: controller.sectionError('timecard'),
                    isError: true,
                  )
                else if (loading)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 28),
                      child: CircularProgressIndicator(),
                    ),
                  )
                else if (rows.isEmpty)
                  const _EmptyState(
                    title: 'No records in this cutoff',
                    body:
                        'Choose another date or wait for attendance activity to appear.',
                  )
                else
                  Column(
                    children: rows
                        .map(
                          (record) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _PersonCard(
                              title:
                                  '${record.dayLabel.isEmpty ? 'Day' : record.dayLabel} ${record.displayDate.isEmpty ? record.dateKey : record.displayDate}',
                              subtitle: record.status,
                              badge: record.workedHours,
                              meta: <String>[
                                'In ${record.timeIn.isEmpty ? '--:--' : record.timeIn}',
                                'Out ${record.timeOut.isEmpty ? '--:--' : record.timeOut}',
                              ],
                              note: record.displayRemarks.isEmpty
                                  ? 'Scheduled ${record.scheduledTimeIn.isEmpty ? '--:--' : record.scheduledTimeIn} - ${record.scheduledTimeOut.isEmpty ? '--:--' : record.scheduledTimeOut}'
                                  : record.displayRemarks,
                            ),
                          ),
                        )
                        .toList(),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class InventoryPage extends StatelessWidget {
  const InventoryPage({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final rows = controller.inventory;
    final lowCount = rows
        .where((row) => row.quantity <= AppController.lowStockThreshold)
        .length;

    return _WorkspacePageFrame(
      title: 'Inventory',
      subtitle: 'Branch-aware stock list tuned for mobile scrolling.',
      controller: controller,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                DropdownButtonFormField<String>(
                  initialValue: controller.inventoryBranch.isEmpty
                      ? null
                      : controller.inventoryBranch,
                  items: controller.activeBranches
                      .map(
                        (branch) => DropdownMenuItem<String>(
                          value: branch.name,
                          child: Text(branch.name),
                        ),
                      )
                      .toList(),
                  onChanged: (value) {
                    controller.updateInventoryBranch(value ?? '');
                  },
                  decoration: const InputDecoration(
                    labelText: 'Branch',
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  initialValue: controller.inventoryFilter,
                  textInputAction: TextInputAction.search,
                  onChanged: controller.updateInventoryFilter,
                  onFieldSubmitted: (_) {
                    unawaited(controller.loadInventory(force: true));
                  },
                  decoration: const InputDecoration(
                    labelText: 'Search stock',
                    prefixIcon: Icon(Icons.search_rounded),
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () {
                    unawaited(controller.loadInventory(force: true));
                  },
                  icon: const Icon(Icons.filter_alt_rounded),
                  label: const Text('Load stock'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 16,
            runSpacing: 16,
            children: <Widget>[
              _MetricCard(
                title: 'Items',
                value: '${rows.length}',
                caption: controller.inventoryBranch.isEmpty
                    ? 'Choose a branch'
                    : controller.inventoryBranch,
                icon: Icons.inventory_rounded,
              ),
              _MetricCard(
                title: 'Low Stock',
                value: '$lowCount',
                caption: 'At or below ${AppController.lowStockThreshold}',
                icon: Icons.warning_rounded,
              ),
            ],
          ),
          const SizedBox(height: 16),
          _GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Stock list',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 14),
                if (controller.sectionError('inventory').isNotEmpty)
                  _InlineMessage(
                    message: controller.sectionError('inventory'),
                    isError: true,
                  )
                else if (controller.isSectionLoading('inventory'))
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 28),
                      child: CircularProgressIndicator(),
                    ),
                  )
                else if (rows.isEmpty)
                  const _EmptyState(
                    title: 'No inventory items found',
                    body: 'Try another branch or a different search term.',
                  )
                else
                  Column(
                    children: rows
                        .map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _PersonCard(
                              title: item.itemName,
                              subtitle: item.itemCode.isEmpty
                                  ? 'No item code'
                                  : item.itemCode,
                              badge: _formatQuantity(item.quantity),
                              meta: <String>[
                                item.inventoryUnit.isEmpty
                                    ? 'Unit -'
                                    : item.inventoryUnit,
                                item.itemType.isEmpty
                                    ? 'Type -'
                                    : item.itemType,
                              ],
                              note: item.updatedAt.isEmpty
                                  ? 'No update timestamp'
                                  : 'Updated ${item.updatedAt}',
                              trailing: item.quantity <=
                                      AppController.lowStockThreshold
                                  ? const _StatusBadge(
                                      label: 'Low stock',
                                      tone: _CardTone.warning,
                                    )
                                  : const _StatusBadge(
                                      label: 'Healthy',
                                      tone: _CardTone.success,
                                    ),
                            ),
                          ),
                        )
                        .toList(),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class TeamPage extends StatelessWidget {
  const TeamPage({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return _PeopleDirectoryPage(
      controller: controller,
      title: 'Team Directory',
      subtitle: 'Employee-safe team list for quick mobile lookup.',
      rows: controller.teamMembers,
      loading: controller.isSectionLoading('team'),
      error: controller.sectionError('team'),
      initialValue: controller.teamFilter,
      onChanged: controller.updateTeamFilter,
      onSubmit: () {
        unawaited(controller.loadTeamMembers(force: true));
      },
    );
  }
}

class PeoplePage extends StatelessWidget {
  const PeoplePage({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return _PeopleDirectoryPage(
      controller: controller,
      title: 'People',
      subtitle: 'Head-admin directory with branch and account visibility.',
      rows: controller.people,
      loading: controller.isSectionLoading('people'),
      error: controller.sectionError('people'),
      initialValue: controller.peopleFilter,
      onChanged: controller.updatePeopleFilter,
      onSubmit: () {
        unawaited(controller.loadPeople(force: true));
      },
      extraHeader: _PeopleCreationCard(controller: controller),
      trailingBuilder: (person) => _UserActionsButton(
        controller: controller,
        person: person,
      ),
    );
  }
}

class BranchesPage extends StatefulWidget {
  const BranchesPage({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  State<BranchesPage> createState() => _BranchesPageState();
}

class _BranchesPageState extends State<BranchesPage> {
  late final TextEditingController _nameController;
  late final TextEditingController _addressController;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _addressController = TextEditingController();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  Future<void> _createBranch() async {
    final name = _nameController.text.trim();
    final address = _addressController.text.trim();
    if (name.isEmpty) {
      _showSnack('Branch name is required.', isError: true);
      return;
    }

    try {
      await widget.controller.createBranch(name: name, address: address);
      if (!mounted) {
        return;
      }
      _nameController.clear();
      _addressController.clear();
      _showSnack('Branch created.');
    } catch (_) {}
  }

  void _showSnack(String message, {bool isError = false}) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.showSnackBar(
      SnackBar(
          content: Text(message),
          backgroundColor: isError ? const Color(0xFF7A2630) : null),
    );
  }

  @override
  Widget build(BuildContext context) {
    final rows =
        widget.controller.bootstrap?.branches ?? const <BranchSummary>[];
    final activeCount = rows.where((branch) => branch.isActive).length;
    final loading = widget.controller.isSectionLoading('branches-create') ||
        widget.controller.isSectionLoading('bootstrap');

    return _WorkspacePageFrame(
      title: 'Branches',
      subtitle: 'Manage branch rollout from a mobile-safe admin screen.',
      controller: widget.controller,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Add branch',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _nameController,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: 'Branch name',
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _addressController,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) {
                    if (!loading) {
                      unawaited(_createBranch());
                    }
                  },
                  decoration: const InputDecoration(
                    labelText: 'Address',
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: loading ? null : _createBranch,
                  icon: const Icon(Icons.add_business_rounded),
                  label: const Text('Create branch'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 16,
            runSpacing: 16,
            children: <Widget>[
              _MetricCard(
                title: 'All branches',
                value: '${rows.length}',
                caption: 'Tenant branch records',
                icon: Icons.apartment_rounded,
              ),
              _MetricCard(
                title: 'Active',
                value: '$activeCount',
                caption: 'Ready for operations',
                icon: Icons.storefront_rounded,
              ),
            ],
          ),
          const SizedBox(height: 16),
          _GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Branch directory',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 14),
                if (rows.isEmpty)
                  const _EmptyState(
                    title: 'No branches yet',
                    body:
                        'Create the first branch to start assigning users and stock.',
                  )
                else
                  Column(
                    children: rows
                        .map(
                          (branch) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _PersonCard(
                              title: branch.name,
                              subtitle: branch.id,
                              badge: branch.isActive ? 'Active' : 'Inactive',
                              meta: <String>[
                                branch.address.isEmpty
                                    ? 'No address'
                                    : branch.address,
                              ],
                              note: branch.isActive
                                  ? 'This branch is available for staff, attendance, and inventory.'
                                  : 'This branch is currently inactive.',
                              trailing: _BranchActionsButton(
                                controller: widget.controller,
                                branch: branch,
                              ),
                            ),
                          ),
                        )
                        .toList(),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class BulletinPage extends StatelessWidget {
  const BulletinPage({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final feed = controller.bulletin;
    final announcement = feed.activeAnnouncement ?? feed.announcement;

    return _WorkspacePageFrame(
      title: 'Bulletin',
      subtitle: 'Announcements and holiday windows for mobile admin review.',
      controller: controller,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (announcement.hasContent)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: _InfoCard(
                title: announcement.title,
                subtitle: announcement.windowLabel.isEmpty
                    ? 'Company announcement'
                    : announcement.windowLabel,
                body: announcement.message,
                leading: const Icon(Icons.campaign_rounded),
                tone: _CardTone.highlight,
              ),
            ),
          if (controller.isHeadAdminLike) ...<Widget>[
            _BulletinManagementCard(controller: controller),
            const SizedBox(height: 16),
          ],
          _GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Upcoming items',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 14),
                if (controller.sectionError('bulletin').isNotEmpty)
                  _InlineMessage(
                    message: controller.sectionError('bulletin'),
                    isError: true,
                  )
                else if (controller.isSectionLoading('bulletin'))
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 28),
                      child: CircularProgressIndicator(),
                    ),
                  )
                else if (feed.items.isEmpty)
                  const _EmptyState(
                    title: 'No upcoming bulletin items',
                    body: 'Announcements and holiday entries will show here.',
                  )
                else
                  Column(
                    children: feed.items
                        .map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _PersonCard(
                              title: item.name,
                              subtitle: _titleize(item.type),
                              badge: item.startDate,
                              meta: <String>[
                                item.endDate.isEmpty
                                    ? item.startDate
                                    : '${item.startDate} to ${item.endDate}',
                                item.timeLabel.isEmpty
                                    ? 'All day'
                                    : item.timeLabel,
                              ],
                              note: item.note.isEmpty
                                  ? 'No additional notes.'
                                  : item.note,
                              trailing: controller.isHeadAdminLike
                                  ? _BulletinItemActionsButton(
                                      controller: controller,
                                      item: item,
                                    )
                                  : null,
                            ),
                          ),
                        )
                        .toList(),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class SettingsPage extends StatelessWidget {
  const SettingsPage({
    super.key,
    required this.controller,
  });

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final settings = controller.companySettings ??
        CompanySettings.fromBootstrap(controller.bootstrap);
    final company = controller.bootstrap?.company;
    final user = controller.user;

    return _WorkspacePageFrame(
      title: 'Settings',
      subtitle: controller.isHeadAdminLike
          ? 'Company profile, account details, and mobile-safe admin settings.'
          : 'Read-only mobile summary for account and company setup.',
      controller: controller,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Company profile',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 14),
                _DetailRow(
                    label: 'App name',
                    value: settings.appName.isEmpty
                        ? controller.branding.appName
                        : settings.appName),
                _DetailRow(
                    label: 'Company',
                    value: settings.name.isEmpty
                        ? company?.name ?? '-'
                        : settings.name),
                _DetailRow(
                    label: 'Company code',
                    value: settings.companyCode.isEmpty
                        ? company?.companyCode ?? '-'
                        : settings.companyCode.toUpperCase()),
                _DetailRow(
                    label: 'Primary color', value: settings.primaryColorHex),
                _DetailRow(
                    label: 'Address',
                    value: settings.address.isEmpty
                        ? 'Not configured'
                        : settings.address),
                _DetailRow(
                    label: 'Contact',
                    value: settings.contact.isEmpty
                        ? 'Not configured'
                        : settings.contact),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Signed-in account',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 14),
                _DetailRow(label: 'Name', value: user?.name ?? '-'),
                _DetailRow(label: 'Role', value: _titleize(user?.role ?? '')),
                _DetailRow(
                    label: 'Branch',
                    value: user?.branchName.isEmpty == true
                        ? '-'
                        : user?.branchName ?? '-'),
                _DetailRow(
                    label: 'Timezone',
                    value: user?.timeZone.isEmpty == true
                        ? 'Server default'
                        : user?.timeZone ?? 'Server default'),
                _DetailRow(
                    label: 'Last sync',
                    value: controller.lastSyncedLabel.isEmpty
                        ? 'Live'
                        : controller.lastSyncedLabel),
              ],
            ),
          ),
          if (controller.sectionError('settings').isNotEmpty) ...<Widget>[
            const SizedBox(height: 16),
            _InlineMessage(
              message: controller.sectionError('settings'),
              isError: true,
            ),
          ],
        ],
      ),
    );
  }
}

class _PeopleCreationCard extends StatefulWidget {
  const _PeopleCreationCard({required this.controller});

  final AppController controller;

  @override
  State<_PeopleCreationCard> createState() => _PeopleCreationCardState();
}

class _PeopleCreationCardState extends State<_PeopleCreationCard> {
  late final TextEditingController _idController;
  late final TextEditingController _nameController;
  late final TextEditingController _passwordController;
  String _role = 'employee';
  String _branchId = '';

  @override
  void initState() {
    super.initState();
    _idController = TextEditingController();
    _nameController = TextEditingController();
    _passwordController = TextEditingController();
    _branchId = widget.controller.activeBranches.isNotEmpty
        ? widget.controller.activeBranches.first.id
        : '';
  }

  @override
  void didUpdateWidget(covariant _PeopleCreationCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    final branchStillExists = widget.controller.activeBranches
        .any((branch) => branch.id == _branchId);
    if ((!branchStillExists || _branchId.isEmpty) &&
        widget.controller.activeBranches.isNotEmpty) {
      setState(() {
        _branchId = widget.controller.activeBranches.first.id;
      });
    }
  }

  @override
  void dispose() {
    _idController.dispose();
    _nameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final id = _idController.text.trim();
    final name = _nameController.text.trim();
    final password = _passwordController.text.trim();
    if (id.isEmpty || name.isEmpty || password.isEmpty) {
      _showSnack('User ID, name, and password are required.', isError: true);
      return;
    }

    BranchSummary? branch;
    for (final row in widget.controller.activeBranches) {
      if (row.id == _branchId) {
        branch = row;
        break;
      }
    }

    try {
      await widget.controller.createUser(
        id: id,
        name: name,
        password: password,
        role: _role,
        branchId: branch?.id ?? '',
        branchName: branch?.name ?? '',
      );
      if (!mounted) {
        return;
      }
      _idController.clear();
      _nameController.clear();
      _passwordController.clear();
      _showSnack('User created successfully.');
    } catch (_) {}
  }

  void _showSnack(String message, {bool isError = false}) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.showSnackBar(
      SnackBar(
          content: Text(message),
          backgroundColor: isError ? const Color(0xFF7A2630) : null),
    );
  }

  @override
  Widget build(BuildContext context) {
    final loading = widget.controller.isSectionLoading('people-create');
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            'Create account',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Add employee, staff, or company admin access from the phone-friendly admin screen.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: _webMuted.withValues(alpha: 0.92),
                ),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _idController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'User ID'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _nameController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Full name'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _passwordController,
            obscureText: true,
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) {
              if (!loading) {
                unawaited(_submit());
              }
            },
            decoration: const InputDecoration(labelText: 'Temporary password'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _role,
            items: const <DropdownMenuItem<String>>[
              DropdownMenuItem(value: 'employee', child: Text('Employee')),
              DropdownMenuItem(value: 'staff', child: Text('Staff')),
              DropdownMenuItem(
                  value: 'company_admin', child: Text('Company Admin')),
            ],
            onChanged: loading
                ? null
                : (value) {
                    setState(() {
                      _role = value ?? 'employee';
                    });
                  },
            decoration: const InputDecoration(labelText: 'Role'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _branchId.isEmpty ? null : _branchId,
            items: widget.controller.activeBranches
                .map(
                  (branch) => DropdownMenuItem<String>(
                    value: branch.id,
                    child: Text(branch.name),
                  ),
                )
                .toList(),
            onChanged: loading
                ? null
                : (value) {
                    setState(() {
                      _branchId = value ?? '';
                    });
                  },
            decoration: const InputDecoration(labelText: 'Branch'),
          ),
          const SizedBox(height: 12),
          if (widget.controller.sectionError('people-create').isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _InlineMessage(
                message: widget.controller.sectionError('people-create'),
                isError: true,
              ),
            ),
          FilledButton.icon(
            onPressed: loading ? null : _submit,
            icon: const Icon(Icons.person_add_alt_1_rounded),
            label: const Text('Create account'),
          ),
        ],
      ),
    );
  }
}

class _BulletinManagementCard extends StatefulWidget {
  const _BulletinManagementCard({required this.controller});

  final AppController controller;

  @override
  State<_BulletinManagementCard> createState() =>
      _BulletinManagementCardState();
}

class _BulletinManagementCardState extends State<_BulletinManagementCard> {
  late final TextEditingController _announcementTitleController;
  late final TextEditingController _announcementMessageController;
  late final TextEditingController _announcementStartController;
  late final TextEditingController _announcementEndController;
  late final TextEditingController _holidayNameController;
  late final TextEditingController _holidayStartController;
  late final TextEditingController _holidayEndController;
  late final TextEditingController _holidayTimeController;
  late final TextEditingController _holidayNoteController;
  String _holidayType = 'regular_holiday';

  @override
  void initState() {
    super.initState();
    _announcementTitleController = TextEditingController();
    _announcementMessageController = TextEditingController();
    _announcementStartController = TextEditingController();
    _announcementEndController = TextEditingController();
    _holidayNameController = TextEditingController();
    _holidayStartController = TextEditingController();
    _holidayEndController = TextEditingController();
    _holidayTimeController = TextEditingController();
    _holidayNoteController = TextEditingController();
    _syncAnnouncementFromController();
  }

  @override
  void didUpdateWidget(covariant _BulletinManagementCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncAnnouncementFromController();
  }

  void _syncAnnouncementFromController() {
    final announcement = widget.controller.bulletin.activeAnnouncement ??
        widget.controller.bulletin.announcement;
    if (!_announcementTitleController.text.trim().isNotEmpty) {
      _announcementTitleController.text = announcement.title;
    }
    if (!_announcementMessageController.text.trim().isNotEmpty) {
      _announcementMessageController.text = announcement.message;
    }
    if (_announcementStartController.text.isEmpty) {
      _announcementStartController.text = announcement.startsOn;
    }
    if (_announcementEndController.text.isEmpty) {
      _announcementEndController.text = announcement.endsOn;
    }
  }

  @override
  void dispose() {
    _announcementTitleController.dispose();
    _announcementMessageController.dispose();
    _announcementStartController.dispose();
    _announcementEndController.dispose();
    _holidayNameController.dispose();
    _holidayStartController.dispose();
    _holidayEndController.dispose();
    _holidayTimeController.dispose();
    _holidayNoteController.dispose();
    super.dispose();
  }

  Future<void> _pickDate(TextEditingController controller) async {
    final initial = _parseDate(controller.text) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2024, 1, 1),
      lastDate: DateTime(2100, 12, 31),
    );
    if (picked == null) {
      return;
    }
    controller.text = _formatDateKey(picked);
  }

  Future<void> _saveAnnouncement() async {
    if (_announcementMessageController.text.trim().isEmpty) {
      _showSnack('Announcement message is required.', isError: true);
      return;
    }
    try {
      await widget.controller.saveCompanyAnnouncement(
        title: _announcementTitleController.text.trim(),
        message: _announcementMessageController.text.trim(),
        startsOn: _announcementStartController.text.trim(),
        endsOn: _announcementEndController.text.trim(),
      );
      if (mounted) {
        _showSnack('Announcement saved.');
      }
    } catch (_) {}
  }

  Future<void> _clearAnnouncement() async {
    try {
      await widget.controller.clearCompanyAnnouncement();
      if (!mounted) {
        return;
      }
      _announcementTitleController.clear();
      _announcementMessageController.clear();
      _announcementStartController.clear();
      _announcementEndController.clear();
      _showSnack('Announcement cleared.');
    } catch (_) {}
  }

  Future<void> _createHoliday() async {
    final name = _holidayNameController.text.trim();
    final start = _holidayStartController.text.trim();
    final end = _holidayEndController.text.trim().isEmpty
        ? _holidayStartController.text.trim()
        : _holidayEndController.text.trim();
    if (name.isEmpty || start.isEmpty) {
      _showSnack('Calendar item name and start date are required.',
          isError: true);
      return;
    }
    try {
      await widget.controller.createCompanyHoliday(
        name: name,
        startDate: start,
        endDate: end,
        type: _holidayType,
        timeLabel: _holidayTimeController.text.trim(),
        note: _holidayNoteController.text.trim(),
      );
      if (!mounted) {
        return;
      }
      _holidayNameController.clear();
      _holidayStartController.clear();
      _holidayEndController.clear();
      _holidayTimeController.clear();
      _holidayNoteController.clear();
      _showSnack('Calendar item added.');
    } catch (_) {}
  }

  void _showSnack(String message, {bool isError = false}) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.showSnackBar(
      SnackBar(
          content: Text(message),
          backgroundColor: isError ? const Color(0xFF7A2630) : null),
    );
  }

  @override
  Widget build(BuildContext context) {
    final saving = widget.controller.isSectionLoading('bulletin-save');
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            'Manage bulletin',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Update employee announcements and add holiday or event entries directly from mobile.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: _webMuted.withValues(alpha: 0.92),
                ),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _announcementTitleController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Announcement title'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _announcementMessageController,
            maxLines: 4,
            decoration:
                const InputDecoration(labelText: 'Announcement message'),
          ),
          const SizedBox(height: 12),
          _ResponsivePair(
            leading: _DateField(
              controller: _announcementStartController,
              label: 'Starts on',
              onTap: () => _pickDate(_announcementStartController),
            ),
            trailing: _DateField(
              controller: _announcementEndController,
              label: 'Ends on',
              onTap: () => _pickDate(_announcementEndController),
            ),
          ),
          const SizedBox(height: 12),
          _ResponsivePair(
            leading: FilledButton.icon(
              onPressed: saving ? null : _saveAnnouncement,
              icon: const Icon(Icons.publish_rounded),
              label: const Text('Save announcement'),
            ),
            trailing: OutlinedButton.icon(
              onPressed: saving ? null : _clearAnnouncement,
              icon: const Icon(Icons.clear_rounded),
              label: const Text('Clear'),
            ),
          ),
          const SizedBox(height: 18),
          Text(
            'Add calendar item',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _holidayNameController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Item name'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _holidayType,
            items: const <DropdownMenuItem<String>>[
              DropdownMenuItem(
                  value: 'regular_holiday', child: Text('Regular Holiday')),
              DropdownMenuItem(
                  value: 'special_holiday', child: Text('Special Holiday')),
              DropdownMenuItem(
                  value: 'company_event', child: Text('Company Event')),
              DropdownMenuItem(
                  value: 'news_update', child: Text('Company News')),
            ],
            onChanged: saving
                ? null
                : (value) {
                    setState(() {
                      _holidayType = value ?? 'regular_holiday';
                    });
                  },
            decoration: const InputDecoration(labelText: 'Type'),
          ),
          const SizedBox(height: 12),
          _ResponsivePair(
            leading: _DateField(
              controller: _holidayStartController,
              label: 'Start date',
              onTap: () => _pickDate(_holidayStartController),
            ),
            trailing: _DateField(
              controller: _holidayEndController,
              label: 'End date',
              onTap: () => _pickDate(_holidayEndController),
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _holidayTimeController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Time label'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _holidayNoteController,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Notes'),
          ),
          const SizedBox(height: 12),
          if (widget.controller.sectionError('bulletin-save').isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _InlineMessage(
                message: widget.controller.sectionError('bulletin-save'),
                isError: true,
              ),
            ),
          FilledButton.icon(
            onPressed: saving ? null : _createHoliday,
            icon: const Icon(Icons.event_available_rounded),
            label: const Text('Add calendar item'),
          ),
        ],
      ),
    );
  }
}

class _CompanySettingsEditorCard extends StatefulWidget {
  const _CompanySettingsEditorCard({
    required this.controller,
    required this.settings,
  });

  final AppController controller;
  final CompanySettings settings;

  @override
  State<_CompanySettingsEditorCard> createState() =>
      _CompanySettingsEditorCardState();
}

class _CompanySettingsEditorCardState
    extends State<_CompanySettingsEditorCard> {
  late final TextEditingController _nameController;
  late final TextEditingController _companyCodeController;
  late final TextEditingController _appNameController;
  late final TextEditingController _primaryColorController;
  late final TextEditingController _addressController;
  late final TextEditingController _contactController;
  late final TextEditingController _logoController;
  late final TextEditingController _backgroundController;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _companyCodeController = TextEditingController();
    _appNameController = TextEditingController();
    _primaryColorController = TextEditingController();
    _addressController = TextEditingController();
    _contactController = TextEditingController();
    _logoController = TextEditingController();
    _backgroundController = TextEditingController();
    _syncFromSettings();
  }

  @override
  void didUpdateWidget(covariant _CompanySettingsEditorCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.settings != widget.settings) {
      _syncFromSettings(force: true);
    }
  }

  void _syncFromSettings({bool force = false}) {
    void write(TextEditingController controller, String value) {
      if (force || controller.text.isEmpty) {
        controller.text = value;
      }
    }

    write(_nameController, widget.settings.name);
    write(_companyCodeController, widget.settings.companyCode);
    write(_appNameController, widget.settings.appName);
    write(_primaryColorController, widget.settings.primaryColorHex);
    write(_addressController, widget.settings.address);
    write(_contactController, widget.settings.contact);
    write(_logoController, widget.settings.logoPath);
    write(_backgroundController, widget.settings.loginBackgroundPath);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _companyCodeController.dispose();
    _appNameController.dispose();
    _primaryColorController.dispose();
    _addressController.dispose();
    _contactController.dispose();
    _logoController.dispose();
    _backgroundController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_nameController.text.trim().isEmpty ||
        _companyCodeController.text.trim().isEmpty) {
      _showSnack('Company name and company code are required.', isError: true);
      return;
    }

    try {
      await widget.controller.saveCompanySettings(
        name: _nameController.text.trim(),
        companyCode: _companyCodeController.text.trim(),
        appName: _appNameController.text.trim(),
        primaryColor: _primaryColorController.text.trim(),
        address: _addressController.text.trim(),
        contact: _contactController.text.trim(),
        logoPath: _logoController.text.trim(),
        loginBackgroundPath: _backgroundController.text.trim(),
      );
      if (mounted) {
        _showSnack('Company settings saved.');
      }
    } catch (_) {}
  }

  void _showSnack(String message, {bool isError = false}) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.showSnackBar(
      SnackBar(
          content: Text(message),
          backgroundColor: isError ? const Color(0xFF7A2630) : null),
    );
  }

  @override
  Widget build(BuildContext context) {
    final saving = widget.controller.isSectionLoading('settings-save');
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            'Edit company settings',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Update the mobile-facing company identity and basic invoice contact details.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: _webMuted.withValues(alpha: 0.92),
                ),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _nameController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Company name'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _companyCodeController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Company code'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _appNameController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'App name'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _primaryColorController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Primary color hex'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _addressController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Address'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _contactController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Contact'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _logoController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Logo path'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _backgroundController,
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) {
              if (!saving) {
                unawaited(_save());
              }
            },
            decoration:
                const InputDecoration(labelText: 'Login background path'),
          ),
          const SizedBox(height: 12),
          if (widget.controller.sectionError('settings-save').isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _InlineMessage(
                message: widget.controller.sectionError('settings-save'),
                isError: true,
              ),
            ),
          FilledButton.icon(
            onPressed: saving ? null : _save,
            icon: const Icon(Icons.save_rounded),
            label: const Text('Save company settings'),
          ),
        ],
      ),
    );
  }
}

class _PeopleDirectoryPage extends StatelessWidget {
  const _PeopleDirectoryPage({
    required this.controller,
    required this.title,
    required this.subtitle,
    required this.rows,
    required this.loading,
    required this.error,
    required this.initialValue,
    required this.onChanged,
    required this.onSubmit,
    this.extraHeader,
    this.trailingBuilder,
  });

  final AppController controller;
  final String title;
  final String subtitle;
  final List<SessionUser> rows;
  final bool loading;
  final String error;
  final String initialValue;
  final ValueChanged<String> onChanged;
  final VoidCallback onSubmit;
  final Widget? extraHeader;
  final Widget Function(SessionUser person)? trailingBuilder;

  @override
  Widget build(BuildContext context) {
    return _WorkspacePageFrame(
      title: title,
      subtitle: subtitle,
      controller: controller,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (extraHeader != null) ...<Widget>[
            extraHeader!,
            const SizedBox(height: 16),
          ],
          _GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                TextFormField(
                  initialValue: initialValue,
                  textInputAction: TextInputAction.search,
                  onChanged: onChanged,
                  onFieldSubmitted: (_) => onSubmit(),
                  decoration: const InputDecoration(
                    labelText: 'Search people',
                    prefixIcon: Icon(Icons.search_rounded),
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: onSubmit,
                  icon: const Icon(Icons.travel_explore_rounded),
                  label: const Text('Refresh directory'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Directory',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 14),
                if (error.isNotEmpty)
                  _InlineMessage(message: error, isError: true)
                else if (loading)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 28),
                      child: CircularProgressIndicator(),
                    ),
                  )
                else if (rows.isEmpty)
                  const _EmptyState(
                    title: 'No matching accounts',
                    body: 'Try a different search keyword.',
                  )
                else
                  Column(
                    children: rows
                        .map(
                          (person) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _PersonCard(
                              title: person.name,
                              subtitle: person.id,
                              badge: _titleize(person.role),
                              meta: <String>[
                                person.branchName.isEmpty
                                    ? 'Branch -'
                                    : person.branchName,
                                person.accountStatus.isEmpty
                                    ? 'Status active'
                                    : 'Status ${person.accountStatus}',
                              ],
                              note: person.timeIn.isEmpty &&
                                      person.timeOut.isEmpty
                                  ? 'No default shift on file.'
                                  : 'Shift ${person.timeIn.isEmpty ? '--:--' : person.timeIn} - ${person.timeOut.isEmpty ? '--:--' : person.timeOut}',
                              trailing: trailingBuilder?.call(person),
                            ),
                          ),
                        )
                        .toList(),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BrandPanel extends StatelessWidget {
  const _BrandPanel({
    required this.controller,
    this.compact = false,
  });

  final AppController controller;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = compact
        ? 'What the mobile workspace keeps from the website'
        : 'The same branded login feel, adjusted for phones and tablets.';
    final body = compact
        ? 'You still get company-aware branding, clearer scan patterns, and recovery options, just arranged for vertical mobile reading.'
        : 'Type the Company ID first and the same logo, color, and workspace identity from the website carry into the app without turning the screen into a cramped desktop clone.';

    return _GlassCard(
      padding: EdgeInsets.all(compact ? 22 : 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _SectionTag(
            label: compact ? 'MOBILE EXPERIENCE' : 'BRANDED ACCESS',
            icon: compact
                ? Icons.phone_iphone_rounded
                : Icons.auto_awesome_rounded,
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: const <Widget>[
              _AuthChip(
                icon: Icons.lock_rounded,
                label: 'Secure workspace access',
              ),
              _AuthChip(
                icon: Icons.auto_awesome_rounded,
                label: 'Company-specific branding',
                soft: true,
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            compact
                ? 'Mobile-first shell'
                : 'Sign in to your company workspace',
            style: theme.textTheme.labelLarge?.copyWith(
              color: Theme.of(context).colorScheme.primary,
              letterSpacing: 1.2,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            body,
            style: theme.textTheme.bodyLarge?.copyWith(
              color: _webMuted.withValues(alpha: 0.94),
            ),
          ),
          const SizedBox(height: 18),
          LayoutBuilder(
            builder: (context, constraints) {
              final stacked = compact || constraints.maxWidth < 560;
              final cards = <Widget>[
                const _AuthShowcaseCard(
                  icon: Icons.apartment_rounded,
                  title: 'Company theme preview',
                  body:
                      'The app keeps the same company-aware logo and color direction used on the website login.',
                  highlighted: true,
                ),
                const _AuthShowcaseCard(
                  icon: Icons.email_outlined,
                  title: 'Email and password first',
                  body:
                      'The main phone flow stays direct and uncluttered, with large fields and a clearer path to sign in.',
                ),
              ];

              if (stacked) {
                return Column(
                  children: cards
                      .map(
                        (card) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: card,
                        ),
                      )
                      .toList(),
                );
              }

              return Row(
                children: <Widget>[
                  Expanded(child: cards[0]),
                  const SizedBox(width: 12),
                  Expanded(child: cards[1]),
                ],
              );
            },
          ),
          const SizedBox(height: 12),
          _AuthSurfaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const <Widget>[
                _AuthSectionHeading(
                  kicker: 'Why this matches the web',
                  title: 'What carries over into the phone layout',
                  badge: 'Phone tuned',
                ),
                SizedBox(height: 14),
                _AuthFeatureItem(
                  icon: Icons.phone_iphone_rounded,
                  title: 'Better one-hand reading',
                  body:
                      'The visual language stays close to the website, but sections stack vertically and buttons stay thumb-friendly.',
                ),
                SizedBox(height: 12),
                _AuthFeatureItem(
                  icon: Icons.hub_rounded,
                  title: 'Same branded workspace identity',
                  body:
                      'Company ID, login, password recovery, and backend-connected flows remain aligned with your current GMS stack.',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LoginForm extends StatefulWidget {
  const _LoginForm({required this.controller});

  final AppController controller;

  @override
  State<_LoginForm> createState() => _LoginFormState();
}

class _LoginFormState extends State<_LoginForm> {
  bool _obscurePassword = true;

  Future<void> _openPublicPortal(String intent) async {
    final uri = _buildPublicPortalUri(widget.controller, intent);
    await _openExternalUri(uri, 'Unable to open that page right now.');
  }

  Future<void> _openPrivacyPolicy() async {
    final uri = _buildPublicUri(widget.controller.apiBaseUrl, '/privacy');
    await _openExternalUri(uri, 'Unable to open Privacy Policy right now.');
  }

  Future<void> _openExternalUri(Uri uri, String fallbackMessage) async {
    try {
      final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (opened) {
        return;
      }
    } catch (_) {}
    if (!mounted) {
      return;
    }
    _showSnack(fallbackMessage, isError: true);
  }

  void _showSnack(String message, {bool isError = false}) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? const Color(0xFF7A2630) : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final loginPalette = _buildLoginPalette(_loginPrimaryColor(controller));
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 390;
        final fieldTheme = Theme.of(context).copyWith(
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: _webDarkCard.withValues(alpha: 0.94),
            floatingLabelBehavior: FloatingLabelBehavior.never,
            isDense: true,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
            labelStyle: TextStyle(
              color: _webMuted.withValues(alpha: 0.96),
              fontWeight: FontWeight.w800,
            ),
            hintStyle: TextStyle(
              color: _webMuted.withValues(alpha: 0.74),
              fontWeight: FontWeight.w600,
            ),
            prefixIconColor: _webText.withValues(alpha: 0.86),
            suffixIconColor: _webText.withValues(alpha: 0.82),
            prefixIconConstraints:
                const BoxConstraints(minWidth: 42, minHeight: 46),
            suffixIconConstraints:
                const BoxConstraints(minWidth: 42, minHeight: 46),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(color: _webBorder),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(color: _webBorder),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(
                color: loginPalette.primary.withValues(alpha: 0.76),
                width: 1.2,
              ),
            ),
          ),
          textSelectionTheme: TextSelectionThemeData(
            cursorColor: loginPalette.primary,
          ),
        );
        return _LoginGlassCard(
          palette: loginPalette,
          maxWidth: 560,
          padding: EdgeInsets.fromLTRB(
            compact ? 18 : 19,
            compact ? 18 : 10,
            compact ? 18 : 19,
            compact ? 18 : 18,
          ),
          child: Theme(
            data: fieldTheme,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _LoginHeader(
                  controller: controller,
                  palette: loginPalette,
                ),
                const SizedBox(height: 22),
                if (controller.errorMessage.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _InlineMessage(
                      message: controller.errorMessage,
                      isError: true,
                    ),
                  ),
                if (controller.infoMessage.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _InlineMessage(message: controller.infoMessage),
                  ),
                TextFormField(
                  initialValue: controller.companyCode,
                  style: TextStyle(
                    color: _webText,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                  textInputAction: TextInputAction.next,
                  onChanged: controller.updateCompanyCode,
                  decoration: const InputDecoration(
                    hintText: 'Company ID',
                    prefixIcon: Icon(Icons.business_rounded),
                  ),
                ),
                const SizedBox(height: 14),
                TextFormField(
                  initialValue: controller.username,
                  style: TextStyle(
                    color: _webText,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                  textInputAction: TextInputAction.next,
                  keyboardType: TextInputType.emailAddress,
                  onChanged: controller.updateUsername,
                  decoration: const InputDecoration(
                    hintText: 'Username or email',
                    prefixIcon: Icon(Icons.alternate_email_rounded),
                  ),
                ),
                const SizedBox(height: 14),
                TextFormField(
                  style: TextStyle(
                    color: _webText,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                  obscureText: _obscurePassword,
                  onChanged: controller.updatePassword,
                  onFieldSubmitted: (_) {
                    unawaited(controller.submitLogin());
                  },
                  decoration: InputDecoration(
                    hintText: 'Password',
                    prefixIcon: const Icon(Icons.lock_outline_rounded),
                    suffixIcon: IconButton(
                      tooltip:
                          _obscurePassword ? 'Show password' : 'Hide password',
                      onPressed: () {
                        setState(() {
                          _obscurePassword = !_obscurePassword;
                        });
                      },
                      icon: Icon(
                        _obscurePassword
                            ? Icons.visibility_rounded
                            : Icons.visibility_off_rounded,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                _LoginActionButton(
                  palette: loginPalette,
                  loading: controller.isBusy,
                  label: controller.isBusy ? 'Please wait...' : 'Login',
                  onPressed: () {
                    unawaited(controller.submitLogin());
                  },
                ),
                const SizedBox(height: 6),
                Row(
                  children: <Widget>[
                    _LoginTextLink(
                      label: 'Sign up',
                      onPressed: controller.isBusy
                          ? null
                          : () {
                              unawaited(_openPublicPortal('signup'));
                            },
                    ),
                    const Spacer(),
                    _LoginTextLink(
                      label: 'Forgot Password?',
                      onPressed: controller.isBusy
                          ? null
                          : controller.showForgotPasswordMode,
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                _LoginSecondaryButton(
                  label: 'Register Company ID',
                  onPressed: controller.isBusy
                      ? null
                      : () {
                          unawaited(
                            _openPublicPortal('register_company_id'),
                          );
                        },
                ),
                const SizedBox(height: 18),
                const _AuthDivider(label: 'Quick access'),
                const SizedBox(height: 14),
                _LoginGooglePanel(
                  controller: controller,
                  palette: loginPalette,
                ),
                const SizedBox(height: 20),
                Divider(color: _webBorder),
                _LoginFooterLinks(
                  onSupport: controller.isBusy
                      ? null
                      : () {
                          unawaited(_openPublicPortal('support'));
                        },
                  onPrivacy: () {
                    unawaited(_openPrivacyPolicy());
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _LoginGlassCard extends StatelessWidget {
  const _LoginGlassCard({
    required this.child,
    required this.palette,
    this.padding = const EdgeInsets.all(24),
    this.maxWidth,
  });

  final Widget child;
  final _LoginPalette palette;
  final EdgeInsets padding;
  final double? maxWidth;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(30);
    Widget content = Container(
      decoration: BoxDecoration(
        borderRadius: radius,
        border: Border.all(color: _webBorder),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[
            Color(0xFCFFFFFF),
            Color(0xF4F4FAF6),
          ],
        ),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: const Color(0x261E3A2C),
            blurRadius: 42,
            offset: const Offset(0, 18),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 6, sigmaY: 6),
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0.78, -0.32),
                radius: 0.7,
                colors: <Color>[
                  palette.primary.withValues(alpha: 0.1),
                  Colors.transparent,
                ],
              ),
            ),
            child: Padding(padding: padding, child: child),
          ),
        ),
      ),
    );
    if (maxWidth != null) {
      content = ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth!),
        child: content,
      );
    }
    return content;
  }
}

class _LoginHeader extends StatelessWidget {
  const _LoginHeader({
    required this.controller,
    required this.palette,
  });

  final AppController controller;
  final _LoginPalette palette;

  @override
  Widget build(BuildContext context) {
    final subtitle = controller.branding.companyName.isEmpty
        ? 'Sign in to continue'
        : controller.branding.companyName;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        Center(
          child: _LoginBrandBadge(
            controller: controller,
            palette: palette,
            size: 92,
            radius: 24,
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'SIGN IN TO YOUR COMPANY WORKSPACE',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: palette.primary,
                fontWeight: FontWeight.w900,
                letterSpacing: 2.3,
              ),
        ),
        const SizedBox(height: 8),
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            '${controller.branding.appName} Login',
            textAlign: TextAlign.center,
            maxLines: 1,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: _webText,
                  fontFamily: _headingFontFamily,
                  fontFamilyFallback: _headingFontFallback,
                  fontSize: 38,
                  fontWeight: FontWeight.w900,
                  height: 1.05,
                ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: _webMuted,
                fontWeight: FontWeight.w800,
              ),
        ),
      ],
    );
  }
}

class _LoginBrandBadge extends StatelessWidget {
  const _LoginBrandBadge({
    required this.controller,
    required this.palette,
    required this.size,
    required this.radius,
  });

  final AppController controller;
  final _LoginPalette palette;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final logoPath = controller.branding.logoPath.isNotEmpty
        ? controller.branding.logoPath
        : (controller.bootstrap?.company.logoPath ?? '');
    final imageUrl = _resolveMediaUrl(logoPath, controller.apiBaseUrl);
    final fallback = _BrandMonogram(
      label: controller.branding.appName,
      radius: radius,
    );
    final image = imageUrl != null
        ? Image.network(
            imageUrl,
            fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) {
              return Image.asset(
                _defaultBrandAsset,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => fallback,
              );
            },
          )
        : Image.asset(
            _defaultBrandAsset,
            fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) => fallback,
          );

    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.zero,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: _webBorder),
        color: _webDarkCard.withValues(alpha: 0.98),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: const Color(0x221C3A2B),
            blurRadius: 26,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: image,
      ),
    );
  }
}

class _LoginActionButton extends StatelessWidget {
  const _LoginActionButton({
    required this.label,
    required this.onPressed,
    required this.palette,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final _LoginPalette palette;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final disabled = onPressed == null || loading;
    return Opacity(
      opacity: disabled ? 0.76 : 1,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          height: 58,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: <Color>[
                palette.bright,
                palette.accent,
                palette.sun,
              ],
              stops: const <double>[0, 0.56, 1],
            ),
            boxShadow: <BoxShadow>[
              BoxShadow(
                color: palette.primary.withValues(alpha: 0.3),
                blurRadius: 34,
                offset: const Offset(0, 18),
              ),
            ],
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: disabled ? null : onPressed,
            child: Center(
              child: loading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.2,
                        color: Colors.white,
                      ),
                    )
                  : Text(
                      label,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                          ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _LoginSecondaryButton extends StatelessWidget {
  const _LoginSecondaryButton({
    required this.label,
    required this.onPressed,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final style = OutlinedButton.styleFrom(
      foregroundColor: _webText.withValues(alpha: 0.92),
      minimumSize: const Size.fromHeight(50),
      side: BorderSide(color: _webBorder),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      textStyle: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w800,
      ),
    );
    return SizedBox(
      width: double.infinity,
      child: icon == null
          ? OutlinedButton(
              onPressed: onPressed,
              style: style,
              child: Text(label),
            )
          : OutlinedButton.icon(
              onPressed: onPressed,
              icon: Icon(icon),
              label: Text(label),
              style: style,
            ),
    );
  }
}

class _LoginTextLink extends StatelessWidget {
  const _LoginTextLink({
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: _webMuted.withValues(alpha: 0.94),
        padding: EdgeInsets.zero,
        minimumSize: const Size(0, 34),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        textStyle: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w900,
        ),
      ),
      child: Text(label),
    );
  }
}

class _LoginFooterLinks extends StatelessWidget {
  const _LoginFooterLinks({
    required this.onSupport,
    required this.onPrivacy,
  });

  final VoidCallback? onSupport;
  final VoidCallback? onPrivacy;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          _LoginTextLink(label: 'Support', onPressed: onSupport),
          const SizedBox(width: 18),
          _LoginTextLink(label: 'Privacy Policy', onPressed: onPrivacy),
        ],
      ),
    );
  }
}

class _LoginGooglePanel extends StatelessWidget {
  const _LoginGooglePanel({
    required this.controller,
    required this.palette,
  });

  final AppController controller;
  final _LoginPalette palette;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: _webBorder),
        color: _webDarkCard.withValues(alpha: 0.94),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            'GOOGLE SIGN-IN',
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: palette.primary,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 2,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Use your linked Google account after entering the Company ID.',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: _webText,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                  height: 1.18,
                ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(16),
              child: Ink(
                height: 54,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: <Color>[Color(0xFAFFFFFF), Color(0xF0F1F5F9)],
                  ),
                  border: Border.all(color: _webBorder),
                  boxShadow: <BoxShadow>[
                    BoxShadow(
                      color: const Color(0x1F203B2E),
                      blurRadius: 20,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap:
                      controller.isBusy ? null : controller.submitGoogleLogin,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: <Widget>[
                      const _GoogleLogoMark(size: 32),
                      const SizedBox(width: 12),
                      Text(
                        'Continue with Google',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              color: const Color(0xFF17243B),
                              fontWeight: FontWeight.w900,
                            ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GoogleLogoMark extends StatelessWidget {
  const _GoogleLogoMark({this.size = 28});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
      ),
      child: CustomPaint(
        painter: _GoogleLogoPainter(),
      ),
    );
  }
}

class _GoogleLogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * 0.13;
    final rect = Rect.fromLTWH(
      size.width * 0.22,
      size.height * 0.2,
      size.width * 0.56,
      size.height * 0.56,
    );

    void arc(Color color, double start, double sweep) {
      final paint = Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round;
      canvas.drawArc(rect, start, sweep, false, paint);
    }

    arc(const Color(0xFF4285F4), -0.15 * math.pi, 0.55 * math.pi);
    arc(const Color(0xFF34A853), 0.48 * math.pi, 0.44 * math.pi);
    arc(const Color(0xFFFBBC05), 0.92 * math.pi, 0.35 * math.pi);
    arc(const Color(0xFFEA4335), 1.25 * math.pi, 0.58 * math.pi);

    final bluePaint = Paint()
      ..color = const Color(0xFF4285F4)
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.square;
    canvas.drawLine(
      Offset(size.width * 0.52, size.height * 0.5),
      Offset(size.width * 0.78, size.height * 0.5),
      bluePaint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _ForgotPasswordForm extends StatefulWidget {
  const _ForgotPasswordForm({required this.controller});

  final AppController controller;

  @override
  State<_ForgotPasswordForm> createState() => _ForgotPasswordFormState();
}

class _ForgotPasswordFormState extends State<_ForgotPasswordForm> {
  late final TextEditingController _companyController;
  late final TextEditingController _emailController;
  late final TextEditingController _codeController;
  late final TextEditingController _passwordController;
  late final TextEditingController _confirmController;
  bool _verified = false;
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;

  @override
  void initState() {
    super.initState();
    _companyController =
        TextEditingController(text: widget.controller.companyCode);
    _emailController = TextEditingController();
    _codeController = TextEditingController();
    _passwordController = TextEditingController();
    _confirmController = TextEditingController();
  }

  @override
  void dispose() {
    _companyController.dispose();
    _emailController.dispose();
    _codeController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final email = _emailController.text.trim();
    final companyCode = _companyController.text.trim();
    if (companyCode.isEmpty) {
      _showSnack('Company ID is required.', isError: true);
      return;
    }
    if (email.isEmpty) {
      _showSnack('Email is required.', isError: true);
      return;
    }
    widget.controller.updateCompanyCode(companyCode);
    try {
      await widget.controller.requestPasswordResetCode(
        companyCode: companyCode,
        email: email,
      );
      if (!mounted) {
        return;
      }
      _codeController.clear();
      _passwordController.clear();
      _confirmController.clear();
      setState(() {
        _verified = false;
      });
      _showSnack('Verification code sent.');
    } catch (_) {}
  }

  Future<void> _verifyCode() async {
    final email = _emailController.text.trim();
    final companyCode = _companyController.text.trim();
    final code = _codeController.text.trim();
    if (companyCode.isEmpty) {
      _showSnack('Company ID is required.', isError: true);
      return;
    }
    if (email.isEmpty || code.isEmpty) {
      _showSnack('Email and verification code are required.', isError: true);
      return;
    }
    try {
      await widget.controller.verifyPasswordResetCode(
        companyCode: companyCode,
        email: email,
        code: code,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _verified = true;
      });
      _showSnack('Code verified.');
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _verified = false;
      });
    }
  }

  Future<void> _resetPassword() async {
    final email = _emailController.text.trim();
    final companyCode = _companyController.text.trim();
    final code = _codeController.text.trim();
    final password = _passwordController.text.trim();
    final confirm = _confirmController.text.trim();

    if (companyCode.isEmpty) {
      _showSnack('Company ID is required.', isError: true);
      return;
    }
    if (email.isEmpty || code.isEmpty) {
      _showSnack('Email and verification code are required.', isError: true);
      return;
    }
    if (!_verified) {
      _showSnack('Verify the code first.', isError: true);
      return;
    }
    if (password.length < 8) {
      _showSnack('Password must be at least 8 characters.', isError: true);
      return;
    }
    if (password != confirm) {
      _showSnack('Passwords do not match.', isError: true);
      return;
    }

    try {
      await widget.controller.confirmPasswordReset(
        companyCode: companyCode,
        email: email,
        code: code,
        password: password,
      );
      if (!mounted) {
        return;
      }
      _codeController.clear();
      _passwordController.clear();
      _confirmController.clear();
      setState(() {
        _verified = false;
      });
      _showSnack('Password reset successful.');
    } catch (_) {}
  }

  void _showSnack(String message, {bool isError = false}) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.showSnackBar(
      SnackBar(
          content: Text(message),
          backgroundColor: isError ? const Color(0xFF7A2630) : null),
    );
  }

  @override
  Widget build(BuildContext context) {
    final busy = widget.controller.isBusy;
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 390;
        return _GlassCard(
          maxWidth: 460,
          padding: EdgeInsets.fromLTRB(
            compact ? 16 : 20,
            compact ? 18 : 22,
            compact ? 16 : 20,
            compact ? 16 : 20,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (widget.controller.errorMessage.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _InlineMessage(
                    message: widget.controller.errorMessage,
                    isError: true,
                  ),
                ),
              if (widget.controller.infoMessage.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _InlineMessage(message: widget.controller.infoMessage),
                ),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: const <Widget>[
                  _AuthChip(
                    icon: Icons.lock_reset_rounded,
                    label: 'Secure reset',
                  ),
                  _AuthChip(
                    icon: Icons.mark_email_unread_outlined,
                    label: 'Email code',
                    soft: true,
                  ),
                ],
              ),
              const SizedBox(height: 18),
              _AuthLockup(
                controller: widget.controller,
                kicker: 'Recover access to your workspace',
                title: '${widget.controller.branding.appName} Forgot Password',
                subtitle: 'Reset your password with an email code.',
                hint: _authBrandingHint(widget.controller.branding),
              ),
              const SizedBox(height: 18),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: const <Widget>[
                  _AuthChip(
                    icon: Icons.apartment_rounded,
                    label: 'Company ID',
                  ),
                  _AuthChip(
                    icon: Icons.key_rounded,
                    label: 'Code',
                  ),
                  _AuthChip(
                    icon: Icons.password_rounded,
                    label: 'New password',
                  ),
                ],
              ),
              const SizedBox(height: 18),
              _AuthSurfaceCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    const _AuthSectionHeading(
                      kicker: 'Step 1',
                      title: 'Request a reset code',
                      badge: 'Email delivery',
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Enter the Company ID and email linked to your account.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: _webMuted.withValues(alpha: 0.94),
                          ),
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _companyController,
                      textInputAction: TextInputAction.next,
                      onChanged: (value) {
                        if (_verified) {
                          setState(() {
                            _verified = false;
                          });
                        }
                        widget.controller.updateCompanyCode(value);
                      },
                      decoration: const InputDecoration(
                        labelText: 'Company ID',
                        prefixIcon: Icon(Icons.apartment_rounded),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _emailController,
                      textInputAction: TextInputAction.next,
                      keyboardType: TextInputType.emailAddress,
                      onChanged: (_) {
                        if (_verified) {
                          setState(() {
                            _verified = false;
                          });
                        }
                      },
                      decoration: const InputDecoration(
                        labelText: 'Email',
                        prefixIcon: Icon(Icons.alternate_email_rounded),
                      ),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: busy ? null : _sendCode,
                        icon: const Icon(Icons.mark_email_read_rounded),
                        label: const Text('Send Code'),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              _AuthSurfaceCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    _AuthSectionHeading(
                      kicker: 'Step 2',
                      title: 'Reset the password',
                      badge:
                          _verified ? 'Code verified' : 'Verification required',
                    ),
                    const SizedBox(height: 10),
                    Text(
                      _verified
                          ? 'Create and confirm the new password.'
                          : 'Verify the email code before entering a new password.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: _webMuted.withValues(alpha: 0.94),
                          ),
                    ),
                    const SizedBox(height: 14),
                    _ResponsivePair(
                      leading: TextFormField(
                        controller: _codeController,
                        textInputAction: TextInputAction.done,
                        onChanged: (_) {
                          if (_verified) {
                            setState(() {
                              _verified = false;
                            });
                          }
                        },
                        decoration: const InputDecoration(
                          labelText: 'Verification code',
                          prefixIcon: Icon(Icons.verified_user_outlined),
                        ),
                      ),
                      trailing: OutlinedButton(
                        onPressed: busy ? null : _verifyCode,
                        child: Text(_verified ? 'Verified' : 'Verify'),
                      ),
                      leadingFlex: 2,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      enabled: _verified,
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: 'New password',
                        prefixIcon: const Icon(Icons.password_rounded),
                        suffixIcon: IconButton(
                          tooltip: _obscurePassword
                              ? 'Show password'
                              : 'Hide password',
                          onPressed: !_verified
                              ? null
                              : () {
                                  setState(() {
                                    _obscurePassword = !_obscurePassword;
                                  });
                                },
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_rounded
                                : Icons.visibility_off_rounded,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _confirmController,
                      obscureText: _obscureConfirmPassword,
                      enabled: _verified,
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) {
                        if (!busy) {
                          unawaited(_resetPassword());
                        }
                      },
                      decoration: InputDecoration(
                        labelText: 'Confirm new password',
                        prefixIcon: const Icon(Icons.password_rounded),
                        suffixIcon: IconButton(
                          tooltip: _obscureConfirmPassword
                              ? 'Show password'
                              : 'Hide password',
                          onPressed: !_verified
                              ? null
                              : () {
                                  setState(() {
                                    _obscureConfirmPassword =
                                        !_obscureConfirmPassword;
                                  });
                                },
                          icon: Icon(
                            _obscureConfirmPassword
                                ? Icons.visibility_rounded
                                : Icons.visibility_off_rounded,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: busy || !_verified ? null : _resetPassword,
                        icon: const Icon(Icons.lock_reset_rounded),
                        label: const Text('Reset Password'),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              TextButton(
                onPressed: busy ? null : widget.controller.showLoginMode,
                child: const Text('Back to login'),
              ),
            ],
          ),
        );
      },
    );
  }
}

enum _UserDirectoryAction {
  edit,
  delete,
}

enum _BranchDirectoryAction {
  edit,
  toggleActive,
  delete,
}

enum _BulletinItemAction {
  edit,
  delete,
}

class _UserActionsButton extends StatelessWidget {
  const _UserActionsButton({
    required this.controller,
    required this.person,
  });

  final AppController controller;
  final SessionUser person;

  Future<void> _handleAction(
    BuildContext context,
    _UserDirectoryAction action,
  ) async {
    switch (action) {
      case _UserDirectoryAction.edit:
        await showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          backgroundColor: _webDarkCard,
          builder: (context) => _UserEditorSheet(
            controller: controller,
            person: person,
          ),
        );
        break;
      case _UserDirectoryAction.delete:
        final confirmed = await _confirmDestructiveAction(
          context,
          title: 'Delete account?',
          body: 'This removes ${person.name} from the company user list.',
          confirmLabel: 'Delete',
        );
        if (!confirmed || !context.mounted) {
          return;
        }
        await controller.deleteUser(person.id);
        if (!context.mounted) {
          return;
        }
        final error = controller.sectionError('people-edit');
        if (error.isEmpty) {
          _showPageSnack(context, 'Account deleted.');
        } else {
          _showPageSnack(context, error, isError: true);
        }
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<_UserDirectoryAction>(
      tooltip: 'Account actions',
      onSelected: (action) {
        unawaited(_handleAction(context, action));
      },
      itemBuilder: (context) => <PopupMenuEntry<_UserDirectoryAction>>[
        const PopupMenuItem<_UserDirectoryAction>(
          value: _UserDirectoryAction.edit,
          child: Text('Edit account'),
        ),
        const PopupMenuItem<_UserDirectoryAction>(
          value: _UserDirectoryAction.delete,
          child: Text('Delete account'),
        ),
      ],
    );
  }
}

class _UserEditorSheet extends StatefulWidget {
  const _UserEditorSheet({
    required this.controller,
    required this.person,
  });

  final AppController controller;
  final SessionUser person;

  @override
  State<_UserEditorSheet> createState() => _UserEditorSheetState();
}

class _UserEditorSheetState extends State<_UserEditorSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _passwordController;
  late final TextEditingController _timeInController;
  late final TextEditingController _timeOutController;
  late String _role;
  late String _branchId;
  late String _accountStatus;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.person.name);
    _passwordController = TextEditingController();
    _timeInController = TextEditingController(text: widget.person.timeIn);
    _timeOutController = TextEditingController(text: widget.person.timeOut);
    _role = widget.person.role.isEmpty ? 'employee' : widget.person.role;
    _branchId = widget.person.branchId;
    _accountStatus = widget.person.accountStatus.isEmpty
        ? 'active'
        : widget.person.accountStatus;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _passwordController.dispose();
    _timeInController.dispose();
    _timeOutController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      _showPageSnack(context, 'Full name is required.', isError: true);
      return;
    }

    BranchSummary? branch;
    for (final row
        in widget.controller.bootstrap?.branches ?? const <BranchSummary>[]) {
      if (row.id == _branchId) {
        branch = row;
        break;
      }
    }

    await widget.controller.updateUser(
      userId: widget.person.id,
      name: name,
      role: _role,
      branchId: branch?.id ?? '',
      branchName: branch?.name ?? '',
      accountStatus: _accountStatus,
      timeIn: _timeInController.text.trim(),
      timeOut: _timeOutController.text.trim(),
      password: _passwordController.text.trim().isEmpty
          ? null
          : _passwordController.text.trim(),
    );
    if (!mounted) {
      return;
    }
    final error = widget.controller.sectionError('people-edit');
    if (error.isNotEmpty) {
      return;
    }
    _showPageSnack(context, 'Account updated.');
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final loading = widget.controller.isSectionLoading('people-edit');
    final branches =
        widget.controller.bootstrap?.branches ?? const <BranchSummary>[];
    final branchIds = branches.map((branch) => branch.id).toSet();
    final selectedBranchId = branchIds.contains(_branchId) ? _branchId : '';
    final roleOptions = <String>{
      'employee',
      'staff',
      'company_admin',
      'head_admin',
      'super_admin',
    };
    final selectedRole = roleOptions.contains(_role) ? _role : 'employee';
    final statusOptions = <String>{'active', 'suspended', 'inactive'};
    final selectedStatus =
        statusOptions.contains(_accountStatus) ? _accountStatus : 'active';

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          20 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                'Edit account',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                'Update role, branch, schedule, and status without leaving the mobile admin workspace.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: _webMuted.withValues(alpha: 0.92),
                    ),
              ),
              const SizedBox(height: 18),
              TextFormField(
                initialValue: widget.person.id,
                enabled: false,
                decoration: const InputDecoration(labelText: 'User ID'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _nameController,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Full name'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _passwordController,
                obscureText: true,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: 'New password (optional)',
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: selectedRole,
                items: const <DropdownMenuItem<String>>[
                  DropdownMenuItem(value: 'employee', child: Text('Employee')),
                  DropdownMenuItem(value: 'staff', child: Text('Staff')),
                  DropdownMenuItem(
                      value: 'company_admin', child: Text('Company Admin')),
                  DropdownMenuItem(
                      value: 'head_admin', child: Text('Head Admin')),
                  DropdownMenuItem(
                      value: 'super_admin', child: Text('Super Admin')),
                ],
                onChanged: loading
                    ? null
                    : (value) {
                        setState(() {
                          _role = value ?? 'employee';
                        });
                      },
                decoration: const InputDecoration(labelText: 'Role'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: selectedBranchId,
                items: <DropdownMenuItem<String>>[
                  const DropdownMenuItem<String>(
                    value: '',
                    child: Text('Unassigned'),
                  ),
                  ...branches.map(
                    (branch) => DropdownMenuItem<String>(
                      value: branch.id,
                      child: Text(branch.name),
                    ),
                  ),
                ],
                onChanged: loading
                    ? null
                    : (value) {
                        setState(() {
                          _branchId = value ?? '';
                        });
                      },
                decoration: const InputDecoration(labelText: 'Branch'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: selectedStatus,
                items: const <DropdownMenuItem<String>>[
                  DropdownMenuItem(value: 'active', child: Text('Active')),
                  DropdownMenuItem(
                      value: 'suspended', child: Text('Suspended')),
                  DropdownMenuItem(value: 'inactive', child: Text('Inactive')),
                ],
                onChanged: loading
                    ? null
                    : (value) {
                        setState(() {
                          _accountStatus = value ?? 'active';
                        });
                      },
                decoration: const InputDecoration(labelText: 'Account status'),
              ),
              const SizedBox(height: 12),
              _ResponsivePair(
                leading: TextFormField(
                  controller: _timeInController,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: 'Time in',
                    hintText: '09:00',
                  ),
                ),
                trailing: TextFormField(
                  controller: _timeOutController,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) {
                    if (!loading) {
                      unawaited(_save());
                    }
                  },
                  decoration: const InputDecoration(
                    labelText: 'Time out',
                    hintText: '18:00',
                  ),
                ),
              ),
              const SizedBox(height: 12),
              if (widget.controller.sectionError('people-edit').isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _InlineMessage(
                    message: widget.controller.sectionError('people-edit'),
                    isError: true,
                  ),
                ),
              _ResponsivePair(
                leading: FilledButton.icon(
                  onPressed: loading ? null : _save,
                  icon: const Icon(Icons.save_rounded),
                  label: const Text('Save changes'),
                ),
                trailing: OutlinedButton(
                  onPressed: loading ? null : () => Navigator.of(context).pop(),
                  child: const Text('Cancel'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BranchActionsButton extends StatelessWidget {
  const _BranchActionsButton({
    required this.controller,
    required this.branch,
  });

  final AppController controller;
  final BranchSummary branch;

  Future<void> _handleAction(
    BuildContext context,
    _BranchDirectoryAction action,
  ) async {
    switch (action) {
      case _BranchDirectoryAction.edit:
        await showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          backgroundColor: _webDarkCard,
          builder: (context) => _BranchEditorSheet(
            controller: controller,
            branch: branch,
          ),
        );
        break;
      case _BranchDirectoryAction.toggleActive:
        await controller.updateBranch(
          branchId: branch.id,
          name: branch.name,
          address: branch.address,
          isActive: !branch.isActive,
        );
        if (!context.mounted) {
          return;
        }
        final error = controller.sectionError('branches-edit');
        if (error.isEmpty) {
          _showPageSnack(
            context,
            branch.isActive ? 'Branch deactivated.' : 'Branch activated.',
          );
        } else {
          _showPageSnack(context, error, isError: true);
        }
        break;
      case _BranchDirectoryAction.delete:
        final confirmed = await _confirmDestructiveAction(
          context,
          title: 'Delete branch?',
          body: 'This removes ${branch.name} if no users are assigned to it.',
          confirmLabel: 'Delete',
        );
        if (!confirmed || !context.mounted) {
          return;
        }
        await controller.deleteBranch(branch.id);
        if (!context.mounted) {
          return;
        }
        final error = controller.sectionError('branches-edit');
        if (error.isEmpty) {
          _showPageSnack(context, 'Branch deleted.');
        } else {
          _showPageSnack(context, error, isError: true);
        }
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<_BranchDirectoryAction>(
      tooltip: 'Branch actions',
      onSelected: (action) {
        unawaited(_handleAction(context, action));
      },
      itemBuilder: (context) => <PopupMenuEntry<_BranchDirectoryAction>>[
        const PopupMenuItem<_BranchDirectoryAction>(
          value: _BranchDirectoryAction.edit,
          child: Text('Edit branch'),
        ),
        PopupMenuItem<_BranchDirectoryAction>(
          value: _BranchDirectoryAction.toggleActive,
          child:
              Text(branch.isActive ? 'Deactivate branch' : 'Activate branch'),
        ),
        const PopupMenuItem<_BranchDirectoryAction>(
          value: _BranchDirectoryAction.delete,
          child: Text('Delete branch'),
        ),
      ],
    );
  }
}

class _BranchEditorSheet extends StatefulWidget {
  const _BranchEditorSheet({
    required this.controller,
    required this.branch,
  });

  final AppController controller;
  final BranchSummary branch;

  @override
  State<_BranchEditorSheet> createState() => _BranchEditorSheetState();
}

class _BranchEditorSheetState extends State<_BranchEditorSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _addressController;
  late bool _isActive;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.branch.name);
    _addressController = TextEditingController(text: widget.branch.address);
    _isActive = widget.branch.isActive;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      _showPageSnack(context, 'Branch name is required.', isError: true);
      return;
    }

    await widget.controller.updateBranch(
      branchId: widget.branch.id,
      name: name,
      address: _addressController.text.trim(),
      isActive: _isActive,
    );
    if (!mounted) {
      return;
    }
    final error = widget.controller.sectionError('branches-edit');
    if (error.isNotEmpty) {
      return;
    }
    _showPageSnack(context, 'Branch updated.');
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final loading = widget.controller.isSectionLoading('branches-edit');

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          20 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                'Edit branch',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                'Keep branch identity and activation state in sync for mobile admin use.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: _webMuted.withValues(alpha: 0.92),
                    ),
              ),
              const SizedBox(height: 18),
              TextFormField(
                controller: _nameController,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Branch name'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _addressController,
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) {
                  if (!loading) {
                    unawaited(_save());
                  }
                },
                decoration: const InputDecoration(labelText: 'Address'),
              ),
              const SizedBox(height: 12),
              SwitchListTile.adaptive(
                value: _isActive,
                onChanged: loading
                    ? null
                    : (value) {
                        setState(() {
                          _isActive = value;
                        });
                      },
                contentPadding: EdgeInsets.zero,
                title: const Text('Branch is active'),
                subtitle: Text(
                  _isActive
                      ? 'Users and stock can be assigned here.'
                      : 'This branch stays hidden from active operations.',
                ),
              ),
              const SizedBox(height: 12),
              if (widget.controller.sectionError('branches-edit').isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _InlineMessage(
                    message: widget.controller.sectionError('branches-edit'),
                    isError: true,
                  ),
                ),
              _ResponsivePair(
                leading: FilledButton.icon(
                  onPressed: loading ? null : _save,
                  icon: const Icon(Icons.save_rounded),
                  label: const Text('Save branch'),
                ),
                trailing: OutlinedButton(
                  onPressed: loading ? null : () => Navigator.of(context).pop(),
                  child: const Text('Cancel'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BulletinItemActionsButton extends StatelessWidget {
  const _BulletinItemActionsButton({
    required this.controller,
    required this.item,
  });

  final AppController controller;
  final BulletinItem item;

  Future<void> _handleAction(
    BuildContext context,
    _BulletinItemAction action,
  ) async {
    switch (action) {
      case _BulletinItemAction.edit:
        await showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          backgroundColor: _webDarkCard,
          builder: (context) => _BulletinItemEditorSheet(
            controller: controller,
            item: item,
          ),
        );
        break;
      case _BulletinItemAction.delete:
        final confirmed = await _confirmDestructiveAction(
          context,
          title: 'Delete calendar item?',
          body: 'This removes ${item.name} from the company bulletin calendar.',
          confirmLabel: 'Delete',
        );
        if (!confirmed || !context.mounted) {
          return;
        }
        await controller.deleteCompanyHoliday(item.id);
        if (!context.mounted) {
          return;
        }
        final error = controller.sectionError('bulletin-save');
        if (error.isEmpty) {
          _showPageSnack(context, 'Calendar item deleted.');
        } else {
          _showPageSnack(context, error, isError: true);
        }
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<_BulletinItemAction>(
      tooltip: 'Calendar item actions',
      onSelected: (action) {
        unawaited(_handleAction(context, action));
      },
      itemBuilder: (context) => const <PopupMenuEntry<_BulletinItemAction>>[
        PopupMenuItem<_BulletinItemAction>(
          value: _BulletinItemAction.edit,
          child: Text('Edit item'),
        ),
        PopupMenuItem<_BulletinItemAction>(
          value: _BulletinItemAction.delete,
          child: Text('Delete item'),
        ),
      ],
    );
  }
}

class _BulletinItemEditorSheet extends StatefulWidget {
  const _BulletinItemEditorSheet({
    required this.controller,
    required this.item,
  });

  final AppController controller;
  final BulletinItem item;

  @override
  State<_BulletinItemEditorSheet> createState() =>
      _BulletinItemEditorSheetState();
}

class _BulletinItemEditorSheetState extends State<_BulletinItemEditorSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _startController;
  late final TextEditingController _endController;
  late final TextEditingController _timeController;
  late final TextEditingController _noteController;
  late String _type;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.item.name);
    _startController = TextEditingController(text: widget.item.startDate);
    _endController = TextEditingController(
      text: widget.item.endDate.isEmpty
          ? widget.item.startDate
          : widget.item.endDate,
    );
    _timeController = TextEditingController(text: widget.item.timeLabel);
    _noteController = TextEditingController(text: widget.item.note);
    _type = widget.item.type.isEmpty ? 'regular_holiday' : widget.item.type;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _startController.dispose();
    _endController.dispose();
    _timeController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _pickDate(TextEditingController controller) async {
    final initial = _parseDate(controller.text) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2024, 1, 1),
      lastDate: DateTime(2100, 12, 31),
    );
    if (picked == null) {
      return;
    }
    controller.text = _formatDateKey(picked);
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final start = _startController.text.trim();
    final end = _endController.text.trim().isEmpty
        ? _startController.text.trim()
        : _endController.text.trim();
    if (name.isEmpty || start.isEmpty) {
      _showPageSnack(context, 'Item name and start date are required.',
          isError: true);
      return;
    }

    await widget.controller.updateCompanyHoliday(
      holidayId: widget.item.id,
      name: name,
      startDate: start,
      endDate: end,
      type: _type,
      timeLabel: _timeController.text.trim(),
      note: _noteController.text.trim(),
    );
    if (!mounted) {
      return;
    }
    final error = widget.controller.sectionError('bulletin-save');
    if (error.isNotEmpty) {
      return;
    }
    _showPageSnack(context, 'Calendar item updated.');
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final loading = widget.controller.isSectionLoading('bulletin-save');
    final typeOptions = <String>{
      'regular_holiday',
      'special_holiday',
      'company_event',
      'news_update',
    };
    final selectedType =
        typeOptions.contains(_type) ? _type : 'regular_holiday';

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          20 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                'Edit calendar item',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                'Update holiday, event, or news entries with mobile-safe controls.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: _webMuted.withValues(alpha: 0.92),
                    ),
              ),
              const SizedBox(height: 18),
              TextFormField(
                controller: _nameController,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Item name'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: selectedType,
                items: const <DropdownMenuItem<String>>[
                  DropdownMenuItem(
                      value: 'regular_holiday', child: Text('Regular Holiday')),
                  DropdownMenuItem(
                      value: 'special_holiday', child: Text('Special Holiday')),
                  DropdownMenuItem(
                      value: 'company_event', child: Text('Company Event')),
                  DropdownMenuItem(
                      value: 'news_update', child: Text('Company News')),
                ],
                onChanged: loading
                    ? null
                    : (value) {
                        setState(() {
                          _type = value ?? 'regular_holiday';
                        });
                      },
                decoration: const InputDecoration(labelText: 'Type'),
              ),
              const SizedBox(height: 12),
              _ResponsivePair(
                leading: _DateField(
                  controller: _startController,
                  label: 'Start date',
                  onTap: () => _pickDate(_startController),
                ),
                trailing: _DateField(
                  controller: _endController,
                  label: 'End date',
                  onTap: () => _pickDate(_endController),
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _timeController,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Time label'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _noteController,
                maxLines: 3,
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) {
                  if (!loading) {
                    unawaited(_save());
                  }
                },
                decoration: const InputDecoration(labelText: 'Notes'),
              ),
              const SizedBox(height: 12),
              if (widget.controller.sectionError('bulletin-save').isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _InlineMessage(
                    message: widget.controller.sectionError('bulletin-save'),
                    isError: true,
                  ),
                ),
              _ResponsivePair(
                leading: FilledButton.icon(
                  onPressed: loading ? null : _save,
                  icon: const Icon(Icons.save_rounded),
                  label: const Text('Save item'),
                ),
                trailing: OutlinedButton(
                  onPressed: loading ? null : () => Navigator.of(context).pop(),
                  child: const Text('Cancel'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WorkspacePageFrame extends StatelessWidget {
  const _WorkspacePageFrame({
    required this.title,
    required this.subtitle,
    required this.controller,
    required this.child,
  });

  final String title;
  final String subtitle;
  final AppController controller;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(0, 8, 0, 0),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1120),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const _SectionTag(
                  label: 'WORKSPACE SECTION',
                  icon: Icons.grid_view_rounded,
                ),
                const SizedBox(height: 16),
                Text(
                  title,
                  style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 6),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: _webMuted.withValues(alpha: 0.94),
                      ),
                ),
                const SizedBox(height: 16),
                if (controller.infoMessage.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _InlineMessage(message: controller.infoMessage),
                  ),
                if (controller.errorMessage.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _InlineMessage(
                      message: controller.errorMessage,
                      isError: true,
                    ),
                  ),
                child,
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HeroPanel extends StatelessWidget {
  const _HeroPanel({
    required this.title,
    required this.eyebrow,
    required this.body,
    required this.trailing,
  });

  final String title;
  final String eyebrow;
  final String body;
  final Widget trailing;

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      padding: EdgeInsets.zero,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(26),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(_radiusLg),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: <Color>[
              Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
              _webDarkCard,
              _webDarkBgAlt.withValues(alpha: 0.82),
            ],
          ),
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final stacked = constraints.maxWidth < 760;
            return stacked
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      _HeroText(eyebrow: eyebrow, title: title, body: body),
                      const SizedBox(height: 18),
                      trailing,
                    ],
                  )
                : Row(
                    children: <Widget>[
                      Expanded(
                        flex: 3,
                        child: _HeroText(
                          eyebrow: eyebrow,
                          title: title,
                          body: body,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(child: trailing),
                    ],
                  );
          },
        ),
      ),
    );
  }
}

class _HeroText extends StatelessWidget {
  const _HeroText({
    required this.eyebrow,
    required this.title,
    required this.body,
  });

  final String eyebrow;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          eyebrow,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: Theme.of(context).colorScheme.primary,
                letterSpacing: 1.6,
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 12),
        Text(
          title,
          style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                fontWeight: FontWeight.w900,
              ),
        ),
        const SizedBox(height: 10),
        Text(
          body,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: _webMuted.withValues(alpha: 0.95),
                height: 1.45,
              ),
        ),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.title,
    required this.value,
    required this.caption,
    required this.icon,
  });

  final String title;
  final String value;
  final String caption;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 220, maxWidth: 280),
      child: _GlassCard(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                color: Theme.of(context)
                    .colorScheme
                    .primary
                    .withValues(alpha: 0.14),
                border: Border.all(color: _webBorder),
              ),
              child: Icon(icon, color: Theme.of(context).colorScheme.primary),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: _webMuted.withValues(alpha: 0.92),
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              caption,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: _webMuted.withValues(alpha: 0.9),
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.title,
    required this.subtitle,
    required this.body,
    required this.leading,
    this.tone = _CardTone.neutral,
  });

  final String title;
  final String subtitle;
  final String body;
  final Widget leading;
  final _CardTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = switch (tone) {
      _CardTone.highlight => <Color>[
          Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
          _webDarkBgAlt.withValues(alpha: 0.94),
        ],
      _CardTone.warning => const <Color>[Color(0xFFFFF3E8), Color(0xFFFFFAF2)],
      _CardTone.success => const <Color>[Color(0xFFEAF7EF), Color(0xFFF8FCF8)],
      _CardTone.neutral => const <Color>[
          _glassTop,
          _glassBase,
        ],
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(_radiusLg),
        border: Border.all(color: _webBorder),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: colors,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(_radiusMd),
              border: Border.all(color: _webBorder),
            ),
            child: Center(child: leading),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: _webMuted.withValues(alpha: 0.94),
                      ),
                ),
                const SizedBox(height: 8),
                Text(
                  body,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: _webText.withValues(alpha: 0.84),
                        height: 1.35,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PersonCard extends StatelessWidget {
  const _PersonCard({
    required this.title,
    required this.subtitle,
    required this.badge,
    required this.meta,
    required this.note,
    this.trailing,
  });

  final String title;
  final String subtitle;
  final String badge;
  final List<String> meta;
  final String note;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(_radiusLg),
          border: Border.all(color: _webBorder),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: <Color>[
              _glassTop,
              _glassBase,
          ],
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: <Color>[
                  Theme.of(context).colorScheme.primary.withValues(alpha: 0.16),
                  _webDarkBgAlt,
                ],
              ),
            ),
            child: Center(
              child: Text(
                _initials(title),
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        title,
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                      ),
                    ),
                    if (badge.isNotEmpty)
                      _StatusBadge(
                        label: badge,
                        tone: _toneForBadge(badge),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: _webMuted.withValues(alpha: 0.94),
                      ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: meta
                      .where((line) => line.trim().isNotEmpty)
                      .map((line) => _MetricPill(
                          icon: Icons.fiber_manual_record_rounded, label: line))
                      .toList(),
                ),
                const SizedBox(height: 10),
                Text(
                  note,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: _webText.withValues(alpha: 0.8),
                      ),
                ),
              ],
            ),
          ),
          if (trailing != null) ...<Widget>[
            const SizedBox(width: 10),
            trailing!,
          ],
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({
    required this.label,
    this.tone = _CardTone.neutral,
  });

  final String label;
  final _CardTone tone;

  @override
  Widget build(BuildContext context) {
    final background = switch (tone) {
      _CardTone.highlight =>
        Theme.of(context).colorScheme.primary.withValues(alpha: 0.18),
      _CardTone.warning => const Color(0xFFFDE7CD),
      _CardTone.success => const Color(0xFFDFF0E2),
      _CardTone.neutral => _webDarkBgAlt.withValues(alpha: 0.92),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: _webBorder),
        borderRadius: BorderRadius.circular(999),
      ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: _webText.withValues(alpha: 0.92),
            ),
      ),
    );
  }
}

class _MetricPill extends StatelessWidget {
  const _MetricPill({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: _webDarkBgAlt.withValues(alpha: 0.92),
        border: Border.all(color: _webBorder),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 16, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: _webText.withValues(alpha: 0.88),
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({
    required this.controller,
    required this.label,
    required this.onTap,
  });

  final TextEditingController controller;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      readOnly: true,
      onTap: onTap,
      decoration: InputDecoration(
        labelText: label,
        suffixIcon: const Icon(Icons.calendar_today_rounded),
      ),
    );
  }
}

class _ResponsivePair extends StatelessWidget {
  const _ResponsivePair({
    required this.leading,
    required this.trailing,
    this.leadingFlex = 1,
  });

  final Widget leading;
  final Widget trailing;
  final int leadingFlex;

  @override
  Widget build(BuildContext context) {
    const spacing = 12.0;
    const breakpoint = 560.0;
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < breakpoint) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              leading,
              SizedBox(height: spacing),
              trailing,
            ],
          );
        }

        return Row(
          children: <Widget>[
            Expanded(flex: leadingFlex, child: leading),
            SizedBox(width: spacing),
            Expanded(child: trailing),
          ],
        );
      },
    );
  }
}

class _InlineMessage extends StatelessWidget {
  const _InlineMessage({
    required this.message,
    this.isError = false,
  });

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final icon =
        isError ? Icons.error_outline_rounded : Icons.info_outline_rounded;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isError
            ? const Color(0xFFFBE7EA)
            : _webDarkBgAlt.withValues(alpha: 0.92),
        border: Border.all(
          color: isError
              ? const Color(0xFFE7B7BF)
              : _webBorder,
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon,
              size: 18,
              color: isError ? const Color(0xFFAF4456) : _webMuted),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: isError ? const Color(0xFF7F2034) : _webText,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: _webMuted.withValues(alpha: 0.92),
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              value,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.title,
    required this.body,
  });

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Column(
        children: <Widget>[
          Icon(
            Icons.inbox_rounded,
            size: 34,
            color: _webMuted.withValues(alpha: 0.72),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            body,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: _webMuted.withValues(alpha: 0.9),
                ),
          ),
        ],
      ),
    );
  }
}

void _showPageSnack(
  BuildContext context,
  String message, {
  bool isError = false,
}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  messenger?.showSnackBar(
    SnackBar(
      content: Text(message),
      backgroundColor: isError ? const Color(0xFF7A2630) : null,
    ),
  );
}

Future<bool> _confirmDestructiveAction(
  BuildContext context, {
  required String title,
  required String body,
  String confirmLabel = 'Delete',
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(confirmLabel),
          ),
        ],
      );
    },
  );
  return result ?? false;
}

class _UserHeader extends StatelessWidget {
  const _UserHeader({required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final user = controller.user;
    final companyCode =
        controller.bootstrap?.company.companyCode.isNotEmpty == true
            ? controller.bootstrap!.company.companyCode.toUpperCase()
            : controller.branding.companyCode.toUpperCase();
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: <Color>[
                Theme.of(context).colorScheme.primary.withValues(alpha: 0.18),
                _webDarkBgAlt,
              ],
            ),
          ),
          child: Center(
            child: Text(
              _initials(user?.name ?? controller.branding.appName),
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                user?.name ?? 'Signed-in user',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 2),
              Text(
                _titleize(user?.role ?? 'employee'),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: _webMuted.withValues(alpha: 0.92),
                    ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: <Widget>[
                  if (companyCode.isNotEmpty)
                    _HeaderBadge(
                      icon: Icons.apartment_rounded,
                      label: companyCode,
                    ),
                  if ((user?.branchName ?? '').isNotEmpty)
                    _HeaderBadge(
                      icon: Icons.storefront_rounded,
                      label: user!.branchName,
                    ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _GlassCard extends StatelessWidget {
  const _GlassCard({
    this.child,
    this.padding = const EdgeInsets.all(22),
    this.maxWidth,
  });

  final Widget? child;
  final EdgeInsets padding;
  final double? maxWidth;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(_radiusLg);
    final decoration = BoxDecoration(
      borderRadius: radius,
      border: Border.all(color: _webBorder),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: <Color>[
          _glassTop,
          _glassBase,
          _glassBottom,
        ],
      ),
      boxShadow: <BoxShadow>[
        BoxShadow(
          color: const Color(0x1F214333),
          blurRadius: 24,
          offset: const Offset(0, 12),
        ),
      ],
    );
    Widget content = Container(
      decoration: decoration,
      child: ClipRRect(
        borderRadius: radius,
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: Padding(
            padding: padding,
            child: child ?? const SizedBox.shrink(),
          ),
        ),
      ),
    );
    if (maxWidth != null) {
      content = ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth!),
        child: content,
      );
    }
    return content;
  }
}

class _RailCard extends StatelessWidget {
  const _RailCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(_radiusXl);
    return Container(
      decoration: BoxDecoration(
        borderRadius: radius,
        border: Border.all(color: _webBorder),
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[
            Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
            _glassTop,
            _glassBottom,
          ],
        ),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: const Color(0x1C214333),
            blurRadius: 26,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: child,
        ),
      ),
    );
  }
}

class _SectionTag extends StatelessWidget {
  const _SectionTag({
    required this.label,
    required this.icon,
  });

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return _HeaderBadge(
      icon: icon,
      label: label,
    );
  }
}

class _HeaderBadge extends StatelessWidget {
  const _HeaderBadge({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: _webDarkBgAlt.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: _webBorder),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 16, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: _webText.withValues(alpha: 0.9),
                ),
          ),
        ],
      ),
    );
  }
}

class _AuthChip extends StatelessWidget {
  const _AuthChip({
    required this.icon,
    required this.label,
    this.soft = false,
  });

  final IconData icon;
  final String label;
  final bool soft;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: soft
            ? _webDarkCard.withValues(alpha: 0.86)
            : _webDarkBgAlt.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: _webBorder),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(
            icon,
            size: 16,
            color: soft
                ? _webMuted.withValues(alpha: 0.88)
                : Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: soft
                      ? _webMuted.withValues(alpha: 0.92)
                      : _webText.withValues(alpha: 0.92),
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.4,
                ),
          ),
        ],
      ),
    );
  }
}

class _AuthLockup extends StatelessWidget {
  const _AuthLockup({
    required this.controller,
    required this.kicker,
    required this.title,
    required this.subtitle,
    required this.hint,
  });

  final AppController controller;
  final String kicker;
  final String title;
  final String subtitle;
  final String hint;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        Align(
          alignment: Alignment.center,
          child: _BrandMark(
            controller: controller,
            size: 84,
            radius: 42,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          kicker,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: Theme.of(context).colorScheme.primary,
                letterSpacing: 1.15,
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 8),
        Text(
          title,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                fontWeight: FontWeight.w900,
              ),
        ),
        const SizedBox(height: 8),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: _webMuted.withValues(alpha: 0.94),
              ),
        ),
        const SizedBox(height: 10),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _webBorder),
            color: _webDarkBgAlt.withValues(alpha: 0.94),
          ),
          child: Text(
            hint,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: _webMuted.withValues(alpha: 0.92),
                  height: 1.45,
                ),
          ),
        ),
      ],
    );
  }
}

class _AuthShowcaseCard extends StatelessWidget {
  const _AuthShowcaseCard({
    required this.icon,
    required this.title,
    required this.body,
    this.highlighted = false,
  });

  final IconData icon;
  final String title;
  final String body;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return _AuthSurfaceCard(
      highlighted: highlighted,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color:
                  Theme.of(context).colorScheme.primary.withValues(alpha: 0.14),
              border: Border.all(color: _webBorder),
            ),
            child: Icon(icon, color: Theme.of(context).colorScheme.primary),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            body,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: _webMuted.withValues(alpha: 0.94),
                ),
          ),
        ],
      ),
    );
  }
}

class _AuthSurfaceCard extends StatelessWidget {
  const _AuthSurfaceCard({
    required this.child,
    this.highlighted = false,
  });

  final Widget child;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(_radiusLg);
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: radius,
        border: Border.all(color: _webBorder),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: highlighted
              ? <Color>[
                  Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
                  _webDarkBgAlt.withValues(alpha: 0.96),
                ]
              : const <Color>[
                  _glassTop,
                  _glassBase,
                ],
        ),
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: child,
          ),
        ),
      ),
    );
  }
}

class _AuthDivider extends StatelessWidget {
  const _AuthDivider({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final color = _webBorder;
    return Row(
      children: <Widget>[
        Expanded(child: Divider(color: color, height: 1)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Text(
            label.toUpperCase(),
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: _webMuted.withValues(alpha: 0.86),
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.0,
                ),
          ),
        ),
        Expanded(child: Divider(color: color, height: 1)),
      ],
    );
  }
}

class _AuthSectionHeading extends StatelessWidget {
  const _AuthSectionHeading({
    required this.kicker,
    required this.title,
    required this.badge,
  });

  final String kicker;
  final String title;
  final String badge;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final stacked = constraints.maxWidth < 320;
        final copy = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              kicker,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: Theme.of(context).colorScheme.primary,
                    letterSpacing: 1.0,
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              title,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
          ],
        );

        if (stacked) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              copy,
              const SizedBox(height: 10),
              _HeaderBadge(icon: Icons.bolt_rounded, label: badge),
            ],
          );
        }

        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Expanded(child: copy),
            const SizedBox(width: 12),
            _HeaderBadge(icon: Icons.bolt_rounded, label: badge),
          ],
        );
      },
    );
  }
}

class _AuthFeatureItem extends StatelessWidget {
  const _AuthFeatureItem({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            color: _webDarkBgAlt.withValues(alpha: 0.94),
            border: Border.all(color: _webBorder),
          ),
          child: Icon(icon, color: Theme.of(context).colorScheme.primary),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                title,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                body,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: _webMuted.withValues(alpha: 0.94),
                    ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _RailBrandHeader extends StatelessWidget {
  const _RailBrandHeader({
    required this.controller,
    required this.extended,
  });

  final AppController controller;
  final bool extended;

  @override
  Widget build(BuildContext context) {
    final user = controller.user;
    if (!extended) {
      return Column(
        children: <Widget>[
          _BrandMark(
            controller: controller,
            size: 58,
            radius: 20,
            showGlow: false,
          ),
          const SizedBox(height: 14),
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: _webDarkCard.withValues(alpha: 0.98),
              border: Border.all(color: _webBorder),
            ),
            child: Center(
              child: Text(
                _initials(user?.name ?? controller.branding.appName),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _BrandMark(
          controller: controller,
          size: 70,
          radius: 24,
        ),
        const SizedBox(height: 18),
        Text(
          controller.branding.appName,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 4),
        Text(
          controller.branding.companyName.isEmpty
              ? 'Operations workspace'
              : controller.branding.companyName,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: _webMuted.withValues(alpha: 0.92),
              ),
        ),
        const SizedBox(height: 16),
        _HeaderBadge(
          icon: Icons.badge_rounded,
          label: _titleize(user?.role ?? 'employee'),
        ),
      ],
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark({
    required this.controller,
    this.size = 80,
    this.radius = 24,
    this.showGlow = true,
  });

  final AppController controller;
  final double size;
  final double radius;
  final bool showGlow;

  @override
  Widget build(BuildContext context) {
    final logoPath = controller.branding.logoPath.isNotEmpty
        ? controller.branding.logoPath
        : (controller.bootstrap?.company.logoPath ?? '');
    final imageUrl = _resolveMediaUrl(logoPath, controller.apiBaseUrl);
    final fallback = _BrandMonogram(
      label: controller.branding.appName,
      radius: radius,
    );
    final image = imageUrl != null
        ? Image.network(
            imageUrl,
            fit: BoxFit.contain,
            errorBuilder: (context, error, stackTrace) {
              return Image.asset(
                _defaultBrandAsset,
                fit: BoxFit.contain,
                errorBuilder: (context, error, stackTrace) => fallback,
              );
            },
          )
        : Image.asset(
            _defaultBrandAsset,
            fit: BoxFit.contain,
            errorBuilder: (context, error, stackTrace) => fallback,
          );

    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.13),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: _webBorder),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[
            Color(0xFFF4E7D1),
            Color(0xFFD7B577),
          ],
        ),
        boxShadow: showGlow
            ? <BoxShadow>[
                BoxShadow(
                  color: Theme.of(context)
                      .colorScheme
                      .primary
                      .withValues(alpha: 0.22),
                  blurRadius: 24,
                  offset: const Offset(0, 14),
                ),
              ]
            : null,
      ),
      child: image,
    );
  }
}

class _BrandMonogram extends StatelessWidget {
  const _BrandMonogram({
    required this.label,
    required this.radius,
  });

  final String label;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius * 0.75),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[
            Theme.of(context).colorScheme.primary.withValues(alpha: 0.2),
            _webDarkBgAlt.withValues(alpha: 0.92),
          ],
        ),
      ),
      child: Center(
        child: Text(
          _initials(label),
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                color: _webDarkBg,
                fontWeight: FontWeight.w900,
              ),
        ),
      ),
    );
  }
}

class _LiveClockCard extends StatefulWidget {
  const _LiveClockCard();

  @override
  State<_LiveClockCard> createState() => _LiveClockCardState();
}

class _LiveClockCardState extends State<_LiveClockCard> {
  late Timer _timer;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() {
          _now = DateTime.now();
        });
      }
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hour24 = _now.hour;
    final suffix = hour24 >= 12 ? 'PM' : 'AM';
    final hour = hour24 == 0 ? 12 : (hour24 > 12 ? hour24 - 12 : hour24);
    final minute = _now.minute.toString().padLeft(2, '0');
    final second = _now.second.toString().padLeft(2, '0');
    final month = _monthLabel(_now.month);
    return _InfoCard(
      title: '$hour:$minute:$second $suffix',
      subtitle: '$month ${_now.day}, ${_now.year}',
      body: 'Large live clock designed for quick check-ins on smaller screens.',
      leading: const Icon(Icons.watch_later_rounded),
    );
  }
}

class _AmbientBackground extends StatelessWidget {
  const _AmbientBackground({required this.seedColor});

  final Color seedColor;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        children: <Widget>[
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(-0.9, -0.95),
                  radius: 1.05,
                  colors: <Color>[
                    _blendColors(seedColor, _webGold, 0.34)
                        .withValues(alpha: 0.16),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            top: -110,
            left: -80,
            child: Container(
              width: 280,
              height: 280,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: <Color>[
                    _blendColors(seedColor, _webGold, 0.45)
                        .withValues(alpha: 0.12),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            right: -30,
            top: 90,
            child: Transform.rotate(
              angle: 0.3,
              child: Container(
                width: 220,
                height: 220,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(54),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: <Color>[
                      _webDarkCard.withValues(alpha: 0.22),
                      _blendColors(seedColor, _webClay, 0.5)
                          .withValues(alpha: 0.08),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            right: 40,
            bottom: -110,
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: <Color>[
                    _webClay.withValues(alpha: 0.08),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LoginAmbientBackground extends StatelessWidget {
  const _LoginAmbientBackground({required this.palette});

  final _LoginPalette palette;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        children: <Widget>[
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(-0.76, -0.64),
                  radius: 0.82,
                  colors: <Color>[
                    palette.bright.withValues(alpha: 0.22),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0.82, -1),
                  radius: 0.76,
                  colors: <Color>[
                    palette.sun.withValues(alpha: 0.16),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: <Color>[
                    _webDarkCard.withValues(alpha: 0.68),
                    _webDarkBg.withValues(alpha: 0.92),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BrandBackgroundImage extends StatelessWidget {
  const _BrandBackgroundImage({required this.imageUrl});

  final String imageUrl;

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          Image.network(
            imageUrl,
            fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) {
              return const SizedBox.shrink();
            },
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: <Color>[
                  _webDarkBg.withValues(alpha: 0.86),
                  _webDarkBgAlt.withValues(alpha: 0.72),
                  _webDarkCard.withValues(alpha: 0.8),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WorkspaceTab {
  const _WorkspaceTab({
    required this.id,
    required this.label,
    required this.icon,
    required this.builder,
    this.activeIcon,
  });

  final String id;
  final String label;
  final IconData icon;
  final IconData? activeIcon;
  final Widget Function(BuildContext, AppController) builder;
}

class _MobileTabDock extends StatelessWidget {
  const _MobileTabDock({
    required this.controller,
    required this.tabs,
    required this.currentIndex,
  });

  final AppController controller;
  final List<_WorkspaceTab> tabs;
  final int currentIndex;

  Future<void> _openSectionSheet(BuildContext context) async {
    final selectedTab = tabs[currentIndex];
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: _webDarkCard,
      showDragHandle: true,
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Sections',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Open another workspace section without squeezing every tab into the phone footer.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: _webMuted.withValues(alpha: 0.92),
                      ),
                ),
                const SizedBox(height: 12),
                ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(context).height * 0.5,
                  ),
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: tabs.length,
                    separatorBuilder: (_, __) =>
                        Divider(color: _webBorder, height: 1),
                    itemBuilder: (context, index) {
                      final tab = tabs[index];
                      final selected = index == currentIndex;
                      return ListTile(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(18),
                        ),
                        tileColor: selected
                            ? Theme.of(context)
                                .colorScheme
                                .primary
                                .withValues(alpha: 0.1)
                            : Colors.transparent,
                        leading: Icon(
                          selected ? (tab.activeIcon ?? tab.icon) : tab.icon,
                          color: selected
                              ? Theme.of(context).colorScheme.primary
                              : _webMuted.withValues(alpha: 0.9),
                        ),
                        title: Text(
                          tab.label,
                          style:
                              Theme.of(context).textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                        ),
                        subtitle: selected
                            ? Text(
                                'Current section',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                      color: _webMuted.withValues(alpha: 0.9),
                                    ),
                              )
                            : null,
                        onTap: () {
                          Navigator.of(context).pop();
                          if (!selected) {
                            unawaited(controller.selectTab(tab.id));
                          }
                        },
                      );
                    },
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.check_rounded),
                    label: Text('Stay on ${selectedTab.label}'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final tab = tabs[currentIndex];
    return _GlassCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: <Widget>[
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
              border: Border.all(color: _webBorder),
            ),
            child: Icon(
              tab.activeIcon ?? tab.icon,
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  'Current Section',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: _webMuted.withValues(alpha: 0.9),
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.6,
                      ),
                ),
                const SizedBox(height: 3),
                Text(
                  tab.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          FilledButton.icon(
            onPressed: () {
              unawaited(_openSectionSheet(context));
            },
            icon: const Icon(Icons.widgets_rounded),
            label: const Text('Sections'),
          ),
        ],
      ),
    );
  }
}

enum _CardTone {
  neutral,
  highlight,
  warning,
  success,
}

_CardTone _toneForBadge(String value) {
  final normalized = value.toLowerCase();
  if (normalized.contains('late') ||
      normalized.contains('absent') ||
      normalized.contains('inactive') ||
      normalized.contains('suspended') ||
      normalized.contains('low')) {
    return _CardTone.warning;
  }
  if (normalized.contains('healthy') ||
      normalized.contains('on time') ||
      normalized.contains('verified') ||
      normalized.contains('present')) {
    return _CardTone.success;
  }
  return _CardTone.neutral;
}

String _attendanceSummary(AttendanceRecord record) {
  final parts = <String>[
    'Time in ${record.timeIn.isEmpty ? '--:--' : record.timeIn}',
    'Time out ${record.timeOut.isEmpty ? '--:--' : record.timeOut}',
    'Worked ${record.workedHours}',
  ];
  if (record.displayRemarks.isNotEmpty) {
    parts.add(record.displayRemarks);
  }
  return parts.join(' - ');
}

String _authBrandingHint(Branding branding, {bool fallbackLogin = false}) {
  if (branding.companyName.isNotEmpty &&
      branding.whiteLabel &&
      branding.backgroundImagePath.isNotEmpty) {
    return 'Custom login background, logo, and company color are loaded from Company Profile.';
  }
  if (branding.companyName.isNotEmpty && branding.whiteLabel) {
    return 'Custom company color and logo are loaded live while you type the Company ID.';
  }
  if (branding.companyName.isNotEmpty) {
    return 'Company found. The app is using the company-aware theme for this workspace.';
  }
  if (branding.companyCode.isNotEmpty) {
    return 'Checking the company theme for ${branding.companyCode.toUpperCase()}...';
  }
  if (fallbackLogin) {
    return 'Enter the Company ID first so the correct company theme loads before login.';
  }
  return 'Type your company ID to preview your company theme.';
}

String _titleize(String value) {
  final normalized = value.trim();
  if (normalized.isEmpty) {
    return '-';
  }
  return normalized.split(RegExp(r'[_\s]+')).map((part) {
    if (part.isEmpty) {
      return part;
    }
    return '${part[0].toUpperCase()}${part.substring(1).toLowerCase()}';
  }).join(' ');
}

class _LoginPalette {
  const _LoginPalette({
    required this.primary,
    required this.bright,
    required this.accent,
    required this.sun,
    required this.lead,
    required this.dusk,
    required this.deep,
  });

  final Color primary;
  final Color bright;
  final Color accent;
  final Color sun;
  final Color lead;
  final Color dusk;
  final Color deep;
}

Color _loginPrimaryColor(AppController controller) {
  final branding = controller.branding;
  final primary = _parseHexColor(branding.primaryColorHex);
  if (branding.companyName.isEmpty && !branding.whiteLabel) {
    return _loginPrimary;
  }
  return primary;
}

_LoginPalette _buildLoginPalette(Color primary) {
  if (primary == _loginPrimary) {
    return const _LoginPalette(
      primary: _loginPrimary,
      bright: _loginTeal,
      accent: _loginAccent,
      sun: _loginGreen,
      lead: Color(0xFFF7F5ED),
      dusk: Color(0xFFEDF7F1),
      deep: Color(0xFFE3F1E7),
    );
  }

  final bright = _blendColors(primary, Colors.white, 0.28);
  final accent = _blendColors(primary, _loginAccent, 0.32);
  final sun = _blendColors(primary, _loginSun, 0.34);
  return _LoginPalette(
    primary: primary,
    bright: bright,
    accent: accent,
    sun: sun,
    lead: _blendColors(primary, const Color(0xFFF8F4EC), 0.72),
    dusk: _blendColors(primary, const Color(0xFFEEF7F0), 0.78),
    deep: _blendColors(primary, const Color(0xFFE6F1E9), 0.82),
  );
}

String? _resolveMediaUrl(String path, String baseUrl) {
  final trimmed = path.trim();
  if (trimmed.isEmpty) {
    return null;
  }
  final parsed = Uri.tryParse(trimmed);
  if (parsed != null && parsed.hasScheme) {
    return parsed.toString();
  }
  final base = Uri.tryParse(baseUrl);
  if (base == null) {
    return null;
  }
  return base.resolve(trimmed).toString();
}

Uri _buildPublicPortalUri(AppController controller, String intent) {
  final normalizedIntent = intent.trim().toLowerCase();
  final query = <String, String>{'intent': normalizedIntent};
  final companyCode = controller.companyCode.trim();
  if (companyCode.isNotEmpty && normalizedIntent != 'register_company_id') {
    query['companyCode'] = companyCode;
  }
  return _buildPublicUri(
    controller.apiBaseUrl,
    '/renderer/customer_portal.html',
    queryParameters: query,
  );
}

Uri _buildPublicUri(
  String baseUrl,
  String path, {
  Map<String, String>? queryParameters,
}) {
  final target = Uri(
    path: path,
    queryParameters:
        queryParameters == null || queryParameters.isEmpty ? null : queryParameters,
  );
  final base = Uri.tryParse(baseUrl);
  if (base == null || !base.hasScheme) {
    return target;
  }
  return base.resolveUri(target);
}

String _initials(String value) {
  final parts = value
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();
  if (parts.isEmpty) {
    return 'G';
  }
  if (parts.length == 1) {
    return parts.first.substring(0, 1).toUpperCase();
  }
  return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
      .toUpperCase();
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

String _formatQuantity(double value) {
  final rounded =
      value % 1 == 0 ? value.toInt().toString() : value.toStringAsFixed(2);
  return rounded;
}

String _formatDateKey(DateTime value) {
  final month = value.month.toString().padLeft(2, '0');
  final day = value.day.toString().padLeft(2, '0');
  return '${value.year}-$month-$day';
}

DateTime? _parseDate(String value) {
  final trimmed = value.trim();
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(trimmed)) {
    return null;
  }
  return DateTime.tryParse('${trimmed}T00:00:00');
}

Color _warmBrandColor(Color seed) {
  final hsl = HSLColor.fromColor(seed);
  if (hsl.saturation < 0.08) {
    return _webGold;
  }
  return _shiftLightness(seed, 0.04);
}

Color _blendColors(Color start, Color end, double amount) {
  final t = amount.clamp(0.0, 1.0).toDouble();
  return Color.lerp(start, end, t) ?? start;
}

Color _parseHexColor(String hex) {
  final raw = hex.replaceAll('#', '').trim();
  final normalized = switch (raw.length) {
    6 => 'FF$raw',
    8 => raw,
    _ => 'FFC79D5A',
  };
  final value = int.tryParse(normalized, radix: 16) ?? 0xFFC79D5A;
  return Color(value);
}

Color _shiftLightness(Color color, double delta) {
  final hsl = HSLColor.fromColor(color);
  final lightness = (hsl.lightness + delta).clamp(0.0, 1.0).toDouble();
  final next = hsl.withLightness(lightness);
  return next.toColor();
}
