import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Профиль клиентского аккаунта (срез). `id` — код подключения, который клиент
/// передаёт тренеру.
class ClientAccount {
  ClientAccount({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
  });

  factory ClientAccount.fromJson(Map<String, dynamic> j) => ClientAccount(
        id: (j['id'] as String?) ?? '',
        firstName: (j['firstName'] as String?) ?? '',
        lastName: (j['lastName'] as String?) ?? '',
        email: (j['email'] as String?) ?? '',
      );

  final String id;
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

  Future<void> register(String email, String password, String firstName, String lastName) async {
    final Map<String, dynamic> res = await _api.postJson(
      '/api/client/auth/register',
      <String, String>{
        'email': email,
        'password': password,
        'firstName': firstName,
        'lastName': lastName,
      },
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

/// Подключён ли клиент к тренеру (link != null в /me). false при ошибке.
final FutureProvider<bool> clientLinkedProvider = FutureProvider<bool>((ref) async {
  try {
    final Map<String, dynamic> r = await ref.read(apiClientProvider).getJson('/api/client/auth/me');
    return r['link'] != null;
  } catch (_) {
    return false;
  }
});
