import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/active_workout_state.dart';
import '../router.dart';

/// Можно ли вернуться назад = в стеке корневого навигатора больше одного экрана.
/// Держится актуальным наблюдателем ниже (ловит и go_router-, и imperative-переходы).
final ValueNotifier<bool> navCanGoBack = ValueNotifier<bool>(false);

/// Открыта ли выдвижная шторка (`showModalBottomSheet`) — тогда нижнее меню
/// прячем, чтобы плавающая плашка не всплывала поверх шторки.
final ValueNotifier<bool> navSheetOpen = ValueNotifier<bool>(false);

/// Контекстное «добавление» для нижнего меню: экран-раздел регистрирует иконку +
/// действие + свой маршрут (loc). Меню рисует последней кнопкой, но показывает
/// только когда открыт именно этот экран (fab.loc == текущий _location).
typedef NavFabAction = ({String loc, IconData icon, VoidCallback onTap});
final StateProvider<NavFabAction?> navFabProvider = StateProvider<NavFabAction?>((Ref ref) => null);

/// Наблюдатель стека — вешается в GoRouter(observers: [...]). Спрашивает сам
/// навигатор `canPop()`; сверку откладываем на кадр, чтобы стек устаканился.
/// Плюс считает открытые модальные шторки (для navSheetOpen).
class NavStackObserver extends NavigatorObserver {
  int _sheets = 0;
  bool _isSheet(Route<dynamic>? r) => r is ModalBottomSheetRoute;
  void _sheet(int delta) {
    _sheets = (_sheets + delta).clamp(0, 1 << 30);
    navSheetOpen.value = _sheets > 0;
  }

  void _sync() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      navCanGoBack.value = navigator?.canPop() ?? false;
    });
  }

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (_isSheet(route)) _sheet(1);
    _sync();
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (_isSheet(route)) _sheet(-1);
    _sync();
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (_isSheet(route)) _sheet(-1);
    _sync();
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    if (_isSheet(oldRoute)) _sheet(-1);
    if (_isSheet(newRoute)) _sheet(1);
    _sync();
  }
}

/// Нижнее меню навигации (Instagram-стиль): фиксированная панель снизу с иконками
/// Назад / Главная / Клиенты / Календарь / Финансы. Активный раздел подсвечен
/// акцентом. Панель — ЧАСТЬ layout (Column), поэтому контент рисуется НАД ней и
/// не перекрывается — отдельные отступы на страницах не нужны. Прячется на
/// проведении тренировки, при открытой клавиатуре и до авторизации. Ставится
/// в MaterialApp.builder (внутри гейтов, чтобы онбординг её перекрывал).
class GlobalNavBar extends ConsumerStatefulWidget {
  const GlobalNavBar({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<GlobalNavBar> createState() => _GlobalNavBarState();
}

class _GlobalNavBarState extends ConsumerState<GlobalNavBar> {
  GoRouter? _router;
  String _location = '/home';

  @override
  void initState() {
    super.initState();
    // Открытие/закрытие шторки → перерисовать (скрыть/показать панель).
    navSheetOpen.addListener(_onSheet);
    // Текущий маршрут — для подсветки активного раздела. go_router-location
    // ловим слушателем routerDelegate (как в ActiveWorkoutFab).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _router = ref.read(routerProvider);
      _router!.routerDelegate.addListener(_onRoute);
      _onRoute();
    });
  }

  void _onRoute() {
    if (!mounted) return;
    final RouteMatchList? config = _router?.routerDelegate.currentConfiguration;
    // Берём САМЫЙ ГЛУБОКИЙ match: его matchedLocation отражает и go_router-go, и
    // imperative push (context.push с Главной в раздел). А config.uri при push
    // остаётся '/home' — из-за этого раздел раньше не подсвечивался.
    final String loc = config?.lastOrNull?.matchedLocation ?? '/home';
    if (loc != _location) setState(() => _location = loc);
  }

  void _onSheet() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    navSheetOpen.removeListener(_onSheet);
    _router?.routerDelegate.removeListener(_onRoute);
    super.dispose();
  }

  void _go(String path) {
    if (_location == path) return;
    // go (не push): переключение раздела сбрасывает к корню — стек не растёт.
    ref.read(routerProvider).go(path);
  }

  void _back() {
    final GoRouter r = ref.read(routerProvider);
    r.canPop() ? r.pop() : r.go('/home');
  }

  // Высота зоны под плашку (над системным safe-area): её резервируем в
  // MediaQuery, чтобы контент страниц не заходил под плавающую плашку.
  static const double _reserve = 64;

  @override
  Widget build(BuildContext context) {
    final bool authed = ref.watch(sessionProvider).status == AuthStatus.authenticated;
    final MediaQueryData mq = MediaQuery.of(context);
    // Прячем на экране проведения (открыт через MaterialPageRoute — по маршруту
    // не поймать, поэтому по флагу) и при открытой клавиатуре.
    final bool onConduct = ref.watch(activeWorkoutOnScreenProvider);
    final bool keyboard = mq.viewInsets.bottom > 0;
    // Не показываем на Главной (она — хаб; меню появляется в разделах).
    final bool onHome = _location == '/home';
    // Прячем, когда открыта выдвижная шторка (плашка не всплывает поверх неё).
    final bool sheetOpen = navSheetOpen.value;
    final bool showBar = authed && !onConduct && !keyboard && !onHome && !sheetOpen;
    // ВАЖНО: структура дерева СТАБИЛЬНА (всегда Stack > MediaQuery > child).
    // Раньше при showBar=false возвращался голый widget.child — из-за смены
    // структуры go_router-навигатор переподключался в дереве и ОТМЕНЯЛ pop, из-за
    // чего «Назад» с раздела мигал на Главную и возвращал обратно. Теперь меняем
    // только величину резерва и наличие плашки — навигатор не переподключается.
    // Плашка ПЛАВАЕТ поверх контента (фон под ней — сама страница), а резерв
    // снизу (через MediaQuery) раздвигает SafeArea/отступы, чтобы концовка
    // страницы не залезала под плашку.
    final double reserve = showBar ? _reserve : 0;
    return Stack(
      children: <Widget>[
        MediaQuery(
          data: mq.copyWith(
            padding: mq.padding.copyWith(bottom: mq.padding.bottom + reserve),
            viewPadding: mq.viewPadding.copyWith(bottom: mq.viewPadding.bottom + reserve),
          ),
          child: widget.child,
        ),
        if (showBar)
          Positioned(left: 0, right: 0, bottom: mq.padding.bottom + 10, child: _bar(context)),
      ],
    );
  }

  Widget _bar(BuildContext context) {
    final AppColors c = context.colors;
    // Контекстная кнопка «+»: рисуем последней, но только когда открыт именно тот
    // экран, что её зарегистрировал (fab.loc == активный маршрут _location).
    final NavFabAction? fab = ref.watch(navFabProvider);
    final bool showFab = fab != null && fab.loc == _location;
    // (иконка, путь-раздел|null). null → «Назад» (не раздел, без подсветки).
    const List<(IconData, String?)> tabs = <(IconData, String?)>[
      (Icons.arrow_back_rounded, null),
      (Icons.home_rounded, '/home'),
      (Icons.people_alt_rounded, '/clients'),
      (Icons.calendar_month_rounded, '/calendar'),
      (Icons.account_balance_wallet_rounded, '/accounting'),
    ];
    // Плавающая овальная плашка по центру: только иконки, тесно; активная —
    // акцентным цветом (без подложки).
    return Center(
      child: Container(
        decoration: BoxDecoration(
          // Полупрозрачный фон (30% прозрачности) — контент под панелью просвечивает.
          color: c.card.withValues(alpha: 0.7),
          borderRadius: BorderRadius.circular(30),
          border: Border.all(color: c.line),
          boxShadow: <BoxShadow>[
            BoxShadow(color: Colors.black.withValues(alpha: 0.22), blurRadius: 16, offset: const Offset(0, 4)),
          ],
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            for (final (IconData, String?) t in tabs)
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: t.$2 == null ? _back : () => _go(t.$2!),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  child: Icon(
                    t.$1,
                    size: 26,
                    color: (t.$2 != null && _location == t.$2) ? c.accent : c.inkMuted,
                  ),
                ),
              ),
            // Кнопка-«плюс» текущего экрана в стиле FAB (акцентный кружок).
            if (showFab)
              Padding(
                padding: const EdgeInsets.only(left: 4),
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: fab.onTap,
                  child: Container(
                    width: 40,
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: c.accent, shape: BoxShape.circle),
                    child: Icon(fab.icon, size: 22, color: c.accentOn),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
