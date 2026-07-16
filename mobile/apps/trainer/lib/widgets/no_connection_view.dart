import 'package:core/core.dart';
import 'package:flutter/material.dart';

/// Состояние «нет связи»: перечёркнутое облачко + «Нет связи» + опциональная
/// кнопка «Повторить». Замена нейтрального «Не удалось загрузить» в error:-ветках
/// `AsyncValue.when`, когда `isOfflineError(e)` — то есть сбой именно сетевой
/// (нет соединения с сервером), а не ответ сервера (404/500/валидация).
/// Нейтральные цвета — без красного (danger — только иконки severity/действия).
class NoConnectionView extends StatelessWidget {
  const NoConnectionView({super.key, this.onRetry});

  /// null → без кнопки (например, если раньше её тоже не было).
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(Icons.cloud_off_outlined, size: 40, color: c.inkMuted),
            const SizedBox(height: 12),
            Text('Нет связи', style: TextStyle(color: c.inkMuted)),
            if (onRetry != null) ...<Widget>[
              const SizedBox(height: 12),
              FilledButton(onPressed: onRetry, child: const Text('Повторить')),
            ],
          ],
        ),
      ),
    );
  }
}
