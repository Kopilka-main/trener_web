import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

const Map<String, String> kAngleLabels = <String, String>{
  'front': 'Спереди',
  'side': 'Сбоку',
  'back': 'Сзади',
};

/// Фото прогресса клиента.
class ProgressPhoto {
  ProgressPhoto({required this.id, required this.date, required this.angle, required this.fileId, required this.note});
  final String id;
  final DateTime? date;
  final String angle;
  final String fileId;
  final String? note;

  factory ProgressPhoto.fromJson(Map<String, dynamic> j) {
    final Map<String, dynamic> f = (j['file'] as Map<String, dynamic>?) ?? <String, dynamic>{};
    return ProgressPhoto(
      id: j['id'] as String? ?? '',
      date: DateTime.tryParse(j['date'] as String? ?? ''),
      angle: j['angle'] as String? ?? 'front',
      fileId: f['id'] as String? ?? '',
      note: j['note'] as String?,
    );
  }
}

class ClientPhotosApi {
  ClientPhotosApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  Future<List<ProgressPhoto>> list() async {
    final Map<String, dynamic> r = await _api.getJson('/api/client/progress-photos');
    final List<ProgressPhoto> list = ((r['photos'] as List<dynamic>?) ?? <dynamic>[])
        .cast<Map<String, dynamic>>()
        .map(ProgressPhoto.fromJson)
        .toList();
    list.sort((ProgressPhoto a, ProgressPhoto b) => (b.date ?? DateTime(0)).compareTo(a.date ?? DateTime(0)));
    return list;
  }

  Future<void> upload({required String date, required String angle, required String filePath, required String fileName, String? note}) async {
    await _api.postForm(
      '/api/client/progress-photos',
      <String, String>{'date': date, 'angle': angle, if (note != null && note.isNotEmpty) 'note': note},
      fileField: 'photo',
      filePath: filePath,
      fileName: fileName,
    );
  }

  Future<void> delete(String id) async {
    await _api.deleteJson('/api/client/progress-photos/$id');
  }

  /// URL приватного фото (Bearer). [version] — для сброса кэша.
  String photoUrl(String fileId) {
    final String base = _ref.read(baseUrlProvider);
    final String b = base.endsWith('/') ? base.substring(0, base.length - 1) : base;
    return '$b/api/client/files/$fileId';
  }
}

final Provider<ClientPhotosApi> clientPhotosApiProvider =
    Provider<ClientPhotosApi>((ref) => ClientPhotosApi(ref));

final FutureProvider<List<ProgressPhoto>> clientPhotosProvider =
    FutureProvider<List<ProgressPhoto>>((ref) => ref.read(clientPhotosApiProvider).list());
