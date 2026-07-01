import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

DateTime? _dt(String? s) => s != null ? DateTime.tryParse(s)?.toLocal() : null;

/// Один платёж графика рассрочки.
class TInstallment {
  TInstallment({
    required this.id,
    required this.dueDate,
    required this.amount,
    required this.status,
    required this.paidAt,
  });
  final String id;
  final String dueDate; // "YYYY-MM-DD"
  final num amount;
  final String status; // pending | paid
  final String? paidAt; // "YYYY-MM-DD" | null
  bool get isPaid => status == 'paid';

  factory TInstallment.fromJson(Map<String, dynamic> j) => TInstallment(
        id: j['id'] as String? ?? '',
        dueDate: j['dueDate'] as String? ?? '',
        amount: (j['amount'] as num?) ?? 0,
        status: j['status'] as String? ?? 'pending',
        paidAt: j['paidAt'] as String?,
      );
}

/// Пакет/абонемент клиента.
class TPackage {
  TPackage({
    required this.id,
    required this.workoutType,
    required this.lessonsPaid,
    required this.lessonsUsed,
    required this.endsAt,
    required this.status,
    required this.isInstallment,
    required this.installments,
  });
  final String id;
  final String? workoutType;
  final int lessonsPaid;
  final int lessonsUsed;
  final String? endsAt;
  final String status;
  final bool isInstallment;
  final List<TInstallment> installments;
  int get remaining => lessonsPaid - lessonsUsed;
  bool get isActive => status == 'active';

  /// Сумма оплаченных платежей рассрочки.
  num get paidSum => installments.where((TInstallment i) => i.isPaid).fold<num>(0, (num s, TInstallment i) => s + i.amount);

  /// Сумма всех платежей графика.
  num get totalSum => installments.fold<num>(0, (num s, TInstallment i) => s + i.amount);

  /// Остаток к оплате.
  num get dueSum => totalSum - paidSum;

  int get paidCount => installments.where((TInstallment i) => i.isPaid).length;

  /// Ближайший неоплаченный платёж (по дате).
  TInstallment? get nextDue {
    final List<TInstallment> pending = installments.where((TInstallment i) => !i.isPaid).toList()
      ..sort((TInstallment a, TInstallment b) => a.dueDate.compareTo(b.dueDate));
    return pending.isEmpty ? null : pending.first;
  }

  factory TPackage.fromJson(Map<String, dynamic> j) => TPackage(
        id: j['id'] as String? ?? '',
        workoutType: j['workoutType'] as String?,
        lessonsPaid: (j['lessonsPaid'] as num?)?.toInt() ?? 0,
        lessonsUsed: (j['lessonsUsed'] as num?)?.toInt() ?? 0,
        endsAt: j['endsAt'] as String?,
        status: j['status'] as String? ?? '',
        isInstallment: j['isInstallment'] as bool? ?? false,
        installments: ((j['installments'] as List<dynamic>?) ?? <dynamic>[])
            .cast<Map<String, dynamic>>()
            .map(TInstallment.fromJson)
            .toList(),
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

  /// Добавить пакет/абонемент клиенту.
  ///
  /// Если [installments] непустой — создаётся пакет в рассрочку
  /// (пары {dueDate, amount}); сервер сам пересчитывает totalPaid.
  Future<void> createPackage(
    String clientId, {
    required int lessonsPaid,
    required num totalPaid,
    String? workoutType,
    required String startsAt,
    String? endsAt,
    List<Map<String, dynamic>>? installments,
  }) async {
    final bool asInstallment = installments != null && installments.isNotEmpty;
    await _api.postJson('/api/clients/$clientId/packages', <String, dynamic>{
      'kind': 'package',
      'lessonsPaid': lessonsPaid,
      'pricePerLesson': lessonsPaid > 0 ? (totalPaid / lessonsPaid) : 0,
      'totalPaid': totalPaid,
      'workoutType': (workoutType == null || workoutType.trim().isEmpty) ? null : workoutType.trim(),
      'startsAt': startsAt,
      'endsAt': (endsAt == null || endsAt.isEmpty) ? null : endsAt,
      if (asInstallment) 'isInstallment': true,
      if (asInstallment) 'installments': installments,
    });
  }

  /// Отметить платёж рассрочки оплаченным (с этого момента — доход).
  Future<void> payInstallment(String clientId, String packageId, String installmentId) async {
    await _api.postJson(
        '/api/clients/$clientId/packages/$packageId/installments/$installmentId/pay', <String, dynamic>{});
  }

  /// Снять отметку об оплате платежа рассрочки.
  Future<void> unpayInstallment(String clientId, String packageId, String installmentId) async {
    await _api.postJson(
        '/api/clients/$clientId/packages/$packageId/installments/$installmentId/unpay', <String, dynamic>{});
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

/// Порядок поз для сортировки внутри одной даты: спереди → сбоку → сзади.
const Map<String, int> kClientPhotoAngleOrder = <String, int>{'front': 0, 'side': 1, 'back': 2};

/// Фото прогресса клиента (просмотр тренером).
class TClientPhoto {
  TClientPhoto({required this.id, required this.date, required this.angle, required this.fileId});
  final String id;
  final DateTime? date;
  final String angle;
  final String fileId;
  factory TClientPhoto.fromJson(Map<String, dynamic> j) {
    final Map<String, dynamic> f = (j['file'] as Map<String, dynamic>?) ?? <String, dynamic>{};
    return TClientPhoto(
      id: j['id'] as String? ?? '',
      date: _dt(j['date'] as String?),
      angle: j['angle'] as String? ?? 'front',
      fileId: f['id'] as String? ?? '',
    );
  }
}

final FutureProviderFamily<List<TClientPhoto>, String> clientPhotosCardProvider =
    FutureProvider.family<List<TClientPhoto>, String>((ref, String id) async {
  final Map<String, dynamic> r = await ref.read(apiClientProvider).getJson('/api/clients/$id/progress-photos');
  final List<TClientPhoto> list = ((r['photos'] as List<dynamic>?) ?? <dynamic>[])
      .cast<Map<String, dynamic>>()
      .map(TClientPhoto.fromJson)
      .toList();
  // Новые даты сверху; внутри одной даты — спереди → сбоку → сзади.
  list.sort((TClientPhoto a, TClientPhoto b) {
    final int byDate = (b.date ?? DateTime(0)).compareTo(a.date ?? DateTime(0));
    if (byDate != 0) return byDate;
    return (kClientPhotoAngleOrder[a.angle] ?? 99).compareTo(kClientPhotoAngleOrder[b.angle] ?? 99);
  });
  return list;
});
