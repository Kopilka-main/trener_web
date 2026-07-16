import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'active_workout_pointer.dart';
import 'local_workout.dart';
import 'offline_providers.dart';

typedef ActiveWorkoutRef = ({String clientId, String workoutId, String name, bool local});

/// Реактивное состояние «идёт тренировка» для плавающего FAB. Гидратируется из
/// сохранённого указателя при старте (с подтверждением статуса), обновляется
/// экраном проведения при старте/завершении.
class ActiveWorkoutNotifier extends Notifier<ActiveWorkoutRef?> {
  @override
  ActiveWorkoutRef? build() {
    _hydrate();
    return null;
  }

  Future<void> _hydrate() async {
    final ActiveWorkoutRef? p = await ActiveWorkoutPointer.read();
    if (p == null) return;
    if (p.local) {
      // Локальный указатель — без сети: сверяемся с локальным документом на
      // диске (он не удалён после complete() до успешной отправки, поэтому
      // проверяем именно статус, а не наличие).
      try {
        final LocalWorkout? w = await ref.read(localWorkoutControllerProvider).load(p.workoutId);
        if (w != null && w.status != 'completed') {
          state = p;
        } else {
          await ActiveWorkoutPointer.clear();
        }
      } catch (_) {
        state = p; // не удалось проверить — доверяем указателю
      }
      return;
    }
    // Подтверждаем, что тренировка ещё active — иначе чистим устаревший указатель.
    try {
      final Map<String, dynamic> r = await ref
          .read(apiClientProvider)
          .getJson('/api/clients/${p.clientId}/workouts/${p.workoutId}');
      final Map<String, dynamic>? w = r['workout'] as Map<String, dynamic>?;
      if (w != null && w['status'] == 'active') {
        state = p;
      } else {
        await ActiveWorkoutPointer.clear();
      }
    } catch (_) {
      // Офлайн/ошибка — доверяем указателю (лучше показать, чем потерять).
      state = p;
    }
  }

  void set(String clientId, String workoutId, String name, {bool local = false}) {
    state = (clientId: clientId, workoutId: workoutId, name: name, local: local);
    ActiveWorkoutPointer.save(clientId: clientId, workoutId: workoutId, name: name, local: local);
  }

  void clear() {
    state = null;
    ActiveWorkoutPointer.clear();
  }
}

final NotifierProvider<ActiveWorkoutNotifier, ActiveWorkoutRef?> activeWorkoutProvider =
    NotifierProvider<ActiveWorkoutNotifier, ActiveWorkoutRef?>(ActiveWorkoutNotifier.new);

/// true, пока открыт экран проведения — чтобы не рисовать плавающий FAB поверх него.
final StateProvider<bool> activeWorkoutOnScreenProvider = StateProvider<bool>((Ref ref) => false);
