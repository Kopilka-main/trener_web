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
    this.attachmentFileId,
    this.attachmentKind,
    this.attachmentName,
  });

  final String id;
  final String direction;
  final String text;
  final DateTime createdAt;

  /// Опциональное вложение сообщения (картинка или файл).
  final String? attachmentFileId;
  final String? attachmentKind; // 'image' | 'file'
  final String? attachmentName;

  /// Наше собственное сообщение (обращение тренера).
  bool get isMine => direction == 'in';

  /// К сообщению приложена картинка (показываем миниатюрой).
  bool get hasImage =>
      attachmentKind == 'image' && (attachmentFileId?.isNotEmpty ?? false);

  /// К сообщению приложен файл (показываем чипом с именем).
  bool get hasFile =>
      attachmentKind == 'file' && (attachmentFileId?.isNotEmpty ?? false);

  factory SupportMessage.fromJson(Map<String, dynamic> j) {
    final Map<String, dynamic>? att = j['attachment'] as Map<String, dynamic>?;
    return SupportMessage(
      id: j['id'] as String? ?? '',
      direction: j['direction'] as String? ?? 'in',
      text: j['text'] as String? ?? '',
      createdAt:
          DateTime.tryParse(j['createdAt'] as String? ?? '')?.toLocal() ??
              DateTime.now(),
      attachmentFileId: att?['fileId'] as String?,
      attachmentKind: att?['kind'] as String?,
      attachmentName: att?['name'] as String?,
    );
  }
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

  /// Отправить вложение (картинку или файл) с опциональной подписью.
  /// [kind] — 'image' | 'file'. При ошибке пробрасывает исключение наверх.
  Future<void> sendAttachment({
    required String filePath,
    required String fileName,
    required String kind,
    String? caption,
  }) async {
    await _api.postForm(
      '/api/support/attachment',
      <String, String>{
        'kind': kind,
        if (caption != null && caption.isNotEmpty) 'caption': caption,
      },
      fileField: 'file',
      filePath: filePath,
      fileName: fileName,
    );
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
