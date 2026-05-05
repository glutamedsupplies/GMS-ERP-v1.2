import 'package:flutter_test/flutter_test.dart';

import 'package:gms_mobile_flutter/src/app_controller.dart';
import 'package:gms_mobile_flutter/src/ui/app_shell.dart';

void main() {
  testWidgets('renders branded splash shell', (WidgetTester tester) async {
    final controller = AppController();

    await tester.pumpWidget(GmsMobileApp(controller: controller));

    expect(find.text('GMS ERP'), findsOneWidget);
    expect(find.text('Secure sign-in'), findsOneWidget);
  });
}
