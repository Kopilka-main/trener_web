import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Безопасное хранение токена сессии (Keychain на iOS, Keystore на Android).
///
/// На Android ОБЯЗАТЕЛЬНО `encryptedSharedPreferences: true` — иначе стандартное
/// хранилище flutter_secure_storage теряет токен между перезапусками приложения
/// (пользователь «разлогинивается» сам собой). На iOS — `first_unlock`, чтобы
/// токен переживал перезапуск.
class TokenStore {
  TokenStore([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;
  static const String _key = 'session_token';

  Future<String?> read() => _storage.read(key: _key);
  Future<void> write(String token) => _storage.write(key: _key, value: token);
  Future<void> clear() => _storage.delete(key: _key);
}
