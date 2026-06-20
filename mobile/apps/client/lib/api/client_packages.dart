import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Пакет/абонемент клиента (срез для уведомлений и баланса).
class ClientPackage {
  ClientPackage({
    required this.id,
    required this.status,
    required this.lessonsPaid,
    required this.lessonsUsed,
    required this.workoutType,
    required this.endsAt,
  });

  final String id;
  final String status;
  final int lessonsPaid;
  final int lessonsUsed;
  final String? workoutType;
  final String? endsAt;

  int get remaining => lessonsPaid - lessonsUsed;
  bool get isActive => status == 'active';

  factory ClientPackage.fromJson(Map<String, dynamic> j) => ClientPackage(
        id: j['id'] as String? ?? '',
        status: j['status'] as String? ?? '',
        lessonsPaid: (j['lessonsPaid'] as num?)?.toInt() ?? 0,
        lessonsUsed: (j['lessonsUsed'] as num?)?.toInt() ?? 0,
        workoutType: j['workoutType'] as String?,
        endsAt: j['endsAt'] as String?,
      );
}

final FutureProvider<List<ClientPackage>> clientPackagesProvider =
    FutureProvider<List<ClientPackage>>((ref) async {
  final ApiClient api = ref.read(apiClientProvider);
  try {
    final Map<String, dynamic> r = await api.getJson('/api/client/packages');
    return ((r['packages'] as List<dynamic>?) ?? <dynamic>[])
        .cast<Map<String, dynamic>>()
        .map(ClientPackage.fromJson)
        .toList();
  } catch (_) {
    return <ClientPackage>[];
  }
});

/// Количество непрочитанных сообщений от тренера.
final FutureProvider<int> clientUnreadProvider = FutureProvider<int>((ref) async {
  final ApiClient api = ref.read(apiClientProvider);
  try {
    final Map<String, dynamic> r = await api.getJson('/api/client/chat/unread');
    return (r['count'] as num?)?.toInt() ?? 0;
  } catch (_) {
    return 0;
  }
});
