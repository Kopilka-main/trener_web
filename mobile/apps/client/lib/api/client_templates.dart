import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'client_workouts.dart';

/// Шаблон тренировки клиента (зеркало clientTemplateResponseSchema): имя + план
/// упражнений. План хранится «как есть» (JSON), чтобы без потерь переотправить
/// при создании тренировки.
class ClientTemplate {
  ClientTemplate({required this.id, required this.name, required this.exercises});

  final String id;
  final String name;
  final List<Map<String, dynamic>> exercises; // [{exerciseId, sets:[{plannedReps,...}]}]

  int get count => exercises.length;

  factory ClientTemplate.fromJson(Map<String, dynamic> j) => ClientTemplate(
        id: j['id'] as String? ?? '',
        name: j['name'] as String? ?? 'Шаблон',
        exercises: ((j['exercises'] as List<dynamic>?) ?? <dynamic>[])
            .cast<Map<String, dynamic>>(),
      );
}

/// Доступ к шаблонам клиента: список, сохранение, удаление.
class ClientTemplatesApi {
  ClientTemplatesApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<List<ClientTemplate>> load() async {
    final Map<String, dynamic> r = await _api.getJson('/api/client/templates');
    return ((r['templates'] as List<dynamic>?) ?? <dynamic>[])
        .cast<Map<String, dynamic>>()
        .map(ClientTemplate.fromJson)
        .toList();
  }

  Future<void> save(String name, List<Map<String, dynamic>> exercises) async {
    await _api.postJson(
      '/api/client/templates',
      <String, dynamic>{'name': name, 'exercises': exercises},
    );
  }

  Future<void> delete(String id) async {
    await _api.deleteJson('/api/client/templates/$id');
  }
}

final Provider<ClientTemplatesApi> clientTemplatesApiProvider =
    Provider<ClientTemplatesApi>((ref) => ClientTemplatesApi(ref));

final FutureProvider<List<ClientTemplate>> clientTemplatesProvider =
    FutureProvider<List<ClientTemplate>>((ref) => ref.read(clientTemplatesApiProvider).load());

// ─── Построение плана из тренировки (зеркало repeatBody/templateBody в вебе) ───

Map<String, dynamic> _planSet({num? reps, num? weight, num? time, num? rest}) =>
    <String, dynamic>{
      'plannedReps': ?reps,
      'plannedWeightKg': ?weight,
      'plannedTimeSec': ?time,
      'plannedRestSec': ?rest,
    };

/// Повтор «точь-в-точь»: берём ФАКТ выполненных подходов как новый план.
List<Map<String, dynamic>> repeatPlan(Workout w) => w.exercises
    .map((WorkoutExercise ex) => <String, dynamic>{
          'exerciseId': ex.exerciseId,
          'sets': ex.sets
              .where((WorkoutSet s) => s.done)
              .map((WorkoutSet s) => _planSet(
                    reps: s.actualReps ?? s.plannedReps,
                    weight: s.actualWeightKg ?? s.plannedWeightKg,
                    time: s.actualTimeSec ?? s.plannedTimeSec,
                  ))
              .toList(),
        })
    .where((Map<String, dynamic> ex) => (ex['sets'] as List<dynamic>).isNotEmpty)
    .toList();

/// План для сохранения как шаблон: берём план (или факт как запасной).
List<Map<String, dynamic>> templatePlan(Workout w) => w.exercises
    .map((WorkoutExercise ex) => <String, dynamic>{
          'exerciseId': ex.exerciseId,
          'sets': ex.sets
              .map((WorkoutSet s) => _planSet(
                    reps: s.plannedReps ?? s.actualReps,
                    weight: s.plannedWeightKg ?? s.actualWeightKg,
                    time: s.plannedTimeSec ?? s.actualTimeSec,
                  ))
              .toList(),
        })
    .where((Map<String, dynamic> ex) => (ex['sets'] as List<dynamic>).isNotEmpty)
    .toList();
