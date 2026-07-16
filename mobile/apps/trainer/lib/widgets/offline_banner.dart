import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/offline_providers.dart';

/// Маленький плавающий ярлык статуса связи/синка: «офлайн (N)» без сети или
/// «синхр. (N)» при сливе очереди онлайн. Скрыт, когда онлайн и очередь пуста.
/// Размещается абсолютно (в [Positioned] поверх контента) — НЕ занимает место в
/// layout и не сдвигает интерфейс. [IgnorePointer] пропускает тапы под ярлыком
/// (например по AppBar), поэтому он ничего не перекрывает функционально.
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final bool online = ref.watch(isOnlineProvider).valueOrNull ?? true;
    final int pending = ref.watch(syncStatusProvider).valueOrNull ?? 0;

    if (online && pending == 0) return const SizedBox.shrink();

    final String count = pending > 0 ? ' ($pending)' : '';
    final (IconData icon, String text) =
        online ? (Icons.sync, 'синхр.$count') : (Icons.cloud_off_outlined, 'офлайн$count');

    return IgnorePointer(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: c.card.withValues(alpha: 0.92),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: c.line),
          boxShadow: <BoxShadow>[
            BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 8, offset: const Offset(0, 2)),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 13, color: c.inkMuted),
            const SizedBox(width: 5),
            Text(text,
                style: TextStyle(fontSize: 11, color: c.inkMuted, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
