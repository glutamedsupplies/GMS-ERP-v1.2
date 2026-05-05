String jsonString(dynamic value) {
  if (value == null) {
    return '';
  }
  return value.toString().trim();
}

String jsonStringAny(Map<String, dynamic> json, List<String> keys) {
  for (final key in keys) {
    final value = jsonString(json[key]);
    if (value.isNotEmpty) {
      return value;
    }
  }
  return '';
}

bool jsonBool(dynamic value) {
  if (value is bool) {
    return value;
  }
  if (value is num) {
    return value != 0;
  }
  final normalized = jsonString(value).toLowerCase();
  return normalized == 'true' || normalized == '1' || normalized == 'yes';
}

bool jsonBoolAny(Map<String, dynamic> json, List<String> keys) {
  for (final key in keys) {
    if (json.containsKey(key)) {
      return jsonBool(json[key]);
    }
  }
  return false;
}

int jsonInt(dynamic value) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  return int.tryParse(jsonString(value)) ?? 0;
}

double jsonDouble(dynamic value) {
  if (value is double) {
    return value;
  }
  if (value is num) {
    return value.toDouble();
  }
  return double.tryParse(jsonString(value)) ?? 0;
}

Map<String, dynamic> jsonMap(dynamic value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map) {
    return value.map(
      (key, mapValue) => MapEntry(key.toString(), mapValue),
    );
  }
  return <String, dynamic>{};
}

List<Map<String, dynamic>> jsonMapList(dynamic value) {
  if (value is List) {
    return value.map((item) => jsonMap(item)).toList();
  }
  return const <Map<String, dynamic>>[];
}

Map<String, bool> jsonBoolMap(dynamic value) {
  final source = jsonMap(value);
  return source.map((key, mapValue) => MapEntry(key, jsonBool(mapValue)));
}

class Branding {
  const Branding({
    this.appName = 'GMS ERP',
    this.companyName = '',
    this.companyCode = '',
    this.primaryColorHex = '#C79D5A',
    this.subtitle = '',
    this.logoPath = '',
    this.backgroundImagePath = '',
    this.faviconPath = '',
    this.whiteLabel = false,
  });

  final String appName;
  final String companyName;
  final String companyCode;
  final String primaryColorHex;
  final String subtitle;
  final String logoPath;
  final String backgroundImagePath;
  final String faviconPath;
  final bool whiteLabel;

  factory Branding.fromJson(Map<String, dynamic> json) {
    final appName = jsonStringAny(json, <String>['appName', 'app_name']);
    final primaryColor =
        jsonStringAny(json, <String>['primaryColor', 'primary_color']);
    return Branding(
      appName: appName.isEmpty ? 'GMS ERP' : appName,
      companyName:
          jsonStringAny(json, <String>['companyName', 'company_name']),
      companyCode:
          jsonStringAny(json, <String>['companyCode', 'company_code']),
      primaryColorHex: primaryColor.isEmpty ? '#C79D5A' : primaryColor,
      subtitle: jsonString(json['subtitle']),
      logoPath: jsonStringAny(json, <String>['logoPath', 'logo_path']),
      backgroundImagePath: jsonStringAny(
        json,
        <String>[
          'backgroundImagePath',
          'background_image_path',
          'loginBackgroundPath',
          'login_background_path',
        ],
      ),
      faviconPath:
          jsonStringAny(json, <String>['faviconPath', 'favicon_path']),
      whiteLabel: jsonBoolAny(json, <String>['whiteLabel', 'white_label']),
    );
  }

  Branding copyWith({
    String? appName,
    String? companyName,
    String? companyCode,
    String? primaryColorHex,
    String? subtitle,
    String? logoPath,
    String? backgroundImagePath,
    String? faviconPath,
    bool? whiteLabel,
  }) {
    return Branding(
      appName: appName ?? this.appName,
      companyName: companyName ?? this.companyName,
      companyCode: companyCode ?? this.companyCode,
      primaryColorHex: primaryColorHex ?? this.primaryColorHex,
      subtitle: subtitle ?? this.subtitle,
      logoPath: logoPath ?? this.logoPath,
      backgroundImagePath: backgroundImagePath ?? this.backgroundImagePath,
      faviconPath: faviconPath ?? this.faviconPath,
      whiteLabel: whiteLabel ?? this.whiteLabel,
    );
  }
}

class SessionUser {
  const SessionUser({
    this.id = '',
    this.name = '',
    this.role = '',
    this.companyId = '',
    this.companyCode = '',
    this.branchId = '',
    this.branchName = '',
    this.profilePicture = '',
    this.featureAccess = const <String, bool>{},
    this.timeZone = '',
    this.accountStatus = '',
    this.timeIn = '',
    this.timeOut = '',
  });

  final String id;
  final String name;
  final String role;
  final String companyId;
  final String companyCode;
  final String branchId;
  final String branchName;
  final String profilePicture;
  final Map<String, bool> featureAccess;
  final String timeZone;
  final String accountStatus;
  final String timeIn;
  final String timeOut;

  factory SessionUser.fromJson(Map<String, dynamic> json) {
    return SessionUser(
      id: jsonString(json['id']),
      name: jsonString(json['name']),
      role: jsonString(json['role']).toLowerCase(),
      companyId: jsonString(json['company_id']),
      companyCode: jsonString(json['company_code']),
      branchId: jsonString(json['branch_id']),
      branchName: jsonString(json['branch_name']),
      profilePicture: jsonString(json['profile_picture']),
      featureAccess: jsonBoolMap(json['feature_access']),
      timeZone: jsonString(json['time_zone']),
      accountStatus: jsonString(json['account_status']),
      timeIn: jsonString(json['time_in']),
      timeOut: jsonString(json['time_out']),
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'id': id,
      'name': name,
      'role': role,
      'company_id': companyId,
      'company_code': companyCode,
      'branch_id': branchId,
      'branch_name': branchName,
      'profile_picture': profilePicture,
      'feature_access': featureAccess,
      'time_zone': timeZone,
      'account_status': accountStatus,
      'time_in': timeIn,
      'time_out': timeOut,
    };
  }

  bool get isHeadAdminLike => role == 'head_admin' || role == 'company_admin';
}

class CompanySummary {
  const CompanySummary({
    this.id = '',
    this.name = '',
    this.companyCode = '',
    this.primaryColorHex = '#C79D5A',
    this.appName = '',
    this.logoPath = '',
  });

  final String id;
  final String name;
  final String companyCode;
  final String primaryColorHex;
  final String appName;
  final String logoPath;

  factory CompanySummary.fromJson(Map<String, dynamic> json) {
    return CompanySummary(
      id: jsonString(json['id']),
      name: jsonString(json['name']),
      companyCode: jsonString(json['company_code']),
      primaryColorHex: jsonString(json['primary_color']).isEmpty
          ? '#C79D5A'
          : jsonString(json['primary_color']),
      appName: jsonString(json['app_name']),
      logoPath: jsonString(json['logo_path']),
    );
  }
}

class BranchSummary {
  const BranchSummary({
    this.id = '',
    this.name = '',
    this.address = '',
    this.isActive = true,
  });

  final String id;
  final String name;
  final String address;
  final bool isActive;

  factory BranchSummary.fromJson(Map<String, dynamic> json) {
    return BranchSummary(
      id: jsonString(json['id']),
      name: jsonString(json['branch_name']).isEmpty
          ? jsonString(json['name'])
          : jsonString(json['branch_name']),
      address: jsonString(json['address']),
      isActive: !json.containsKey('is_active') || jsonBool(json['is_active']),
    );
  }
}

class BulletinAnnouncement {
  const BulletinAnnouncement({
    this.title = '',
    this.message = '',
    this.startsOn = '',
    this.endsOn = '',
    this.updatedAt = '',
    this.updatedBy = '',
    this.windowLabel = '',
    this.hasContent = false,
    this.isActive = false,
  });

  final String title;
  final String message;
  final String startsOn;
  final String endsOn;
  final String updatedAt;
  final String updatedBy;
  final String windowLabel;
  final bool hasContent;
  final bool isActive;

  factory BulletinAnnouncement.fromJson(Map<String, dynamic> json) {
    return BulletinAnnouncement(
      title: jsonString(json['title']),
      message: jsonString(json['message']),
      startsOn: jsonString(json['starts_on']),
      endsOn: jsonString(json['ends_on']),
      updatedAt: jsonString(json['updated_at']),
      updatedBy: jsonString(json['updated_by']),
      windowLabel: jsonString(json['window_label']),
      hasContent: jsonBool(json['has_content']) ||
          jsonString(json['message']).isNotEmpty,
      isActive: jsonBool(json['is_active']),
    );
  }
}

class BulletinItem {
  const BulletinItem({
    this.id = '',
    this.name = '',
    this.type = '',
    this.startDate = '',
    this.endDate = '',
    this.timeLabel = '',
    this.note = '',
  });

  final String id;
  final String name;
  final String type;
  final String startDate;
  final String endDate;
  final String timeLabel;
  final String note;

  factory BulletinItem.fromJson(Map<String, dynamic> json) {
    return BulletinItem(
      id: jsonString(json['id']),
      name: jsonString(json['name']),
      type: jsonString(json['type']),
      startDate: jsonString(json['start_date']).isEmpty
          ? jsonString(json['date'])
          : jsonString(json['start_date']),
      endDate: jsonString(json['end_date']).isEmpty
          ? jsonString(json['date'])
          : jsonString(json['end_date']),
      timeLabel: jsonString(json['time_label']),
      note: jsonString(json['note']),
    );
  }
}

class BulletinFeed {
  const BulletinFeed({
    this.announcement = const BulletinAnnouncement(),
    this.activeAnnouncement,
    this.items = const <BulletinItem>[],
    this.notificationItems = const <BulletinItem>[],
    this.todayKey = '',
  });

  final BulletinAnnouncement announcement;
  final BulletinAnnouncement? activeAnnouncement;
  final List<BulletinItem> items;
  final List<BulletinItem> notificationItems;
  final String todayKey;

  factory BulletinFeed.fromJson(Map<String, dynamic> json) {
    final announcementJson = jsonMap(json['announcement']);
    final activeAnnouncementJson = jsonMap(json['activeAnnouncement']);
    final itemSource = json['upcomingItems'] ?? json['calendarItems'] ?? json['holidays'];
    return BulletinFeed(
      announcement: BulletinAnnouncement.fromJson(announcementJson),
      activeAnnouncement: activeAnnouncementJson.isEmpty
          ? null
          : BulletinAnnouncement.fromJson(activeAnnouncementJson),
      items: jsonMapList(itemSource).map(BulletinItem.fromJson).toList(),
      notificationItems: jsonMapList(json['notificationItems'])
          .map(BulletinItem.fromJson)
          .toList(),
      todayKey: jsonString(json['todayKey']),
    );
  }
}

class BootstrapPayload {
  const BootstrapPayload({
    this.user,
    this.role = '',
    this.superAdmin = false,
    this.branding = const Branding(),
    this.company = const CompanySummary(),
    this.modules = const <String, bool>{},
    this.branches = const <BranchSummary>[],
    this.workspaceConfig = const <String, dynamic>{},
    this.companyBulletin = const BulletinFeed(),
    this.usage = const <String, dynamic>{},
    this.limits = const <String, dynamic>{},
  });

  final SessionUser? user;
  final String role;
  final bool superAdmin;
  final Branding branding;
  final CompanySummary company;
  final Map<String, bool> modules;
  final List<BranchSummary> branches;
  final Map<String, dynamic> workspaceConfig;
  final BulletinFeed companyBulletin;
  final Map<String, dynamic> usage;
  final Map<String, dynamic> limits;

  factory BootstrapPayload.fromJson(Map<String, dynamic> json) {
    return BootstrapPayload(
      user: jsonMap(json['user']).isEmpty
          ? null
          : SessionUser.fromJson(jsonMap(json['user'])),
      role: jsonString(json['role']),
      superAdmin: jsonBool(json['superAdmin']),
      branding: Branding.fromJson(jsonMap(json['branding'])),
      company: CompanySummary.fromJson(jsonMap(json['company'])),
      modules: jsonBoolMap(json['modules']),
      branches: jsonMapList(json['branches']).map(BranchSummary.fromJson).toList(),
      workspaceConfig: jsonMap(json['workspaceConfig']),
      companyBulletin: BulletinFeed.fromJson(jsonMap(json['companyBulletin'])),
      usage: jsonMap(json['usage']),
      limits: jsonMap(json['limits']),
    );
  }

  List<String> get enabledModules {
    return modules.entries
        .where((entry) => entry.value)
        .map((entry) => entry.key)
        .toList();
  }
}

class AttendanceRecord {
  const AttendanceRecord({
    this.id = '',
    this.name = '',
    this.dateKey = '',
    this.displayDate = '',
    this.dayLabel = '',
    this.timeIn = '',
    this.timeOut = '',
    this.workedHours = '0.00',
    this.status = '',
    this.statusGroup = '',
    this.remarks = '',
    this.displayRemarks = '',
    this.scheduledTimeIn = '',
    this.scheduledTimeOut = '',
    this.lateMinutes = 0,
    this.avatarUrl = '',
    this.branchId = '',
    this.isHoliday = false,
    this.isDayOff = false,
    this.canEditStatus = false,
  });

  final String id;
  final String name;
  final String dateKey;
  final String displayDate;
  final String dayLabel;
  final String timeIn;
  final String timeOut;
  final String workedHours;
  final String status;
  final String statusGroup;
  final String remarks;
  final String displayRemarks;
  final String scheduledTimeIn;
  final String scheduledTimeOut;
  final int lateMinutes;
  final String avatarUrl;
  final String branchId;
  final bool isHoliday;
  final bool isDayOff;
  final bool canEditStatus;

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    return AttendanceRecord(
      id: jsonString(json['id']),
      name: jsonString(json['name']),
      dateKey: jsonString(json['dateKey']).isEmpty
          ? jsonString(json['date'])
          : jsonString(json['dateKey']),
      displayDate: jsonString(json['displayDate']),
      dayLabel: jsonString(json['dayLabel']),
      timeIn: jsonString(json['timeIn']),
      timeOut: jsonString(json['timeOut']),
      workedHours: jsonString(json['workedHours']).isEmpty
          ? '0.00'
          : jsonString(json['workedHours']),
      status: jsonString(json['status']),
      statusGroup: jsonString(json['statusGroup']),
      remarks: jsonString(json['remarksRaw']),
      displayRemarks: jsonString(json['displayRemarks']),
      scheduledTimeIn: jsonString(json['scheduledTimeIn']),
      scheduledTimeOut: jsonString(json['scheduledTimeOut']),
      lateMinutes: jsonInt(json['lateMinutes']),
      avatarUrl: jsonString(json['avatarUrl']),
      branchId: jsonString(json['branch_id']),
      isHoliday: jsonBool(json['isHoliday']),
      isDayOff: jsonBool(json['isDayOff']),
      canEditStatus: jsonBool(json['canEditStatus']),
    );
  }
}

class AttendanceActionResult {
  const AttendanceActionResult({
    this.user,
    this.time = '',
    this.status = '',
    this.workedHours = '',
    this.record,
  });

  final SessionUser? user;
  final String time;
  final String status;
  final String workedHours;
  final AttendanceRecord? record;

  factory AttendanceActionResult.fromJson(Map<String, dynamic> json) {
    return AttendanceActionResult(
      user: jsonMap(json['user']).isEmpty
          ? null
          : SessionUser.fromJson(jsonMap(json['user'])),
      time: jsonString(json['time']),
      status: jsonString(json['status']),
      workedHours: jsonString(json['workedHours']),
      record: jsonMap(json['record']).isEmpty
          ? null
          : AttendanceRecord.fromJson(jsonMap(json['record'])),
    );
  }
}

class InventoryItem {
  const InventoryItem({
    this.inventoryId = '',
    this.itemName = '',
    this.itemCode = '',
    this.inventoryUnit = '',
    this.itemType = '',
    this.branch = '',
    this.quantity = 0,
    this.updatedAt = '',
  });

  final String inventoryId;
  final String itemName;
  final String itemCode;
  final String inventoryUnit;
  final String itemType;
  final String branch;
  final double quantity;
  final String updatedAt;

  factory InventoryItem.fromJson(Map<String, dynamic> json) {
    return InventoryItem(
      inventoryId: jsonString(json['inventory_id']),
      itemName: jsonString(json['item_name']),
      itemCode: jsonString(json['item_code']),
      inventoryUnit: jsonString(json['inventory_unit']),
      itemType: jsonString(json['item_type']),
      branch: jsonString(json['branch']),
      quantity: jsonDouble(json['quantity']),
      updatedAt: jsonString(json['updated_at']),
    );
  }
}

class CompanySettings {
  const CompanySettings({
    this.id = '',
    this.name = '',
    this.companyCode = '',
    this.primaryColorHex = '#C79D5A',
    this.appName = '',
    this.address = '',
    this.contact = '',
    this.logoPath = '',
    this.loginBackgroundPath = '',
  });

  final String id;
  final String name;
  final String companyCode;
  final String primaryColorHex;
  final String appName;
  final String address;
  final String contact;
  final String logoPath;
  final String loginBackgroundPath;

  factory CompanySettings.fromJson(Map<String, dynamic> json) {
    return CompanySettings(
      id: jsonString(json['id']),
      name: jsonString(json['name']),
      companyCode: jsonString(json['company_code']),
      primaryColorHex: jsonString(json['primary_color']).isEmpty
          ? '#C79D5A'
          : jsonString(json['primary_color']),
      appName: jsonString(json['app_name']),
      address: jsonString(json['address']),
      contact: jsonString(json['contact']),
      logoPath: jsonString(json['logo_path']),
      loginBackgroundPath: jsonString(json['login_background_path']),
    );
  }

  factory CompanySettings.fromBootstrap(BootstrapPayload? payload) {
    final company = payload?.company ?? const CompanySummary();
    return CompanySettings(
      id: company.id,
      name: company.name,
      companyCode: company.companyCode,
      primaryColorHex: company.primaryColorHex,
      appName: company.appName,
      logoPath: company.logoPath,
      loginBackgroundPath: payload?.branding.backgroundImagePath ?? '',
    );
  }
}

class StoredSession {
  const StoredSession({
    this.companyCode = '',
    this.username = '',
    this.cookieHeader = '',
    this.user,
  });

  final String companyCode;
  final String username;
  final String cookieHeader;
  final SessionUser? user;
}
