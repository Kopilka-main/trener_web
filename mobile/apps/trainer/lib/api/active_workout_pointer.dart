import 'package:core/core.dart';

/// Локальный указатель на идущую (active) тренировку тренера — чтобы на главной
/// показывать блок «Вернуться к тренировке». Ставится при старте/показе активной
/// тренировки, чистится при завершении. Достоверность подтверждается лёгкой
/// проверкой статуса на главной (если тренировка уже не active — указатель
/// сбрасывается).
class ActiveWorkoutPointer {
  ActiveWorkoutPointer._();
  static const String _key = 'trainer_active_workout';

  static Future<void> save({
    required String clientId,
    required String workoutId,
    required String name,
  }) =>
      LocalJsonStore.instance.writeList(_key, <Map<String, dynamic>>[
        <String, dynamic>{'clientId': clientId, 'workoutId': workoutId, 'name': name},
      ]);

  static Future<({String clientId, String workoutId, String name})?> read() async {
    final List<Map<String, dynamic>>? list = await LocalJsonStore.instance.readList(_key);
    if (list == null || list.isEmpty) return null;
    final Map<String, dynamic> m = list.first;
    final String? cid = m['clientId'] as String?;
    final String? wid = m['workoutId'] as String?;
    if (cid == null || cid.isEmpty || wid == null || wid.isEmpty) return null;
    return (clientId: cid, workoutId: wid, name: m['name'] as String? ?? 'Тренировка');
  }

  static Future<void> clear() =>
      LocalJsonStore.instance.writeList(_key, <Map<String, dynamic>>[]);
}
