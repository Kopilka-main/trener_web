import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Контакт тренера (тип + значение).
class TrainerContact {
  TrainerContact({required this.type, required this.value});
  final String type;
  final String value;
  factory TrainerContact.fromJson(Map<String, dynamic> j) =>
      TrainerContact(type: j['type'] as String? ?? '', value: j['value'] as String? ?? '');
  Map<String, String> toJson() => <String, String>{'type': type, 'value': value};
}

/// Профиль тренера.
class TrainerProfile {
  TrainerProfile({
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.title,
    required this.bio,
    required this.birthDate,
    required this.contacts,
  });

  factory TrainerProfile.fromJson(Map<String, dynamic> j) => TrainerProfile(
        firstName: (j['firstName'] as String?) ?? '',
        lastName: (j['lastName'] as String?) ?? '',
        email: (j['email'] as String?) ?? '',
        title: j['title'] as String?,
        bio: j['bio'] as String?,
        birthDate: j['birthDate'] as String?,
        contacts: ((j['contacts'] as List<dynamic>?) ?? <dynamic>[])
            .cast<Map<String, dynamic>>()
            .map(TrainerContact.fromJson)
            .toList(),
      );

  final String firstName;
  final String lastName;
  final String email;
  final String? title;
  final String? bio;
  final String? birthDate;
  final List<TrainerContact> contacts;

  String get fullName => '$firstName $lastName'.trim();
}

/// Авторизация тренера: логин/профиль/выход поверх общего ApiClient + сессии.
class TrainerApi {
  TrainerApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<void> login(String email, String password) async {
    final Map<String, dynamic> res = await _api.postJson(
      '/api/auth/login',
      <String, String>{'email': email, 'password': password},
    );
    await _ref.read(sessionProvider.notifier).setToken(res['token'] as String);
  }

  Future<void> register(String email, String password, String firstName, String lastName) async {
    final Map<String, dynamic> res = await _api.postJson(
      '/api/auth/register',
      <String, String>{
        'email': email,
        'password': password,
        'firstName': firstName,
        'lastName': lastName,
      },
    );
    await _ref.read(sessionProvider.notifier).setToken(res['token'] as String);
  }

  Future<TrainerProfile> me() async {
    final Map<String, dynamic> res = await _api.getJson('/api/auth/me');
    return TrainerProfile.fromJson(res['trainer'] as Map<String, dynamic>);
  }

  /// Обновить профиль (PATCH /api/auth/me). Передаём только заполняемые поля.
  Future<TrainerProfile> updateProfile(Map<String, dynamic> body) async {
    final Map<String, dynamic> res = await _api.patchJson('/api/auth/me', body);
    return TrainerProfile.fromJson(res['trainer'] as Map<String, dynamic>);
  }

  Future<void> logout() async {
    try {
      await _api.postJson('/api/auth/logout');
    } catch (_) {
      // выход локально всё равно выполняем
    }
    await _ref.read(sessionProvider.notifier).clear();
  }
}

final Provider<TrainerApi> trainerApiProvider =
    Provider<TrainerApi>((ref) => TrainerApi(ref));

final FutureProvider<TrainerProfile> trainerMeProvider =
    FutureProvider<TrainerProfile>((ref) => ref.read(trainerApiProvider).me());
