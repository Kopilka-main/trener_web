import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'client_auth.dart' show ClientContact;

/// Публичный профиль тренера (глазами клиента).
class TrainerPublic {
  TrainerPublic({
    required this.firstName,
    required this.lastName,
    required this.title,
    required this.bio,
    required this.avatarFileId,
    required this.contacts,
  });
  final String firstName;
  final String lastName;
  final String? title;
  final String? bio;
  final String? avatarFileId;
  final List<ClientContact> contacts;

  String get fullName => '$firstName $lastName'.trim();
  String get initials {
    final List<String> parts = fullName.split(RegExp(r'\s+')).where((String s) => s.isNotEmpty).toList();
    if (parts.isEmpty) return '';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts[1].substring(0, 1)).toUpperCase();
  }

  factory TrainerPublic.fromJson(Map<String, dynamic> j) => TrainerPublic(
        firstName: j['firstName'] as String? ?? '',
        lastName: j['lastName'] as String? ?? '',
        title: j['title'] as String?,
        bio: j['bio'] as String?,
        avatarFileId: j['avatarFileId'] as String?,
        contacts: ((j['contacts'] as List<dynamic>?) ?? <dynamic>[])
            .cast<Map<String, dynamic>>()
            .map(ClientContact.fromJson)
            .toList(),
      );
}

class ClientTrainerApi {
  ClientTrainerApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<TrainerPublic?> load() async {
    final Map<String, dynamic> r = await _api.getJson('/api/client/trainer');
    final Map<String, dynamic>? t = r['trainer'] as Map<String, dynamic>?;
    return t != null ? TrainerPublic.fromJson(t) : null;
  }

  Future<void> disconnect() async {
    await _api.postJson('/api/client/trainer/disconnect');
  }

  /// URL аватара тренера (защищённый роут). [version] — для сброса кэша.
  String avatarUrl(String version) {
    final String base = _ref.read(baseUrlProvider);
    final String b = base.endsWith('/') ? base.substring(0, base.length - 1) : base;
    return '$b/api/client/trainer/avatar?v=$version';
  }
}

final Provider<ClientTrainerApi> clientTrainerApiProvider =
    Provider<ClientTrainerApi>((ref) => ClientTrainerApi(ref));

final FutureProvider<TrainerPublic?> clientTrainerProvider =
    FutureProvider<TrainerPublic?>((ref) => ref.read(clientTrainerApiProvider).load());
