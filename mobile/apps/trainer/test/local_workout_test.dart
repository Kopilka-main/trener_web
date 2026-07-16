import 'package:core/core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trener_trainer/api/local_workout.dart';

class _FakeStore implements KvStore {
  final Map<String, List<Map<String, dynamic>>> _d = {};
  @override
  Future<List<Map<String, dynamic>>?> readList(String k) async => _d[k];
  @override
  Future<void> writeList(String k, List<Map<String, dynamic>> v) async => _d[k] = v;
}

void main() {
  late _FakeStore store;
  late Outbox outbox;
  late LocalWorkoutController ctrl;
  setUp(() {
    store = _FakeStore();
    outbox = Outbox(store);
    ctrl = LocalWorkoutController(store, outbox);
  });

  LocalSet planned(int reps) => LocalSet(setIndex: 0, plannedReps: reps, plannedRestSec: 90);

  test('createFromPlan создаёт документ и грузится обратно', () async {
    final w = await ctrl.createFromPlan(
      clientId: 'cl1',
      name: 'Верх',
      plan: [(exerciseId: 'ex1', name: 'Жим', set: planned(10))],
    );
    expect(w.id, isNotEmpty);
    expect(w.exercises, hasLength(1));
    final again = await ctrl.load(w.id);
    expect(again?.name, 'Верх');
  });

  test('updateSet пишет факт и done', () async {
    final w = await ctrl.createFromPlan(
      clientId: 'cl1',
      name: 'В',
      plan: [(exerciseId: 'ex1', name: 'Жим', set: planned(10))],
    );
    await ctrl.updateSet(w, w.exercises.first.position, 0, actualReps: 9, done: true);
    final again = await ctrl.load(w.id);
    expect(again?.exercises.first.sets.first.actualReps, 9);
    expect(again?.exercises.first.sets.first.done, true);
  });

  test('complete → status completed + элемент в Outbox с idempotencyKey=id', () async {
    final w = await ctrl.createFromPlan(
      clientId: 'cl1',
      name: 'В',
      plan: [(exerciseId: 'ex1', name: 'Жим', set: planned(10))],
    );
    await ctrl.complete(w, durationSec: 1800);
    expect(w.status, 'completed');
    final q = await outbox.list();
    expect(q, hasLength(1));
    expect(q.first.kind, 'workout.import');
    final doc = (q.first.payload['doc'] as Map).cast<String, dynamic>();
    expect(doc['idempotencyKey'], w.id);
    expect(doc['status'], 'completed');
    expect(q.first.payload['clientId'], 'cl1');
  });

  test('индекс: createFromPlan → activeFor содержит; complete → пусто', () async {
    final w = await ctrl.createFromPlan(
      clientId: 'cl1',
      name: 'В',
      plan: [(exerciseId: 'ex1', name: 'Жим', set: planned(10))],
    );
    final active = await ctrl.activeFor('cl1');
    expect(active.map((e) => e.id), contains(w.id));
    // Индекс скоуплен по клиенту.
    expect(await ctrl.activeFor('cl2'), isEmpty);
    // Завершение убирает документ из индекса активных.
    await ctrl.complete(w, durationSec: 100);
    expect(await ctrl.activeFor('cl1'), isEmpty);
  });

  test('createFromPlan группирует подряд идущие записи одного exerciseId в один LocalExercise', () async {
    final w = await ctrl.createFromPlan(
      clientId: 'cl1',
      name: 'Верх',
      plan: [
        (exerciseId: 'ex1', name: 'Жим', set: planned(10)),
        (exerciseId: 'ex1', name: 'Жим', set: planned(8)),
      ],
    );
    expect(w.exercises, hasLength(1));
    expect(w.exercises.first.sets, hasLength(2));
    expect(w.exercises.first.sets[0].setIndex, 0);
    expect(w.exercises.first.sets[1].setIndex, 1);
    expect(w.exercises.first.sets[0].plannedReps, 10);
    expect(w.exercises.first.sets[1].plannedReps, 8);
  });

  test('toWorkout отражает документ для UI', () async {
    final w = await ctrl.createFromPlan(
      clientId: 'cl1',
      name: 'В',
      plan: [(exerciseId: 'ex1', name: 'Жим', set: planned(12))],
    );
    final ui = w.toWorkout();
    expect(ui.name, 'В');
    expect(ui.exercises.first.sets.first.plannedReps, 12);
  });
}
