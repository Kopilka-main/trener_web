import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/offline_providers.dart';

/// Тонкая полоса статуса связи/синка. Скрыта, когда онлайн и очередь пуста.
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final bool online = ref.watch(isOnlineProvider).valueOrNull ?? true;
    final int pending = ref.watch(syncStatusProvider).valueOrNull ?? 0;

    if (online && pending == 0) return const SizedBox.shrink();

    final (IconData icon, String text, Color bg) = online
        ? (Icons.sync, 'Синхронизация… ($pending)', c.chip)
        : (
            Icons.cloud_off_outlined,
            pending > 0
                ? 'Офлайн — $pending изменений отправятся при связи'
                : 'Офлайн — изменения сохранятся и отправятся при связи',
            c.chip
          );

    // Отступ сверху под системную область (статус-бар), чтобы полоса не пряталась
    // за ним; когда баннер скрыт (выше) — отступ не добавляется.
    return SafeArea(
      bottom: false,
      child: Container(
        width: double.infinity,
        color: bg,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        child: Row(
          children: <Widget>[
            Icon(icon, size: 16, color: c.inkMuted),
            const SizedBox(width: 8),
            Expanded(
              child: Text(text,
                  style: TextStyle(fontSize: 12, color: c.inkMuted, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }
}
