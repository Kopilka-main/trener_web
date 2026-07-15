import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_review/in_app_review.dart';

import '../storage/local_json_store.dart';
import '../theme/app_theme.dart';

/// Ключ хранилища состояния оценки приложения (LocalJsonStore хранит только
/// списки, поэтому состояние — список из одного элемента-карты).
const String _kStoreKey = 'app_review';

/// Сервис «Оцените приложение»: троттлинг авто-промпта после позитивных
/// событий (успешная тренировка/подтверждение) + ручной вызов из «Помощи».
/// Показ системного ревью — через плагин `in_app_review`; если он недоступен
/// (нет Google Play/App Store на устройстве), ошибки молча проглатываются.
class AppReviewService {
  /// Прочитать сохранённое состояние (или пустую карту, если ещё не было).
  Future<Map<String, dynamic>> _readState() async {
    final List<Map<String, dynamic>>? list = await LocalJsonStore.instance.readList(_kStoreKey);
    if (list == null || list.isEmpty) return <String, dynamic>{};
    return Map<String, dynamic>.from(list.first);
  }

  Future<void> _writeState(Map<String, dynamic> state) async {
    await LocalJsonStore.instance.writeList(_kStoreKey, <Map<String, dynamic>>[state]);
  }

  /// Вызывается после успешного позитивного события (завершение тренировки,
  /// подтверждение занятия и т.п.). Считает успехи и — если пороги пройдены —
  /// показывает pre-prompt диалог перед системным окном оценки.
  Future<void> maybePromptAfterSuccess(
    BuildContext context, {
    required Future<void> Function(BuildContext) onNegative,
  }) async {
    final Map<String, dynamic> state = await _readState();

    // Первый запуск сервиса — фиксируем дату установки (для порога «не раньше
    // N дней с начала использования»).
    if (state['installedAt'] == null) {
      state['installedAt'] = DateTime.now().toIso8601String();
      await _writeState(state);
    }

    // Уже оценили — больше не спрашиваем.
    if (state['rated'] == true) return;

    final int successCount = (state['successCount'] as int? ?? 0) + 1;
    state['successCount'] = successCount;
    await _writeState(state);

    final DateTime installedAt = DateTime.parse(state['installedAt'] as String);
    final DateTime now = DateTime.now();
    final String? lastAskedAtRaw = state['lastAskedAt'] as String?;
    final DateTime? lastAskedAt = lastAskedAtRaw == null ? null : DateTime.parse(lastAskedAtRaw);

    final bool eligible = successCount >= 3 &&
        now.difference(installedAt).inDays >= 3 &&
        (lastAskedAt == null || now.difference(lastAskedAt).inDays >= 90);
    if (!eligible) return;

    state['lastAskedAt'] = now.toIso8601String();
    await _writeState(state);

    if (!context.mounted) return;
    await _showPrePromptDialog(context, onNegative: onNegative);
  }

  /// Pre-prompt: сперва спрашиваем настроение мягко, системное окно оценки
  /// показываем только тем, кто ответил положительно (не тратим лимит
  /// системных запросов на недовольных пользователей).
  Future<void> _showPrePromptDialog(
    BuildContext context, {
    required Future<void> Function(BuildContext) onNegative,
  }) async {
    final AppColors c = context.colors;
    await showDialog<void>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        backgroundColor: c.card,
        title: Text('Нравится приложение?', style: TextStyle(color: c.ink)),
        content: Text(
          'Оцените нас — это помогает развивать приложение',
          style: TextStyle(color: c.inkMuted),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              await onNegative(context);
            },
            child: const Text('Не очень'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              await _markRatedAndRequestReview();
            },
            child: const Text('Да, нравится'),
          ),
        ],
      ),
    );
  }

  Future<void> _markRatedAndRequestReview() async {
    final Map<String, dynamic> state = await _readState();
    state['rated'] = true;
    await _writeState(state);
    try {
      final InAppReview review = InAppReview.instance;
      if (await review.isAvailable()) {
        await review.requestReview();
      }
    } catch (_) {
      // плагин/сторы недоступны — молча игнорируем
    }
  }

  /// Ручной вызов из «Помощи»: открыть карточку приложения в сторе. На
  /// Android `appStoreId` не нужен (плагин находит по package name), на iOS —
  /// нужен App Store ID (если пуст, всё равно пробуем — ошибку проглатываем).
  Future<void> openStoreListing(BuildContext context, {String? appStoreId}) async {
    final Map<String, dynamic> state = await _readState();
    state['rated'] = true;
    await _writeState(state);
    try {
      await InAppReview.instance.openStoreListing(appStoreId: appStoreId ?? '');
    } catch (_) {
      // нет доступа к стору — молча игнорируем
    }
  }
}

/// Провайдер сервиса «Оцените приложение» (без состояния — хранение в
/// LocalJsonStore, как и другие локальные кэши core).
final Provider<AppReviewService> appReviewServiceProvider =
    Provider<AppReviewService>((Ref ref) => AppReviewService());
