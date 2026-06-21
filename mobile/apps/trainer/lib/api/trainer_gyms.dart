import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Зал (для привязки расходов и аренды).
class Gym {
  Gym({required this.id, required this.name, required this.monthlyRent, required this.note});
  final String id;
  final String name;
  final num? monthlyRent;
  final String? note;

  factory Gym.fromJson(Map<String, dynamic> j) => Gym(
        id: j['id'] as String? ?? '',
        name: j['name'] as String? ?? '',
        monthlyRent: j['monthlyRent'] as num?,
        note: j['note'] as String?,
      );
}

class TrainerGymsApi {
  TrainerGymsApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<List<Gym>> list() async {
    final Map<String, dynamic> r = await _api.getJson('/api/gyms');
    return ((r['gyms'] as List<dynamic>?) ?? <dynamic>[])
        .cast<Map<String, dynamic>>()
        .map(Gym.fromJson)
        .toList();
  }

  Future<void> create({required String name, num? monthlyRent, String? note}) async {
    await _api.postJson('/api/gyms', <String, dynamic>{
      'name': name,
      'monthlyRent': ?monthlyRent,
      'note': (note == null || note.isEmpty) ? null : note,
    });
  }

  Future<void> delete(String id) async {
    await _api.deleteJson('/api/gyms/$id');
  }
}

final Provider<TrainerGymsApi> trainerGymsApiProvider =
    Provider<TrainerGymsApi>((ref) => TrainerGymsApi(ref));

final FutureProvider<List<Gym>> trainerGymsProvider =
    FutureProvider<List<Gym>>((ref) => ref.read(trainerGymsApiProvider).list());
