import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Простой файловый кэш JSON в каталоге поддержки приложения.
/// Используется для офлайн-хранения данных каталога упражнений.
class LocalJsonStore {
  LocalJsonStore._();
  static final LocalJsonStore instance = LocalJsonStore._();

  Directory? _dir;

  Future<Directory> _ensureDir() async {
    if (_dir != null) return _dir!;
    final Directory base = await getApplicationSupportDirectory();
    final Directory dir = Directory('${base.path}/cache');
    if (!dir.existsSync()) dir.createSync(recursive: true);
    _dir = dir;
    return dir;
  }

  File _file(Directory dir, String key) => File('${dir.path}/$key.json');

  /// Прочитать список объектов по ключу (или null, если кэша нет/он битый).
  Future<List<Map<String, dynamic>>?> readList(String key) async {
    try {
      final Directory dir = await _ensureDir();
      final File f = _file(dir, key);
      if (!f.existsSync()) return null;
      final dynamic data = jsonDecode(await f.readAsString());
      if (data is List) return data.cast<Map<String, dynamic>>();
      return null;
    } catch (_) {
      return null;
    }
  }

  /// Записать список объектов по ключу (ошибки записи проглатываем).
  Future<void> writeList(String key, List<Map<String, dynamic>> value) async {
    try {
      final Directory dir = await _ensureDir();
      await _file(dir, key).writeAsString(jsonEncode(value));
    } catch (_) {
      // кэш — не критичная операция
    }
  }
}
