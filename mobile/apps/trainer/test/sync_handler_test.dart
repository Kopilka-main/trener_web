import 'package:core/core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trener_trainer/api/offline_providers.dart';

void main() {
  test('workoutImportHandler зовёт sender с clientId и doc', () async {
    String? gotClient;
    Map<String, dynamic>? gotDoc;
    final handler = makeWorkoutImportHandler((clientId, doc) async {
      gotClient = clientId;
      gotDoc = doc;
    });
    final item = OutboxItem(
      id: 'i1',
      kind: 'workout.import',
      createdAt: 0,
      payload: {
        'clientId': 'cl1',
        'doc': {'idempotencyKey': 'w1', 'status': 'completed'},
      },
    );
    await handler(item);
    expect(gotClient, 'cl1');
    expect(gotDoc?['idempotencyKey'], 'w1');
  });
}
