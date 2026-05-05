import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models.dart';

class GmsSessionStore {
  static const String _companyCodeKey = 'gms.companyCode';
  static const String _usernameKey = 'gms.username';
  static const String _cookieHeaderKey = 'gms.cookieHeader';
  static const String _userSnapshotKey = 'gms.userSnapshot';

  Future<StoredSession> load() async {
    final preferences = await SharedPreferences.getInstance();
    SessionUser? user;
    final rawUser = preferences.getString(_userSnapshotKey);
    if (rawUser != null && rawUser.isNotEmpty) {
      try {
        user = SessionUser.fromJson(jsonMap(jsonDecode(rawUser)));
      } catch (_) {
        user = null;
      }
    }

    return StoredSession(
      companyCode: preferences.getString(_companyCodeKey)?.trim() ?? '',
      username: preferences.getString(_usernameKey)?.trim() ?? '',
      cookieHeader: preferences.getString(_cookieHeaderKey)?.trim() ?? '',
      user: user,
    );
  }

  Future<void> saveLoginHints({
    required String companyCode,
    required String username,
  }) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_companyCodeKey, companyCode.trim());
    await preferences.setString(_usernameKey, username.trim());
  }

  Future<void> saveSession({
    required String companyCode,
    required String username,
    required String cookieHeader,
    SessionUser? user,
  }) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_companyCodeKey, companyCode.trim());
    await preferences.setString(_usernameKey, username.trim());
    await preferences.setString(_cookieHeaderKey, cookieHeader.trim());
    if (user == null) {
      await preferences.remove(_userSnapshotKey);
      return;
    }
    await preferences.setString(_userSnapshotKey, jsonEncode(user.toJson()));
  }

  Future<void> clearSession() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_cookieHeaderKey);
    await preferences.remove(_userSnapshotKey);
  }
}
