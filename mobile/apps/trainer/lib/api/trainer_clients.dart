import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Статус клиента (зеркало clientStatusSchema).
enum ClientStatus { active, archived, unknown }

ClientStatus _statusFrom(String? s) => switch (s) {
      'active' => ClientStatus.active,
      'archived' => ClientStatus.archived,
      _ => ClientStatus.unknown,
    };

/// Контакт клиента (тип + значение).
class ClientContact {
  ClientContact({required this.type, required this.value});
  final String type;
  final String value;

  factory ClientContact.fromJson(Map<String, dynamic> j) => ClientContact(
        type: j['type'] as String? ?? '',
        value: j['value'] as String? ?? '',
      );
}

/// Клиент тренера (зеркало clientResponseSchema).
class Client {
  Client({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.phone,
    required this.notes,
    required this.status,
    required this.isOnline,
    required this.tags,
    required this.contacts,
    required this.hasAccount,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String? phone;
  final String? notes;
  final ClientStatus status;
  final bool isOnline;
  final List<String> tags;
  final List<ClientContact> contacts;
  final bool hasAccount;

  String get fullName => '$firstName $lastName'.trim();

  String get initials {
    final List<String> parts = fullName.split(RegExp(r'\s+')).where((String s) => s.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return parts.take(2).map((String w) => w[0]).join().toUpperCase();
  }

  factory Client.fromJson(Map<String, dynamic> j) => Client(
        id: j['id'] as String? ?? '',
        firstName: j['firstName'] as String? ?? '',
        lastName: j['lastName'] as String? ?? '',
        phone: j['phone'] as String?,
        notes: j['notes'] as String?,
        status: _statusFrom(j['status'] as String?),
        isOnline: j['isOnline'] as bool? ?? false,
        tags: ((j['tags'] as List<dynamic>?) ?? <dynamic>[]).map((dynamic e) => e.toString()).toList(),
        contacts: ((j['contacts'] as List<dynamic>?) ?? <dynamic>[])
            .cast<Map<String, dynamic>>()
            .map(ClientContact.fromJson)
            .toList(),
        hasAccount: (j['accountId'] as String?) != null,
      );
}

/// Доступ к клиентам тренера: список.
class TrainerClientsApi {
  TrainerClientsApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<List<Client>> load() async {
    final Map<String, dynamic> r = await _api.getJson('/api/clients');
    final List<Client> list = ((r['clients'] as List<dynamic>?) ?? <dynamic>[])
        .cast<Map<String, dynamic>>()
        .map(Client.fromJson)
        .toList();
    list.sort((Client a, Client b) =>
        a.fullName.toLowerCase().compareTo(b.fullName.toLowerCase()));
    return list;
  }

  /// Создать клиента (необязательно с привязкой к аккаунту по коду).
  Future<void> create({
    required String firstName,
    required String lastName,
    String? phone,
    required bool isOnline,
    String? accountId,
  }) async {
    final String? ph = (phone == null || phone.trim().isEmpty) ? null : phone.trim();
    final String? acc = (accountId == null || accountId.trim().isEmpty) ? null : accountId.trim();
    await _api.postJson('/api/clients', <String, dynamic>{
      'firstName': firstName,
      'lastName': lastName,
      'phone': ph,
      'isOnline': isOnline,
      'accountId': acc,
    });
  }

  /// Обновить данные клиента (частично).
  Future<void> update(
    String id, {
    required String firstName,
    required String lastName,
    String? phone,
    required bool isOnline,
    required ClientStatus status,
    String? notes,
  }) async {
    await _api.patchJson('/api/clients/$id', <String, dynamic>{
      'firstName': firstName,
      'lastName': lastName,
      'phone': phone == null || phone.trim().isEmpty ? null : phone.trim(),
      'isOnline': isOnline,
      'status': status == ClientStatus.archived ? 'archived' : 'active',
      'notes': notes == null || notes.trim().isEmpty ? null : notes.trim(),
    });
  }
}

final Provider<TrainerClientsApi> trainerClientsApiProvider =
    Provider<TrainerClientsApi>((ref) => TrainerClientsApi(ref));

final FutureProvider<List<Client>> trainerClientsProvider =
    FutureProvider<List<Client>>((ref) => ref.read(trainerClientsApiProvider).load());
