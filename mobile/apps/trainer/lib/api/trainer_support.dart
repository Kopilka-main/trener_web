import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Одно сообщение переписки с поддержкой.
/// `direction: "in"`  — сообщение пользователя (тренера), выравнивается справа;
/// `direction: "out"` — ответ поддержки, выравнивается слева.
class SupportMessage {
  SupportMessage({
    required this.id,
    required this.direction,
    required this.text,
    required this.createdAt,
  });

  final String id;
  final String direction;
  final String text;
  final DateTime createdAt;

  /// Наше собственное сообщение (обращение тренера).
  bool get isMine => direction == 'in';

  factory SupportMessage.fromJson(Map<String, dynamic> j) => SupportMessage(
        id: j['id'] as String? ?? '',
        direction: j['direction'] as String? ?? 'in',
        text: j['text'] as String? ?? '',
        createdAt:
            DateTime.tryParse(j['createdAt'] as String? ?? '')?.toLocal() ??
                DateTime.now(),
      );
}

/// Отправка обращения в поддержку и загрузка переписки из настроек приложения.
/// Бэкенд принимает `POST /api/support` с телом `{ "text": "<строка 1..5000>" }`
/// и отвечает `{ "ok": true }`; переписку отдаёт `GET /api/support/thread`
/// как `{ "messages": [...] }` (ASC по времени). Аутентификация тренера — через
/// общий [ApiClient].
class TrainerSupportApi {
  TrainerSupportApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  /// Отправить обращение. При ошибке пробрасывает исключение наверх.
  Future<void> send(String text) async {
    await _api.postJson('/api/support', <String, dynamic>{'text': text});
  }

  /// Загрузить переписку с поддержкой (сообщения по возрастанию времени).
  Future<List<SupportMessage>> thread() async {
    final Map<String, dynamic> r = await _api.getJson('/api/support/thread');
    final List<dynamic> raw = (r['messages'] as List<dynamic>?) ?? <dynamic>[];
    return raw
        .cast<Map<String, dynamic>>()
        .map(SupportMessage.fromJson)
        .toList();
  }
}

final Provider<TrainerSupportApi> trainerSupportApiProvider =
    Provider<TrainerSupportApi>((ref) => TrainerSupportApi(ref));
