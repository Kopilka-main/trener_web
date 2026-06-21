import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Запись медкарты клиента (заметка + опциональный файл).
class MedicalRecord {
  MedicalRecord({
    required this.id,
    required this.date,
    required this.note,
    required this.fileName,
    required this.fileMime,
  });
  final String id;
  final DateTime? date;
  final String note;
  final String? fileName;
  final String? fileMime;

  bool get hasFile => fileMime != null;
  bool get isImage => (fileMime ?? '').startsWith('image/');

  factory MedicalRecord.fromJson(Map<String, dynamic> j) {
    final Map<String, dynamic>? f = j['file'] as Map<String, dynamic>?;
    final String? d = j['date'] as String?;
    return MedicalRecord(
      id: j['id'] as String? ?? '',
      date: d != null ? DateTime.tryParse(d) : null,
      note: j['note'] as String? ?? '',
      fileName: f?['originalName'] as String?,
      fileMime: f?['mime'] as String?,
    );
  }
}

class TrainerMedicalApi {
  TrainerMedicalApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<List<MedicalRecord>> list(String clientId) async {
    final Map<String, dynamic> r = await _api.getJson('/api/clients/$clientId/medical');
    final List<MedicalRecord> list = ((r['records'] as List<dynamic>?) ?? <dynamic>[])
        .cast<Map<String, dynamic>>()
        .map(MedicalRecord.fromJson)
        .toList();
    list.sort((MedicalRecord a, MedicalRecord b) =>
        (b.date ?? DateTime(0)).compareTo(a.date ?? DateTime(0)));
    return list;
  }

  /// Создать заметку (multipart: date + note; файл — опционально).
  Future<void> create(String clientId, {required String date, required String note, String? filePath, String? fileName}) async {
    await _api.postForm(
      '/api/clients/$clientId/medical',
      <String, String>{'date': date, 'note': note},
      fileField: filePath != null ? 'file' : null,
      filePath: filePath,
      fileName: fileName,
    );
  }

  Future<void> delete(String clientId, String recordId) async {
    await _api.deleteJson('/api/clients/$clientId/medical/$recordId');
  }
}

final Provider<TrainerMedicalApi> trainerMedicalApiProvider =
    Provider<TrainerMedicalApi>((ref) => TrainerMedicalApi(ref));

final FutureProviderFamily<List<MedicalRecord>, String> clientMedicalProvider =
    FutureProvider.family<List<MedicalRecord>, String>(
        (ref, String id) => ref.read(trainerMedicalApiProvider).list(id));
