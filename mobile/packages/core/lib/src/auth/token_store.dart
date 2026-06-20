import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Безопасное хранение токена сессии (Keychain на iOS, Keystore на Android).
class TokenStore {
  TokenStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const String _key = 'session_token';

  Future<String?> read() => _storage.read(key: _key);
  Future<void> write(String token) => _storage.write(key: _key, value: token);
  Future<void> clear() => _storage.delete(key: _key);
}
