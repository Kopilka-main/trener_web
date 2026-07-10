import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Описание метрики замера: ключ поля API, подпись, единица.
class MetricDef {
  const MetricDef(this.key, this.label, this.unit);
  final String key;
  final String label;
  final String unit;
}

const List<MetricDef> kMetrics = <MetricDef>[
  MetricDef('weightKg', 'Вес', 'кг'),
  MetricDef('bodyFatPct', '% жира', '%'),
  MetricDef('bicepsCm', 'Бицепс', 'см'),
  MetricDef('chestCm', 'Грудь', 'см'),
  MetricDef('underbustCm', 'Под грудью', 'см'),
  MetricDef('waistCm', 'Талия', 'см'),
  MetricDef('bellyCm', 'Живот', 'см'),
  MetricDef('glutesCm', 'Ягодицы', 'см'),
  MetricDef('hipsCm', 'Бёдра', 'см'),
  MetricDef('thighCm', 'Бедро', 'см'),
  MetricDef('calfCm', 'Голень', 'см'),
];

/// Замер тела клиента.
class Measurement {
  Measurement({required this.id, required this.date, required this.values, required this.note, required this.createdByClient});
  final String id;
  final DateTime? date;
  final Map<String, num> values; // ключ метрики → значение
  final String? note;
  final bool createdByClient; // true = добавил клиент (вы), false = тренер

  num? value(String key) => values[key];

  factory Measurement.fromJson(Map<String, dynamic> j) {
    final Map<String, num> v = <String, num>{};
    for (final MetricDef m in kMetrics) {
      final num? n = j[m.key] as num?;
      if (n != null) v[m.key] = n;
    }
    return Measurement(
      id: j['id'] as String? ?? '',
      date: DateTime.tryParse(j['date'] as String? ?? ''),
      values: v,
      note: j['note'] as String?,
      createdByClient: (j['createdByClient'] as bool?) ?? false,
    );
  }
}

class ClientMeasurementsApi {
  ClientMeasurementsApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<List<Measurement>> list() async {
    final Map<String, dynamic> r = await _api.getJson('/api/client/measurements');
    final List<Measurement> list = ((r['measurements'] as List<dynamic>?) ?? <dynamic>[])
        .cast<Map<String, dynamic>>()
        .map(Measurement.fromJson)
        .toList();
    list.sort((Measurement a, Measurement b) => (a.date ?? DateTime(0)).compareTo(b.date ?? DateTime(0)));
    return list;
  }

  Future<void> create(Map<String, dynamic> body) async {
    await _api.postJson('/api/client/measurements', body);
  }

  /// Частичное обновление замера. Поля передаём явно (включая null,
  /// чтобы очистить значение на сервере) — см. UpdateMeasurementRequest.
  Future<void> update(String id, Map<String, dynamic> body) async {
    await _api.patchJson('/api/client/measurements/$id', body);
  }

  Future<void> delete(String id) async {
    await _api.deleteJson('/api/client/measurements/$id');
  }
}

final Provider<ClientMeasurementsApi> clientMeasurementsApiProvider =
    Provider<ClientMeasurementsApi>((ref) => ClientMeasurementsApi(ref));

final FutureProvider<List<Measurement>> clientMeasurementsProvider =
    FutureProvider<List<Measurement>>((ref) => ref.read(clientMeasurementsApiProvider).list());
