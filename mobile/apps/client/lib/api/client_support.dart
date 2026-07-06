import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Сообщение в переписке с поддержкой приложения.
/// direction: 'in' — обращение пользователя, 'out' — ответ поддержки.
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

  bool get isOutgoing => direction == 'in';

  factory SupportMessage.fromJson(Map<String, dynamic> j) => SupportMessage(
        id: j['id'] as String? ?? '',
        direction: j['direction'] as String? ?? 'in',
        text: j['text'] as String? ?? '',
        createdAt: DateTime.tryParse(j['createdAt'] as String? ?? '')?.toLocal() ??
            DateTime.fromMillisecondsSinceEpoch(0),
      );

  static List<SupportMessage> listFrom(dynamic raw) =>
      ((raw as List<dynamic>?) ?? <dynamic>[])
          .cast<Map<String, dynamic>>()
          .map(SupportMessage.fromJson)
          .toList();
}

/// Обращение клиента в поддержку приложения и переписка с ней.
/// POST /api/client-app/support с телом {'text': ...} → {'ok': true}.
/// GET  /api/client-app/support/thread → {'messages': [...]} (ASC).
/// Аутентификация обеспечивается общим [ApiClient] (куки/токен).
class ClientSupportApi {
  ClientSupportApi(this._ref);
  final Ref _ref;
  ApiClient get _api => _ref.read(apiClientProvider);

  /// Отправить обращение (текст 1..5000 символов). Исключение пробрасываем наверх.
  Future<void> send(String text) async {
    await _api.postJson('/api/client-app/support', <String, dynamic>{'text': text});
  }

  /// Переписка с поддержкой в хронологическом порядке (ASC). Исключение
  /// пробрасываем наверх — экран покажет подсказку/повтор.
  Future<List<SupportMessage>> thread() async {
    final Map<String, dynamic> r = await _api.getJson('/api/client-app/support/thread');
    return SupportMessage.listFrom(r['messages']);
  }
}

final Provider<ClientSupportApi> clientSupportApiProvider =
    Provider<ClientSupportApi>((ref) => ClientSupportApi(ref));
