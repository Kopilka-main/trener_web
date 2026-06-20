import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Профиль клиентского аккаунта (срез — только то, что нужно главной).
class ClientAccount {
  ClientAccount({required this.firstName, required this.lastName, required this.email});

  factory ClientAccount.fromJson(Map<String, dynamic> j) => ClientAccount(
        firstName: (j['firstName'] as String?) ?? '',
        lastName: (j['lastName'] as String?) ?? '',
        email: (j['email'] as String?) ?? '',
      );

  final String firstName;
  final String lastName;
  final String email;

  String get fullName => '$firstName $lastName'.trim();
}

/// Авторизация клиента: логин/профиль/выход поверх общего ApiClient + сессии.
class ClientApi {
  ClientApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<void> login(String email, String password) async {
    final Map<String, dynamic> res = await _api.postJson(
      '/api/client/auth/login',
      <String, String>{'email': email, 'password': password},
    );
    await _ref.read(sessionProvider.notifier).setToken(res['token'] as String);
  }

  Future<ClientAccount> me() async {
    final Map<String, dynamic> res = await _api.getJson('/api/client/auth/me');
    return ClientAccount.fromJson(res['account'] as Map<String, dynamic>);
  }

  Future<void> logout() async {
    try {
      await _api.postJson('/api/client/auth/logout');
    } catch (_) {
      // выход локально всё равно выполняем
    }
    await _ref.read(sessionProvider.notifier).clear();
  }
}

final Provider<ClientApi> clientApiProvider =
    Provider<ClientApi>((ref) => ClientApi(ref));

final FutureProvider<ClientAccount> clientMeProvider =
    FutureProvider<ClientAccount>((ref) => ref.read(clientApiProvider).me());
