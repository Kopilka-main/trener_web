import 'dart:async';

import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../api/client_auth.dart';
import '../widgets/auth_form.dart';

/// Deep-ссылка на привязку клиента в тренерском приложении (та же, что на экране
/// «Подключение», см. connect_screen.dart): тренер сканирует QR камерой →
/// app.fitbond.ru предложит создать клиента.
String _linkFor(String accountId) => 'https://app.fitbond.ru/link/$accountId';

/// Онбординг-экран, который показывается ОДИН раз сразу после регистрации:
/// полноэкранный QR + ID клиента, чтобы передать код тренеру. По «Готово» —
/// [onDone] (снимает флаг, экран больше не появляется).
class OnboardingQrScreen extends ConsumerWidget {
  const OnboardingQrScreen({super.key, required this.onDone});

  final VoidCallback onDone;

  void _copy(BuildContext context, String id) {
    // Сбой буфера проглатываем (UX-оптимистично: всё равно показываем «Скопировано»).
    unawaited(Clipboard.setData(ClipboardData(text: id)).catchError((Object _) {}));
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Скопировано')));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<ClientAccount> me = ref.watch(clientMeProvider);
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: me.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          // На ошибке профиля код показать нечем — оставляем текст и кнопку «Готово».
          error: (Object e, _) => _Frame(
            onDone: onDone,
            child: Center(
              child: Text(
                'Вы зарегистрированы. Ваш код можно показать тренеру позже — на экране «Подключение».',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: c.inkMuted, height: 1.4),
              ),
            ),
          ),
          data: (ClientAccount acc) => _Frame(
            onDone: onDone,
            child: _content(context, c, acc),
          ),
        ),
      ),
    );
  }

  Widget _content(BuildContext context, AppColors c, ClientAccount acc) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text('Готово!',
            textAlign: TextAlign.center,
            style: AppFonts.display(size: 28, color: c.ink, height: 1.05)),
        const SizedBox(height: 8),
        Text('Ваш код для тренера',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 15, color: c.inkMuted)),
        const SizedBox(height: 28),
        // QR на подложке (значение = deep-ссылка на привязку), как в connect_screen.
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: c.ink,
            borderRadius: BorderRadius.circular(16),
          ),
          child: QrImageView(
            data: _linkFor(acc.id),
            version: QrVersions.auto,
            size: 220,
            backgroundColor: const Color(0xFFEEEEE8),
            eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Color(0xFF0B0C10)),
            dataModuleStyle: const QrDataModuleStyle(
                dataModuleShape: QrDataModuleShape.square, color: Color(0xFF0B0C10)),
          ),
        ),
        const SizedBox(height: 20),
        // Сырой ID (моно) + копирование — запасной ручной ввод для тренера.
        GestureDetector(
          onTap: () => _copy(context, acc.id),
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
                Icon(Icons.copy, size: 16, color: c.inkMuted),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'Покажите этот QR-код тренеру или отправьте ему ID — он добавит вас.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 14, color: c.inkMuted, height: 1.4),
        ),
      ],
    );
  }
}

/// Каркас экрана: прокручиваемый центрированный контент (maxWidth 430) и
/// закреплённая внизу кнопка «Готово» (one-handed).
class _Frame extends StatelessWidget {
  const _Frame({required this.child, required this.onDone});

  final Widget child;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: child,
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: AuthPrimaryButton(
                label: 'Готово',
                busyLabel: 'Готово',
                busy: false,
                onPressed: onDone,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
