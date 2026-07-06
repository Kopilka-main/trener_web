import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Отправка обращения в поддержку из настроек приложения.
/// Бэкенд принимает `POST /api/support` с телом `{ "text": "<строка 1..5000>" }`
/// и отвечает `{ "ok": true }`. Аутентификация тренера — через общий [ApiClient].
class TrainerSupportApi {
  TrainerSupportApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  /// Отправить обращение. При ошибке пробрасывает исключение наверх.
  Future<void> send(String text) async {
    await _api.postJson('/api/support', <String, dynamic>{'text': text});
  }
}

final Provider<TrainerSupportApi> trainerSupportApiProvider =
    Provider<TrainerSupportApi>((ref) => TrainerSupportApi(ref));
