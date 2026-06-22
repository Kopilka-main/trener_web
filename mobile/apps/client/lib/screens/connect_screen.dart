import 'dart:async';

import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../api/client_auth.dart';
import '../widgets/auth_form.dart';

/// Подключение к тренеру: клиент показывает свой код (id аккаунта) + QR и
/// передаёт тренеру. Экран сам сменится на приложение после привязки (поллинг /me).
class ConnectScreen extends ConsumerStatefulWidget {
  const ConnectScreen({super.key});

  @override
  ConsumerState<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends ConsumerState<ConnectScreen> {
  bool _copied = false;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _copy(String code) {
    // Сбой буфера проглатываем (UX-оптимистично: всё равно показываем «Скопировано»).
    unawaited(Clipboard.setData(ClipboardData(text: code)).catchError((Object _) {}));
    _timer?.cancel();
    setState(() => _copied = true);
    _timer = Timer(const Duration(milliseconds: 1500), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final AsyncValue<ClientAccount> me = ref.watch(clientMeProvider);
    return Scaffold(
      body: SafeArea(
        child: me.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (Object e, _) =>
              Center(child: Text('Не удалось загрузить код', style: TextStyle(color: c.inkMuted))),
          data: (ClientAccount acc) => Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
                children: <Widget>[
                  Text('Подключение',
                      textAlign: TextAlign.center,
                      style: AppFonts.display(size: 28, color: c.accent, height: 1.05)),
                  const SizedBox(height: 16),
                  Text(
                    'Передай этот код тренеру — он подключит тебя, и появятся назначенные '
                    'тренировки. Можно продолжить и заниматься самостоятельно.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 14, color: c.inkMuted, height: 1.35),
                  ),
                  const SizedBox(height: 24),
                  // QR на тёмной подложке (значение = код = id аккаунта).
                  Center(
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: c.ink,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: QrImageView(
                        data: acc.id,
                        version: QrVersions.auto,
                        size: 180,
                        backgroundColor: const Color(0xFFEEEEE8),
                        eyeStyle: const QrEyeStyle(
                            eyeShape: QrEyeShape.square, color: Color(0xFF0B0C10)),
                        dataModuleStyle: const QrDataModuleStyle(
                            dataModuleShape: QrDataModuleShape.square, color: Color(0xFF0B0C10)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  // Кнопка-код + подсказка.
                  GestureDetector(
                    onTap: () => _copy(acc.id),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: c.chip,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: c.line),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: <Widget>[
                          Flexible(
                            child: Text(acc.id,
                                textAlign: TextAlign.center,
                                style: AppFonts.mono(size: 14, color: c.ink, weight: FontWeight.w600)),
                          ),
                          const SizedBox(width: 8),
                          Icon(_copied ? Icons.check : Icons.copy,
                              size: 16, color: _copied ? c.accent : c.inkMuted),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(_copied ? 'Скопировано' : 'Нажми, чтобы скопировать',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: c.inkMuted)),
                  const SizedBox(height: 24),
                  AuthPrimaryButton(
                    label: 'Продолжить',
                    busyLabel: 'Продолжить',
                    busy: false,
                    onPressed: () => context.go('/home'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
