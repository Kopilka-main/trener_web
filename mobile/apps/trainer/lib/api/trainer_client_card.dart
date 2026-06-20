import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

DateTime? _dt(String? s) => s != null ? DateTime.tryParse(s)?.toLocal() : null;

/// Пакет/абонемент клиента.
class TPackage {
  TPackage({
    required this.workoutType,
    required this.lessonsPaid,
    required this.lessonsUsed,
    required this.endsAt,
    required this.status,
  });
  final String? workoutType;
  final int lessonsPaid;
  final int lessonsUsed;
  final String? endsAt;
  final String status;
  int get remaining => lessonsPaid - lessonsUsed;
  bool get isActive => status == 'active';

  factory TPackage.fromJson(Map<String, dynamic> j) => TPackage(
        workoutType: j['workoutType'] as String?,
        lessonsPaid: (j['lessonsPaid'] as num?)?.toInt() ?? 0,
        lessonsUsed: (j['lessonsUsed'] as num?)?.toInt() ?? 0,
        endsAt: j['endsAt'] as String?,
        status: j['status'] as String? ?? '',
      );
}

/// Тренировка клиента (срез для карточки).
class TWorkout {
  TWorkout({required this.id, required this.name, required this.status, required this.completedAt, required this.exerciseCount, required this.createdByClient});
  final String id;
  final String name;
  final String status;
  final DateTime? completedAt;
  final int exerciseCount;
  final bool createdByClient;

  factory TWorkout.fromJson(Map<String, dynamic> j) => TWorkout(
        id: j['id'] as String? ?? '',
        name: (j['name'] as String? ?? '').trim().isNotEmpty ? j['name'] as String : 'Тренировка',
        status: j['status'] as String? ?? '',
        completedAt: _dt(j['completedAt'] as String?),
        exerciseCount: ((j['exercises'] as List<dynamic>?) ?? <dynamic>[]).length,
        createdByClient: j['createdByClient'] as bool? ?? false,
      );
}

/// Замер клиента.
class TMeasurement {
  TMeasurement({required this.date, required this.weightKg, required this.bodyFatPct, required this.metrics, required this.note});
  final DateTime? date;
  final num? weightKg;
  final num? bodyFatPct;
  final Map<String, num> metrics; // обхваты, см
  final String? note;

  factory TMeasurement.fromJson(Map<String, dynamic> j) {
    final Map<String, num> m = <String, num>{};
    const Map<String, String> fields = <String, String>{
      'bicepsCm': 'Бицепс', 'chestCm': 'Грудь', 'underbustCm': 'Под грудью',
      'waistCm': 'Талия', 'bellyCm': 'Живот', 'glutesCm': 'Ягодицы',
      'hipsCm': 'Бёдра', 'thighCm': 'Бедро', 'calfCm': 'Голень',
    };
    for (final MapEntry<String, String> e in fields.entries) {
      final num? v = j[e.key] as num?;
      if (v != null) m[e.value] = v;
    }
    return TMeasurement(
      date: _dt(j['date'] as String?),
      weightKg: j['weightKg'] as num?,
      bodyFatPct: j['bodyFatPct'] as num?,
      metrics: m,
      note: j['note'] as String?,
    );
  }
}

class TrainerClientCardApi {
  TrainerClientCardApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<List<TPackage>> packages(String clientId) async {
    final Map<String, dynamic> r = await _api.getJson('/api/clients/$clientId/packages');
    return ((r['packages'] as List<dynamic>?) ?? <dynamic>[]).cast<Map<String, dynamic>>().map(TPackage.fromJson).toList();
  }

  Future<List<TWorkout>> workouts(String clientId) async {
    final Map<String, dynamic> r = await _api.getJson('/api/clients/$clientId/workouts');
    final List<TWorkout> list = ((r['workouts'] as List<dynamic>?) ?? <dynamic>[])
        .cast<Map<String, dynamic>>().map(TWorkout.fromJson).toList();
    list.sort((TWorkout a, TWorkout b) =>
        (b.completedAt ?? DateTime(0)).compareTo(a.completedAt ?? DateTime(0)));
    return list;
  }

  Future<List<TMeasurement>> measurements(String clientId) async {
    final Map<String, dynamic> r = await _api.getJson('/api/clients/$clientId/measurements');
    final List<TMeasurement> list = ((r['measurements'] as List<dynamic>?) ?? <dynamic>[])
        .cast<Map<String, dynamic>>().map(TMeasurement.fromJson).toList();
    list.sort((TMeasurement a, TMeasurement b) =>
        (b.date ?? DateTime(0)).compareTo(a.date ?? DateTime(0)));
    return list;
  }

  /// Запросить у клиента замеры (создать задачу).
  Future<void> requestMeasurements(String clientId, String? note) async {
    await _api.postJson('/api/clients/$clientId/measurement-tasks', <String, dynamic>{'note': ?note});
  }
}

final Provider<TrainerClientCardApi> trainerClientCardApiProvider =
    Provider<TrainerClientCardApi>((ref) => TrainerClientCardApi(ref));

final FutureProviderFamily<List<TPackage>, String> clientPackagesProvider =
    FutureProvider.family<List<TPackage>, String>((ref, String id) => ref.read(trainerClientCardApiProvider).packages(id));

final FutureProviderFamily<List<TWorkout>, String> clientWorkoutsCardProvider =
    FutureProvider.family<List<TWorkout>, String>((ref, String id) => ref.read(trainerClientCardApiProvider).workouts(id));

final FutureProviderFamily<List<TMeasurement>, String> clientMeasurementsProvider =
    FutureProvider.family<List<TMeasurement>, String>((ref, String id) => ref.read(trainerClientCardApiProvider).measurements(id));
