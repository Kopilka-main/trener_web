import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/offline_providers.dart';

/// Маленький плавающий индикатор статуса: перечёркнутое облачко + число правок,
/// ждущих отправки (число только когда очередь не пуста). Скрыт, когда онлайн и
/// очередь пуста. Размещается абсолютно (в [Positioned] поверх контента) — НЕ
/// занимает место в layout и не сдвигает интерфейс. [IgnorePointer] пропускает
/// тапы под ним (например по AppBar), поэтому он ничего не перекрывает.
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final bool online = ref.watch(isOnlineProvider).valueOrNull ?? true;
    final int pending = ref.watch(syncStatusProvider).valueOrNull ?? 0;

    if (online && pending == 0) return const SizedBox.shrink();

    return IgnorePointer(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(Icons.cloud_off_outlined, size: 15, color: c.inkMuted),
          if (pending > 0) ...<Widget>[
            const SizedBox(width: 4),
            Text('$pending',
                style: AppFonts.mono(size: 11, color: c.inkMuted, weight: FontWeight.w700)),
          ],
        ],
      ),
    );
  }
}
