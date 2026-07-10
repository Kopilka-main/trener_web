import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/dev_mode_flag.dart';
import '../router.dart';
import '../screens/support_chat_screen.dart';

/// Оверлей поверх всего приложения: если тренер включил «режим разработчика»
/// (согласился участвовать в разработке на приз-странице онбординга) — рисуем
/// перетаскиваемую кнопку «Сообщить о проблеме» в нижнем ЛЕВОМ углу (чтобы не
/// конфликтовать с [ActiveWorkoutFab] справа снизу). Тап → экран поддержки.
/// Ставится в MaterialApp.builder рядом с остальными оверлеями.
class DevReportFab extends ConsumerStatefulWidget {
  const DevReportFab({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<DevReportFab> createState() => _DevReportFabState();
}

class _DevReportFabState extends ConsumerState<DevReportFab> {
  static const double _w = 210;
  static const double _h = 48;
  Offset? _pos; // null → позиция по умолчанию (слева снизу)
  bool _onSupport = false; // пока открыт экран поддержки — кнопку прячем

  @override
  Widget build(BuildContext context) {
    final bool authed = ref.watch(sessionProvider).status == AuthStatus.authenticated;
    final bool devMode = ref.watch(devModeEnabledProvider);
    final bool show = authed && devMode && !_onSupport;
    return Stack(
      children: <Widget>[
        widget.child,
        if (show) _fab(context),
      ],
    );
  }

  Future<void> _openSupport() async {
    // FAB висит НАД навигатором роутера — своего Navigator-предка у него нет,
    // поэтому пушим на навигатор go_router (тот же, куда пушит help_screen).
    final NavigatorState? nav = ref.read(routerProvider).routerDelegate.navigatorKey.currentState;
    if (nav == null) return;
    setState(() => _onSupport = true);
    await nav.push<void>(
      MaterialPageRoute<void>(builder: (_) => const SupportChatScreen()),
    );
    if (mounted) setState(() => _onSupport = false);
  }

  Widget _fab(BuildContext context) {
    final AppColors c = context.colors;
    final Size size = MediaQuery.of(context).size;
    final EdgeInsets pad = MediaQuery.of(context).padding;
    final Offset def = Offset(16 + pad.left, size.height - _h - pad.bottom - 96);
    final Offset raw = _pos ?? def;
    final double left = raw.dx.clamp(8, size.width - _w - 8);
    final double top = raw.dy.clamp(pad.top + 8, size.height - _h - pad.bottom - 8);
    return Positioned(
      left: left,
      top: top,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onPanUpdate: (DragUpdateDetails d) =>
            setState(() => _pos = Offset(left + d.delta.dx, top + d.delta.dy)),
        onTap: _openSupport,
        child: Material(
          color: Colors.transparent,
          child: Container(
            width: _w,
            height: _h,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: c.card,
              borderRadius: BorderRadius.circular(_h / 2),
              border: Border.all(color: c.line),
              boxShadow: <BoxShadow>[
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.20),
                    blurRadius: 12,
                    offset: const Offset(0, 4)),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                Icon(Icons.bug_report_outlined, size: 20, color: c.accent),
                const SizedBox(width: 8),
                Flexible(
                  child: Text('Сообщить о проблеме',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.ink)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
