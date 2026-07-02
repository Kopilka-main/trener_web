import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../router.dart';

/// Глобальная навигационная FAB-кнопка (замена нижнего меню).
/// Тап — назад (как свайп). Удержание — раскрывает вокруг радиальное меню
/// с переходами: Главная / Календарь / Финансы. Ставится в MaterialApp.builder.
class GlobalNavFab extends ConsumerStatefulWidget {
  const GlobalNavFab({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<GlobalNavFab> createState() => _GlobalNavFabState();
}

class _GlobalNavFabState extends ConsumerState<GlobalNavFab>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 220));
  bool _open = false;

  // Экраны, где кнопка не нужна: корневые и проведение тренировки.
  static const Set<String> _hidden = <String>{'/home', '/splash', '/login', '/register'};

  // Смещения пунктов от главной кнопки (right, bottom), радиус ~120.
  // Финансы — влево, Календарь — вверх-влево, Главная — вверх.
  static const List<Offset> _bases = <Offset>[
    Offset(120, 6),
    Offset(88, 88),
    Offset(6, 120),
  ];

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _toggle() {
    setState(() => _open = !_open);
    _open ? _c.forward() : _c.reverse();
  }

  void _close() {
    if (!_open) return;
    setState(() => _open = false);
    _c.reverse();
  }

  void _back() {
    final GoRouter r = ref.read(routerProvider);
    r.canPop() ? r.pop() : r.go('/home');
  }

  void _goto(String path) {
    _close();
    ref.read(routerProvider).go(path);
  }

  bool _isHidden(String loc) => _hidden.contains(loc) || loc.startsWith('/active');

  @override
  Widget build(BuildContext context) {
    final bool authed = ref.watch(sessionProvider).status == AuthStatus.authenticated;
    final GoRouter router = ref.watch(routerProvider);
    return Stack(
      children: <Widget>[
        widget.child,
        if (authed)
          ListenableBuilder(
            listenable: router.routeInformationProvider,
            builder: (BuildContext context, Widget? _) {
              final String loc = router.routeInformationProvider.value.uri.path;
              if (_isHidden(loc)) {
                // Пока кнопка скрыта — держим меню закрытым.
                if (_open) {
                  _open = false;
                  _c.value = 0;
                }
                return const SizedBox.shrink();
              }
              return _overlay(context);
            },
          ),
      ],
    );
  }

  Widget _overlay(BuildContext context) {
    final AppColors c = context.colors;
    final EdgeInsets pad = MediaQuery.of(context).padding;
    return AnimatedBuilder(
      animation: _c,
      builder: (BuildContext context, Widget? _) {
        final double v = _c.value;
        final double vp = Curves.easeOut.transform(v);
        return Stack(
          children: <Widget>[
            if (v > 0)
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: _close,
                  child: ColoredBox(color: Color.fromRGBO(0, 0, 0, 0.45 * v)),
                ),
              ),
            Positioned(
              right: 16,
              bottom: 24 + pad.bottom,
              child: SizedBox(
                width: 280,
                height: 280,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: <Widget>[
                    _item(c, 0, vp, v, Icons.account_balance_wallet_rounded, 'Финансы',
                        () => _goto('/accounting')),
                    _item(c, 1, vp, v, Icons.calendar_month_rounded, 'Календарь',
                        () => _goto('/calendar')),
                    _item(c, 2, vp, v, Icons.home_rounded, 'Главная', () => _goto('/home')),
                    Positioned(right: 0, bottom: 0, child: _mainFab(c)),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _item(AppColors c, int i, double vp, double v, IconData icon, String label,
      VoidCallback onTap) {
    final Offset b = _bases[i];
    return Positioned(
      right: b.dx * vp,
      bottom: b.dy * vp,
      child: IgnorePointer(
        ignoring: v < 0.85,
        child: Opacity(
          opacity: v.clamp(0.0, 1.0),
          child: _MenuButton(icon: icon, label: label, onTap: onTap),
        ),
      ),
    );
  }

  Widget _mainFab(AppColors c) {
    return GestureDetector(
      onTap: _open ? _close : _back,
      onLongPress: _toggle,
      child: Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          color: c.accent,
          shape: BoxShape.circle,
          boxShadow: <BoxShadow>[
            BoxShadow(
                color: Colors.black.withValues(alpha: 0.28),
                blurRadius: 12,
                offset: const Offset(0, 4)),
          ],
        ),
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 150),
          child: Icon(_open ? Icons.close_rounded : Icons.arrow_back_rounded,
              key: ValueKey<bool>(_open), color: c.accentOn, size: 26),
        ),
      ),
    );
  }
}

/// Пункт радиального меню: подпись слева + круглая мини-кнопка с иконкой.
class _MenuButton extends StatelessWidget {
  const _MenuButton({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: c.card,
              borderRadius: BorderRadius.circular(10),
              boxShadow: <BoxShadow>[
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.18),
                    blurRadius: 8,
                    offset: const Offset(0, 2)),
              ],
            ),
            child: Text(label,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.ink)),
          ),
          const SizedBox(width: 10),
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: c.card,
              shape: BoxShape.circle,
              border: Border.all(color: c.line),
              boxShadow: <BoxShadow>[
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.18),
                    blurRadius: 8,
                    offset: const Offset(0, 2)),
              ],
            ),
            child: Icon(icon, color: c.accent, size: 22),
          ),
        ],
      ),
    );
  }
}
