import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/active_workout_state.dart';
import '../router.dart';

/// Глобальная навигационная FAB-кнопка (замена нижнего меню). Стоит у ЛЕВОГО
/// края, перетаскивается вдоль него по вертикали. Тап — раскрывает меню переходов
/// (Назад / Главная / Календарь / Финансы) вверх; тап по затемнению — закрыть.
/// Ставится в MaterialApp.builder.
class GlobalNavFab extends ConsumerStatefulWidget {
  const GlobalNavFab({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<GlobalNavFab> createState() => _GlobalNavFabState();
}

class _GlobalNavFabState extends ConsumerState<GlobalNavFab> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 220));
  bool _open = false;
  double? _top; // позиция кнопки по вертикали (null → по умолчанию снизу)

  static const double _fabSize = 56;
  static const double _gap = 62; // шаг между пунктами меню

  // Экраны, где кнопка не нужна: корневые и проведение тренировки.
  static const Set<String> _hidden = <String>{'/home', '/splash', '/login', '/register'};

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
    _close();
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
    // Экран проведения тренировки открывается и через MaterialPageRoute (маршрут
    // роутера при этом не /active), поэтому дополнительно скрываем по флагу.
    final bool onConduct = ref.watch(activeWorkoutOnScreenProvider);
    final GoRouter router = ref.watch(routerProvider);
    return Stack(
      children: <Widget>[
        widget.child,
        if (authed)
          ListenableBuilder(
            listenable: router.routerDelegate,
            builder: (BuildContext context, Widget? _) {
              // currentConfiguration отражает ФАКТИЧЕСКИ показанный экран (после
              // редиректов) — в отличие от routeInformationProvider, который мог
              // отдавать до-редиректный/устаревший путь (из-за чего кнопка висела
              // на главной).
              final String loc = router.routerDelegate.currentConfiguration.uri.path;
              if (_isHidden(loc) || onConduct) {
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
    final Size size = MediaQuery.of(context).size;
    final EdgeInsets pad = MediaQuery.of(context).padding;
    final double left = 16 + pad.left;
    final double minTop = pad.top + 8;
    final double maxTop = size.height - _fabSize - pad.bottom - 8;
    final double defTop = size.height - _fabSize - pad.bottom - 110;
    final double fabTop = (_top ?? defTop).clamp(minTop, maxTop);

    // Пункты меню снизу вверх: ближайший к кнопке — первый.
    final List<(IconData, String, VoidCallback)> items = <(IconData, String, VoidCallback)>[
      (Icons.arrow_back_rounded, 'Назад', _back),
      (Icons.home_rounded, 'Главная', () => _goto('/home')),
      (Icons.calendar_month_rounded, 'Календарь', () => _goto('/calendar')),
      (Icons.account_balance_wallet_rounded, 'Финансы', () => _goto('/accounting')),
    ];

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
            for (int i = 0; i < items.length; i++)
              Positioned(
                left: left,
                // Раскрываются ВВЕРХ от кнопки (пункты «всплывают» по мере анимации).
                top: fabTop - (i + 1) * _gap * vp,
                child: IgnorePointer(
                  ignoring: v < 0.85,
                  child: Opacity(
                    opacity: v.clamp(0.0, 1.0),
                    child: _MenuButton(icon: items[i].$1, label: items[i].$2, onTap: items[i].$3),
                  ),
                ),
              ),
            Positioned(left: left, top: fabTop, child: _mainFab(c)),
          ],
        );
      },
    );
  }

  Widget _mainFab(AppColors c) {
    return GestureDetector(
      // Тап — назад (кнопка «Назад»); удержание — меню переходов.
      onTap: _open ? _close : _back,
      onLongPress: _toggle,
      // Перетаскивание вдоль левого края. onVerticalDragUpdate (а не onPanUpdate) —
      // он специфичнее и не перехватывает удержание (long-press для меню).
      onVerticalDragUpdate: (DragUpdateDetails d) {
        final Size size = MediaQuery.of(context).size;
        final EdgeInsets pad = MediaQuery.of(context).padding;
        final double minTop = pad.top + 8;
        final double maxTop = size.height - _fabSize - pad.bottom - 8;
        final double base = _top ?? (size.height - _fabSize - pad.bottom - 110);
        setState(() => _top = (base + d.delta.dy).clamp(minTop, maxTop));
      },
      child: Container(
        width: _fabSize,
        height: _fabSize,
        decoration: BoxDecoration(
          color: c.accent,
          shape: BoxShape.circle,
          boxShadow: <BoxShadow>[
            BoxShadow(color: Colors.black.withValues(alpha: 0.28), blurRadius: 12, offset: const Offset(0, 4)),
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

/// Пункт меню: круглая мини-кнопка с иконкой + подпись справа (кнопка у левого
/// края, поэтому подпись уходит в сторону экрана, а не за край).
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
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: c.card,
              shape: BoxShape.circle,
              border: Border.all(color: c.line),
              boxShadow: <BoxShadow>[
                BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 8, offset: const Offset(0, 2)),
              ],
            ),
            child: Icon(icon, color: c.accent, size: 22),
          ),
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: c.card,
              borderRadius: BorderRadius.circular(10),
              boxShadow: <BoxShadow>[
                BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 8, offset: const Offset(0, 2)),
              ],
            ),
            child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.ink)),
          ),
        ],
      ),
    );
  }
}
