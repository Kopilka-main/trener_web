import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Профиль тренера (срез — только то, что нужно главной).
class TrainerProfile {
  TrainerProfile({required this.firstName, required this.lastName, required this.email});

  factory TrainerProfile.fromJson(Map<String, dynamic> j) => TrainerProfile(
        firstName: (j['firstName'] as String?) ?? '',
        lastName: (j['lastName'] as String?) ?? '',
        email: (j['email'] as String?) ?? '',
      );

  final String firstName;
  final String lastName;
  final String email;

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
