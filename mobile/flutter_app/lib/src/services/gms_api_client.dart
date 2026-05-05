import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../models.dart';

class ApiException implements Exception {
  const ApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class GmsApiClient {
  GmsApiClient({
    this.baseUrl = 'https://gmserp.com',
    http.Client? client,
  }) : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  String cookieHeader = '';

  Future<Branding> getPublicBranding(String companyCode) async {
    final payload = await _request(
      '/api/public-branding',
      query: <String, String?>{'companyCode': companyCode},
      includeCookies: false,
    );
    return Branding.fromJson(jsonMap(payload));
  }

  Future<Map<String, dynamic>> getServerInfo() async {
    final payload = await _request('/api/server-info', includeCookies: false);
    return jsonMap(payload);
  }

  Future<SessionUser?> restoreSession() async {
    final payload = await _request('/api/session');
    if (payload == null) {
      return null;
    }
    final map = jsonMap(payload);
    if (map.isEmpty) {
      return null;
    }
    return SessionUser.fromJson(map);
  }

  Future<SessionUser> login({
    required String companyCode,
    required String username,
    required String password,
  }) async {
    final payload = await _request(
      '/api/login',
      method: 'POST',
      body: <String, dynamic>{
        'companyCode': companyCode.trim(),
        'username': username.trim(),
        'password': password,
      },
    );
    return SessionUser.fromJson(jsonMap(payload));
  }

  Uri buildMobileGoogleLoginUri(String companyCode) {
    return _buildUri('/api/auth/google', <String, String?>{
      'companyCode': companyCode.trim(),
      'mobile': '1',
    });
  }

  Future<SessionUser> completeMobileGoogleLogin(String handoffCode) async {
    final payload = await _request(
      '/api/mobile/auth/google/complete',
      method: 'POST',
      body: <String, dynamic>{
        'code': handoffCode.trim(),
      },
    );
    return SessionUser.fromJson(jsonMap(payload));
  }

  Future<void> logout() async {
    try {
      await _request('/api/logout', method: 'POST', body: const <String, dynamic>{});
    } finally {
      cookieHeader = '';
    }
  }

  Future<BootstrapPayload> getBootstrap() async {
    final payload = await _request('/api/bootstrap');
    return BootstrapPayload.fromJson(jsonMap(payload));
  }

  Future<void> requestPasswordResetCode({
    required String companyCode,
    required String email,
  }) async {
    await _request(
      '/api/public/password-reset/request',
      method: 'POST',
      body: <String, dynamic>{
        'companyCode': companyCode.trim(),
        'email': email.trim(),
      },
      includeCookies: false,
    );
  }

  Future<void> verifyPasswordResetCode({
    required String companyCode,
    required String email,
    required String code,
  }) async {
    await _request(
      '/api/public/password-reset/verify',
      method: 'POST',
      body: <String, dynamic>{
        'companyCode': companyCode.trim(),
        'email': email.trim(),
        'code': code.trim(),
      },
      includeCookies: false,
    );
  }

  Future<void> confirmPasswordReset({
    required String companyCode,
    required String email,
    required String code,
    required String password,
  }) async {
    await _request(
      '/api/public/password-reset/confirm',
      method: 'POST',
      body: <String, dynamic>{
        'companyCode': companyCode.trim(),
        'email': email.trim(),
        'code': code.trim(),
        'password': password,
      },
      includeCookies: false,
    );
  }

  Future<AttendanceRecord?> getTodayAttendance(String userId) async {
    final payload = await _request('/api/attendance/user/${Uri.encodeComponent(userId)}/today');
    final map = jsonMap(payload);
    if (map.isEmpty) {
      return null;
    }
    return AttendanceRecord.fromJson(map);
  }

  Future<AttendanceActionResult> recordTimeIn(String userId) async {
    final payload = await _request(
      '/api/attendance/time-in',
      method: 'POST',
      body: <String, dynamic>{'userId': userId},
    );
    return AttendanceActionResult.fromJson(jsonMap(payload));
  }

  Future<AttendanceActionResult> recordTimeOut(String userId) async {
    final payload = await _request(
      '/api/attendance/time-out',
      method: 'POST',
      body: <String, dynamic>{'userId': userId},
    );
    return AttendanceActionResult.fromJson(jsonMap(payload));
  }

  Future<List<AttendanceRecord>> getCutoffTimeCard({
    required String userId,
    required String dateKey,
  }) async {
    final payload = await _request(
      '/api/attendance/user/${Uri.encodeComponent(userId)}/cutoff-card',
      query: <String, String?>{'dateKey': dateKey},
    );
    return jsonMapList(payload).map(AttendanceRecord.fromJson).toList();
  }

  Future<List<InventoryItem>> listInventory({
    required String branch,
    String filter = '',
  }) async {
    final payload = await _request(
      '/api/inventory',
      query: <String, String?>{
        'branch': branch,
        'filter': filter,
      },
    );
    return jsonMapList(payload).map(InventoryItem.fromJson).toList();
  }

  Future<List<SessionUser>> listEmployees({String filter = ''}) async {
    final payload = await _request(
      '/api/employees',
      query: <String, String?>{'filter': filter},
    );
    return jsonMapList(payload).map(SessionUser.fromJson).toList();
  }

  Future<List<SessionUser>> listUsers({
    String role = '',
    String filter = '',
  }) async {
    final payload = await _request(
      '/api/users',
      query: <String, String?>{
        'role': role,
        'filter': filter,
      },
    );
    return jsonMapList(payload).map(SessionUser.fromJson).toList();
  }

  Future<List<BranchSummary>> listBranches() async {
    final payload = await _request('/api/branches');
    return jsonMapList(payload).map(BranchSummary.fromJson).toList();
  }

  Future<BranchSummary> createBranch({
    required String name,
    String address = '',
  }) async {
    final payload = await _request(
      '/api/branches',
      method: 'POST',
      body: <String, dynamic>{
        'branchName': name.trim(),
        'address': address.trim(),
      },
    );
    return BranchSummary.fromJson(jsonMap(payload));
  }

  Future<BranchSummary> updateBranch({
    required String branchId,
    required String name,
    String address = '',
    required bool isActive,
  }) async {
    final payload = await _request(
      '/api/branches/${Uri.encodeComponent(branchId)}',
      method: 'PUT',
      body: <String, dynamic>{
        'branchName': name.trim(),
        'address': address.trim(),
        'is_active': isActive,
      },
    );
    return BranchSummary.fromJson(jsonMap(payload));
  }

  Future<void> deleteBranch(String branchId) async {
    await _request(
      '/api/branches/${Uri.encodeComponent(branchId)}',
      method: 'DELETE',
    );
  }

  Future<SessionUser> createUser({
    required String id,
    required String name,
    required String password,
    required String role,
    String branchId = '',
    String branchName = '',
  }) async {
    final payload = await _request(
      '/api/users',
      method: 'POST',
      body: <String, dynamic>{
        'id': id.trim(),
        'username': id.trim(),
        'name': name.trim(),
        'password': password,
        'role': role.trim(),
        'branchId': branchId.trim(),
        'branchName': branchName.trim(),
      },
    );
    return SessionUser.fromJson(jsonMap(payload));
  }

  Future<SessionUser> updateUser({
    required String userId,
    String? name,
    String? role,
    String? password,
    String? branchId,
    String? branchName,
    String? accountStatus,
    String? timeIn,
    String? timeOut,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) {
      body['name'] = name.trim();
    }
    if (role != null) {
      body['role'] = role.trim();
    }
    if (password != null) {
      body['password'] = password;
    }
    if (branchId != null) {
      body['branchId'] = branchId.trim();
    }
    if (branchName != null) {
      body['branchName'] = branchName.trim();
    }
    if (accountStatus != null) {
      body['accountStatus'] = accountStatus.trim();
    }
    if (timeIn != null) {
      body['timeIn'] = timeIn.trim();
    }
    if (timeOut != null) {
      body['timeOut'] = timeOut.trim();
    }

    final payload = await _request(
      '/api/users/${Uri.encodeComponent(userId)}',
      method: 'PUT',
      body: body,
    );
    return SessionUser.fromJson(jsonMap(payload));
  }

  Future<void> deleteUser(String userId) async {
    await _request(
      '/api/users/${Uri.encodeComponent(userId)}',
      method: 'DELETE',
    );
  }

  Future<List<AttendanceRecord>> getAttendanceSnapshot({String? dateKey}) async {
    final payload = await _request(
      '/api/attendance/snapshot',
      query: <String, String?>{
        if (dateKey != null && dateKey.isNotEmpty) 'dateKey': dateKey,
      },
    );
    return jsonMapList(payload).map(AttendanceRecord.fromJson).toList();
  }

  Future<BulletinFeed> getCompanyBulletin() async {
    final payload = await _request('/api/company/bulletin');
    return BulletinFeed.fromJson(jsonMap(payload));
  }

  Future<CompanySettings> getCompanySettings() async {
    final payload = await _request('/api/company/settings');
    return CompanySettings.fromJson(jsonMap(payload));
  }

  Future<CompanySettings> updateCompanySettings({
    required String name,
    required String companyCode,
    required String appName,
    required String primaryColor,
    required String address,
    required String contact,
    String logoPath = '',
    String loginBackgroundPath = '',
  }) async {
    final payload = await _request(
      '/api/company/settings',
      method: 'PUT',
      body: <String, dynamic>{
        'name': name.trim(),
        'company_code': companyCode.trim(),
        'subdomain': companyCode.trim(),
        'app_name': appName.trim(),
        'primary_color': primaryColor.trim(),
        'address': address.trim(),
        'contact': contact.trim(),
        'logo_path': logoPath.trim(),
        'login_background_path': loginBackgroundPath.trim(),
      },
    );
    return CompanySettings.fromJson(jsonMap(payload));
  }

  Future<BulletinFeed> updateCompanyAnnouncement({
    required String title,
    required String message,
    required String startsOn,
    required String endsOn,
  }) async {
    final payload = await _request(
      '/api/company/bulletin/announcement',
      method: 'PUT',
      body: <String, dynamic>{
        'title': title.trim(),
        'message': message.trim(),
        'starts_on': startsOn.trim(),
        'ends_on': endsOn.trim(),
      },
    );
    return BulletinFeed.fromJson(jsonMap(payload));
  }

  Future<BulletinFeed> clearCompanyAnnouncement() async {
    final payload = await _request(
      '/api/company/bulletin/announcement',
      method: 'DELETE',
    );
    return BulletinFeed.fromJson(jsonMap(payload));
  }

  Future<BulletinFeed> createCompanyHoliday({
    required String name,
    required String startDate,
    required String endDate,
    required String type,
    String timeLabel = '',
    String note = '',
  }) async {
    final payload = await _request(
      '/api/company/bulletin/holidays',
      method: 'POST',
      body: <String, dynamic>{
        'name': name.trim(),
        'start_date': startDate.trim(),
        'end_date': endDate.trim(),
        'type': type.trim(),
        'time_label': timeLabel.trim(),
        'note': note.trim(),
      },
    );
    return BulletinFeed.fromJson(jsonMap(payload));
  }

  Future<BulletinFeed> updateCompanyHoliday({
    required String holidayId,
    required String name,
    required String startDate,
    required String endDate,
    required String type,
    String timeLabel = '',
    String note = '',
  }) async {
    final payload = await _request(
      '/api/company/bulletin/holidays/${Uri.encodeComponent(holidayId)}',
      method: 'PUT',
      body: <String, dynamic>{
        'name': name.trim(),
        'start_date': startDate.trim(),
        'end_date': endDate.trim(),
        'type': type.trim(),
        'time_label': timeLabel.trim(),
        'note': note.trim(),
      },
    );
    return BulletinFeed.fromJson(jsonMap(payload));
  }

  Future<BulletinFeed> deleteCompanyHoliday(String holidayId) async {
    final payload = await _request(
      '/api/company/bulletin/holidays/${Uri.encodeComponent(holidayId)}',
      method: 'DELETE',
    );
    return BulletinFeed.fromJson(jsonMap(payload));
  }

  Future<dynamic> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    Map<String, String?> query = const <String, String?>{},
    bool includeCookies = true,
  }) async {
    final uri = _buildUri(path, query);
    final request = http.Request(method, uri);
    request.headers[HttpHeaders.acceptHeader] = 'application/json';
    request.headers[HttpHeaders.contentTypeHeader] = 'application/json';
    if (includeCookies && cookieHeader.isNotEmpty) {
      request.headers[HttpHeaders.cookieHeader] = cookieHeader;
    }
    if (body != null) {
      request.body = jsonEncode(body);
    }

    late final http.StreamedResponse streamedResponse;
    try {
      streamedResponse = await _client.send(request);
    } on SocketException {
      throw const ApiException('Unable to reach the server.');
    } on HttpException {
      throw const ApiException('Network request failed.');
    }

    final response = await http.Response.fromStream(streamedResponse);
    _captureCookies(response);

    dynamic decoded;
    try {
      decoded = jsonDecode(utf8.decode(response.bodyBytes));
    } catch (_) {
      throw const ApiException('Invalid response from server.');
    }

    final root = jsonMap(decoded);
    if (root.isEmpty) {
      throw const ApiException('Invalid response from server.');
    }

    if (!jsonBool(root['success'])) {
      final errorMessage = jsonString(root['error']);
      throw ApiException(
        errorMessage.isEmpty ? 'Request failed.' : errorMessage,
      );
    }

    return root['data'];
  }

  Uri _buildUri(String path, Map<String, String?> query) {
    final resolved = Uri.parse(baseUrl).resolve(path);
    final merged = <String, String>{...resolved.queryParameters};
    query.forEach((key, value) {
      if (value == null || value.trim().isEmpty) {
        return;
      }
      merged[key] = value.trim();
    });
    return resolved.replace(
      queryParameters: merged.isEmpty ? null : merged,
    );
  }

  void _captureCookies(http.Response response) {
    final raw = response.headers['set-cookie'];
    if (raw == null || raw.trim().isEmpty) {
      return;
    }

    final existing = <String, String>{};
    for (final part in cookieHeader.split(';')) {
      final entry = part.trim();
      if (entry.isEmpty || !entry.contains('=')) {
        continue;
      }
      final separator = entry.indexOf('=');
      existing[entry.substring(0, separator).trim()] =
          entry.substring(separator + 1).trim();
    }

    for (final segment in raw.split(',')) {
      final firstPair = segment.split(';').first.trim();
      if (!firstPair.contains('=')) {
        continue;
      }
      final separator = firstPair.indexOf('=');
      final name = firstPair.substring(0, separator).trim();
      final value = firstPair.substring(separator + 1).trim();
      if (name.isEmpty || value.isEmpty) {
        continue;
      }
      existing[name] = value;
    }

    cookieHeader = existing.entries.map((entry) => '${entry.key}=${entry.value}').join('; ');
  }
}
