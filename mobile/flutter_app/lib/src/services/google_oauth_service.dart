import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:url_launcher/url_launcher.dart';

class GmsGoogleOAuthService {
  GmsGoogleOAuthService({AppLinks? appLinks})
      : _appLinks = appLinks ?? AppLinks();

  static const String callbackScheme = 'gmsmobile';
  static const String callbackHost = 'auth';
  static const String callbackPath = '/google';

  final AppLinks _appLinks;

  Stream<Uri> get callbackStream =>
      _appLinks.uriLinkStream.where(_isGoogleCallback);

  Future<Uri?> getInitialGoogleCallback() async {
    final initialLink = await _appLinks.getInitialLink();
    if (initialLink == null || !_isGoogleCallback(initialLink)) {
      return null;
    }
    return initialLink;
  }

  Future<void> launchGoogleSignIn(Uri authUri) async {
    final launched = await launchUrl(
      authUri,
      mode: LaunchMode.externalApplication,
    );
    if (!launched) {
      throw Exception('Unable to open Google sign-in.');
    }
  }

  Future<String> requestHandoffCode(Uri authUri) async {
    final completer = Completer<String>();

    void handle(Uri uri) {
      if (!_isGoogleCallback(uri) || completer.isCompleted) {
        return;
      }
      final error = uri.queryParameters['error']?.trim() ?? '';
      if (error.isNotEmpty) {
        completer.completeError(Exception(error));
        return;
      }
      final code = uri.queryParameters['code']?.trim() ?? '';
      if (code.isEmpty) {
        completer.completeError(
          Exception('Google login did not return a handoff code.'),
        );
        return;
      }
      completer.complete(code);
    }

    final subscription = _appLinks.uriLinkStream.listen(
      handle,
      onError: (Object error) {
        if (!completer.isCompleted) {
          completer.completeError(error);
        }
      },
    );

    try {
      final initialLink = await _appLinks.getInitialLink();
      if (initialLink != null) {
        handle(initialLink);
      }

      await launchGoogleSignIn(authUri);

      return await completer.future.timeout(
        const Duration(minutes: 2),
        onTimeout: () {
          throw TimeoutException('Google login timed out. Please try again.');
        },
      );
    } finally {
      await subscription.cancel();
    }
  }

  bool _isGoogleCallback(Uri uri) {
    return uri.scheme == callbackScheme &&
        uri.host == callbackHost &&
        uri.path == callbackPath;
  }
}
