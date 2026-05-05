import 'package:flutter/material.dart';

import 'src/app_controller.dart';
import 'src/ui/app_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final controller = AppController();
  await controller.initialize();
  runApp(GmsMobileApp(controller: controller));
}
