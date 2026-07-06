import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';

/// Журнал ошибок приложения: перехватывает все необработанные ошибки Dart
/// (framework + async + zone) и пишет их в файл `crash.log` в каталоге
/// поддержки приложения, а также в logcat (тег `APPCRASH`). Помогает ловить
/// «приложение само закрывается».
class CrashLog {
  CrashLog._();
  static File? _file;

  /// Инициализировать файл журнала. Вызывать после ensureInitialized.
  static Future<void> init() async {
    try {
      final Directory dir = await getApplicationSupportDirectory();
      _file = File('${dir.path}/crash.log');
      // ignore: avoid_print
      print('APPCRASH log-file: ${_file!.path}');
    } catch (_) {
      _file = null;
    }
  }

  /// Установить глобальные перехватчики ошибок (framework + platform).
  static void installHandlers() {
    final FlutterExceptionHandler? prev = FlutterError.onError;
    FlutterError.onError = (FlutterErrorDetails details) {
      record(details.exception, details.stack, tag: 'flutter');
      prev?.call(details);
    };
    PlatformDispatcher.instance.onError = (Object error, StackTrace stack) {
      record(error, stack, tag: 'platform');
      return true; // обработано — не роняем процесс
    };
  }

  /// Записать ошибку в журнал и logcat.
  static void record(Object error, StackTrace? stack, {String tag = 'zone'}) {
    final String entry =
        '═══ ${DateTime.now().toIso8601String()} [$tag] ═══\n$error\n${stack ?? ''}\n\n';
    // ignore: avoid_print
    print('APPCRASH [$tag] $error');
    try {
      _file?.writeAsStringSync(entry, mode: FileMode.append, flush: true);
    } catch (_) {
      // журнал — best-effort
    }
  }

  /// Прочитать журнал (последние записи — в конце).
  static String read() {
    try {
      if (_file != null && _file!.existsSync()) return _file!.readAsStringSync();
    } catch (_) {}
    return '';
  }

  /// Путь к файлу журнала (для adb pull).
  static String? get path => _file?.path;

  /// Очистить журнал.
  static void clear() {
    try {
      if (_file?.existsSync() == true) _file!.deleteSync();
    } catch (_) {}
  }
}

/// Запустить приложение с полным перехватом ошибок. [body] обычно вызывает runApp.
Future<void> runGuarded(FutureOr<void> Function() body) async {
  await runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();
    await CrashLog.init();
    CrashLog.installHandlers();
    await body();
  }, (Object error, StackTrace stack) => CrashLog.record(error, stack, tag: 'zone'));
}
