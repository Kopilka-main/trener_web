import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Контакт клиента (тип + значение).
class ClientContact {
  ClientContact({required this.type, required this.value});
  final String type;
  final String value;
  factory ClientContact.fromJson(Map<String, dynamic> j) =>
      ClientContact(type: j['type'] as String? ?? '', value: j['value'] as String? ?? '');
}

/// Профиль клиентского аккаунта. `id` — код подключения, который клиент
/// передаёт тренеру.
class ClientAccount {
  ClientAccount({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.avatarFileId,
    required this.birthDate,
    required this.birthYear,
    required this.bio,
    required this.contacts,
    required this.pendingDeletionAt,
    required this.sessionReminderEnabled,
  });

  factory ClientAccount.fromJson(Map<String, dynamic> j) => ClientAccount(
        id: (j['id'] as String?) ?? '',
        firstName: (j['firstName'] as String?) ?? '',
        lastName: (j['lastName'] as String?) ?? '',
        email: (j['email'] as String?) ?? '',
        avatarFileId: j['avatarFileId'] as String?,
        birthDate: j['birthDate'] as String?,
        birthYear: (j['birthYear'] as num?)?.toInt(),
        bio: j['bio'] as String?,
        contacts: ((j['contacts'] as List<dynamic>?) ?? <dynamic>[])
            .cast<Map<String, dynamic>>()
            .map(ClientContact.fromJson)
            .toList(),
        pendingDeletionAt: j['pendingDeletionAt'] as String?,
        sessionReminderEnabled: j['sessionReminderEnabled'] as bool? ?? true,
      );

  final String id;
  final String firstName;
  final String lastName;
  final String email;
  final String? avatarFileId;
  final String? birthDate;
  // Год рождения (хранится отдельно от birthDate: день+месяц), либо null.
  final int? birthYear;
  final String? bio;
  final List<ClientContact> contacts;
  // ISO-момент окончательного удаления аккаунта (окно отмены), либо null.
  final String? pendingDeletionAt;
  // Слать ли пуш «Через час тренировка» (24-часовое «скоро занятие» независимо).
  final bool sessionReminderEnabled;

  String get fullName => '$firstName $lastName'.trim();
  String get initials {
    final List<String> parts = fullName.split(RegExp(r'\s+')).where((String s) => s.isNotEmpty).toList();
    if (parts.isEmpty) return '';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts[1].substring(0, 1)).toUpperCase();
  }
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

  /// Запросить письмо с 6-значным кодом восстановления пароля.
  /// Бэкенд всегда отвечает 200 (не раскрывает, зарегистрирован ли email).
  Future<void> forgotPassword(String email) async {
    await _api.postJson('/api/client/auth/forgot-password', <String, String>{'email': email});
  }

  /// Сбросить пароль по коду из письма. 400 — неверный/просроченный код.
  Future<void> resetPassword(String email, String code, String password) async {
    await _api.postJson(
      '/api/client/auth/reset-password',
      <String, String>{'email': email, 'code': code, 'password': password},
    );
  }

  Future<ClientAccount> me() async {
    final Map<String, dynamic> res = await _api.getJson('/api/client/auth/me');
    // pendingDeletionAt лежит на верхнем уровне ответа — вмешиваем в account.
    final Map<String, dynamic> account = <String, dynamic>{
      ...res['account'] as Map<String, dynamic>,
      'pendingDeletionAt': res['pendingDeletionAt'],
    };
    return ClientAccount.fromJson(account);
  }

  /// Обновить профиль (PATCH /api/client/auth/me).
  Future<ClientAccount> updateProfile(Map<String, dynamic> body) async {
    final Map<String, dynamic> res = await _api.patchJson('/api/client/auth/me', body);
    return ClientAccount.fromJson(res['account'] as Map<String, dynamic>);
  }

  /// Загрузить аватар (multipart, поле photo).
  Future<ClientAccount> uploadAvatar(String filePath, String fileName) async {
    final Map<String, dynamic> res = await _api.postForm(
      '/api/client/auth/me/avatar',
      <String, String>{},
      fileField: 'photo',
      filePath: filePath,
      fileName: fileName,
    );
    return ClientAccount.fromJson(res['account'] as Map<String, dynamic>);
  }

  Future<void> removeAvatar() async {
    await _api.deleteJson('/api/client/auth/me/avatar');
  }

  /// URL собственного аватара (свой защищённый роут). [version] — для сброса кэша.
  String avatarUrl(String version) {
    final String base = _ref.read(baseUrlProvider);
    final String b = base.endsWith('/') ? base.substring(0, base.length - 1) : base;
    return '$b/api/client/auth/me/avatar?v=$version';
  }

  Future<void> logout() async {
    try {
      await _api.postJson('/api/client/auth/logout');
    } catch (_) {
      // выход локально всё равно выполняем
    }
    await _ref.read(sessionProvider.notifier).clear();
  }

  /// Запросить удаление аккаунта (окно отмены 3 дня). Возвращает ISO-дату сноса.
  Future<String> deleteAccount() async {
    final Map<String, dynamic> res = await _api.deleteJson('/api/client/auth/me');
    return res['pendingDeletionAt'] as String? ?? '';
  }

  /// Отменить запланированное удаление аккаунта.
  Future<void> cancelDeletion() async {
    await _api.postJson('/api/client/auth/me/cancel-deletion');
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
