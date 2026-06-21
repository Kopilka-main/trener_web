import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'cal_session.dart';

enum CalendarView { day, week, month }

/// Высота одного часа в дневной сетке (px) и час автоскролла (начало рабочего дня).
const double _dayHourH = 56;
const int _scrollHour = 7;

/// Переиспользуемый календарь занятий: виды день/неделя/месяц, навигация периода,
/// часовая сетка с автоскроллом к 7:00, нижний переключатель вида. Зеркало веб-
/// компонента SessionsCalendar. Подтверждение/действия — через onSessionTap.
class SessionsCalendar extends StatefulWidget {
  const SessionsCalendar({
    super.key,
    required this.sessions,
    required this.onSessionTap,
    this.defaultView = CalendarView.week,
  });

  final List<CalSession> sessions;
  final void Function(CalSession session) onSessionTap;
  final CalendarView defaultView;

  @override
  State<SessionsCalendar> createState() => _SessionsCalendarState();
}

class _SessionsCalendarState extends State<SessionsCalendar> {
  late CalendarView _view = widget.defaultView;
  DateTime _anchor = DateTime.now();
  // Верхняя видимая неделя в week-виде — для подписи периода при прокрутке списка.
  DateTime? _visibleWeek;

  void _setAnchor(DateTime d) => setState(() {
        _anchor = d;
        _visibleWeek = null;
      });

  void _shift(int dir) {
    switch (_view) {
      case CalendarView.day:
        _setAnchor(calAddDays(_anchor, dir));
      case CalendarView.week:
        _setAnchor(calAddDays(_anchor, dir * 7));
      case CalendarView.month:
        _setAnchor(calAddMonths(_anchor, dir));
    }
  }

  void _pickDay(DateTime d) => setState(() {
        _anchor = d;
        _view = CalendarView.day;
      });

  String get _periodLabel {
    if (_view == CalendarView.day) {
      return '${calDayFull[calWeekdayMon(_anchor)]}, ${_anchor.day} ${calMonthGen[_anchor.month - 1]}';
    }
    if (_view == CalendarView.week) {
      final DateTime a = calStartOfWeek(_visibleWeek ?? _anchor);
      final DateTime b = calAddDays(a, 6);
      return a.month == b.month
          ? '${a.day}–${b.day} ${calMonthGen[b.month - 1]}'
          : '${a.day} ${calMonthGen[a.month - 1]} – ${b.day} ${calMonthGen[b.month - 1]}';
    }
    return '${calMonthFull[_anchor.month - 1]} ${_anchor.year}';
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Stack(
      children: <Widget>[
        Column(
          children: <Widget>[
            _PeriodHeader(
              label: _periodLabel,
              onPrev: () => _shift(-1),
              onNext: () => _shift(1),
              onToday: () => _setAnchor(DateTime.now()),
            ),
            Expanded(
              child: switch (_view) {
                CalendarView.month =>
                  _MonthView(anchor: _anchor, sessions: widget.sessions, onPickDay: _pickDay),
                CalendarView.week => _WeekView(
                    anchor: _anchor,
                    sessions: widget.sessions,
                    onPickDay: _pickDay,
                    onTap: widget.onSessionTap,
                    onVisibleWeekChange: (DateTime ws) {
                      if (_visibleWeek == null || !calSameDay(_visibleWeek!, ws)) {
                        setState(() => _visibleWeek = ws);
                      }
                    },
                  ),
                CalendarView.day => _DayView(
                    date: _anchor,
                    sessions: widget.sessions,
                    onTap: widget.onSessionTap,
                  ),
              },
            ),
          ],
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 16 + MediaQuery.of(context).viewPadding.bottom,
          child: Center(
            child: _ViewSwitcher(
              value: _view,
              onChange: (CalendarView v) => setState(() => _view = v),
              colors: c,
            ),
          ),
        ),
      ],
    );
  }
}

class _PeriodHeader extends StatelessWidget {
  const _PeriodHeader({
    required this.label,
    required this.onPrev,
    required this.onNext,
    required this.onToday,
  });
  final String label;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final VoidCallback onToday;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
      child: Row(
        children: <Widget>[
          IconButton(
            onPressed: onPrev,
            icon: const Icon(Icons.chevron_left),
            color: c.ink,
            tooltip: 'Предыдущий период',
          ),
          Expanded(
            child: Text(label,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
          ),
          IconButton(
            onPressed: onNext,
            icon: const Icon(Icons.chevron_right),
            color: c.ink,
            tooltip: 'Следующий период',
          ),
          const SizedBox(width: 2),
          GestureDetector(
            onTap: onToday,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(color: c.chip, borderRadius: BorderRadius.circular(20)),
              child: Text('Сегодня',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.inkMuted)),
            ),
          ),
        ],
      ),
    );
  }
}

class _ViewSwitcher extends StatelessWidget {
  const _ViewSwitcher({required this.value, required this.onChange, required this.colors});
  final CalendarView value;
  final void Function(CalendarView) onChange;
  final AppColors colors;

  @override
  Widget build(BuildContext context) {
    const List<(CalendarView, String)> opts = <(CalendarView, String)>[
      (CalendarView.day, 'День'),
      (CalendarView.week, 'Неделя'),
      (CalendarView.month, 'Месяц'),
    ];
    return Material(
      color: colors.card,
      borderRadius: BorderRadius.circular(24),
      elevation: 3,
      shadowColor: Colors.black.withValues(alpha: 0.25),
      child: Padding(
        padding: const EdgeInsets.all(3),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: opts.map(((CalendarView, String) o) {
            final bool active = o.$1 == value;
            return GestureDetector(
              onTap: () => onChange(o.$1),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: active ? colors.accent : Colors.transparent,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(o.$2,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: active ? colors.accentOn : colors.inkMuted,
                    )),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

// ─────────────────────────── MONTH ───────────────────────────

class _MonthView extends StatelessWidget {
  const _MonthView({required this.anchor, required this.sessions, required this.onPickDay});
  final DateTime anchor;
  final List<CalSession> sessions;
  final void Function(DateTime) onPickDay;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final List<DateTime> cells = calMonthGrid(anchor);
    final DateTime now = DateTime.now();

    // Счётчики по дате: pending / confirmed / declined.
    final Map<String, (int, int, int)> counts = <String, (int, int, int)>{};
    for (final CalSession s in sessions) {
      final (int p, int cf, int d) = counts[s.date] ?? (0, 0, 0);
      counts[s.date] = switch (s.confirmation) {
        CalConfirmation.confirmed => (p, cf + 1, d),
        CalConfirmation.declined => (p, cf, d + 1),
        CalConfirmation.pending => (p + 1, cf, d),
      };
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 80),
      child: Column(
        children: <Widget>[
          Row(
            children: calDayShort
                .map((String d) => Expanded(
                      child: Center(
                        child: Text(d,
                            style: TextStyle(
                                fontSize: 10, fontWeight: FontWeight.w600, color: c.inkMuted)),
                      ),
                    ))
                .toList(),
          ),
          const SizedBox(height: 4),
          Expanded(
            child: GridView.count(
              crossAxisCount: 7,
              mainAxisSpacing: 4,
              crossAxisSpacing: 4,
              children: cells.map((DateTime d) {
                final (int, int, int)? cc = counts[calIsoDate(d)];
                final bool inMonth = d.month == anchor.month;
                final bool today = calSameDay(d, now);
                final bool has = cc != null && (cc.$1 + cc.$2 + cc.$3) > 0;
                return Opacity(
                  opacity: inMonth ? 1 : 0.4,
                  child: GestureDetector(
                    onTap: () => onPickDay(d),
                    child: Container(
                      decoration: BoxDecoration(
                        color: c.card,
                        borderRadius: BorderRadius.circular(12),
                        border: today ? Border.all(color: c.accent, width: 2) : null,
                      ),
                      child: Stack(
                        children: <Widget>[
                          if (has)
                            Positioned(
                              right: 0,
                              top: 0,
                              child: Container(
                                width: 12,
                                height: 12,
                                decoration: BoxDecoration(
                                  color: c.accent,
                                  borderRadius:
                                      const BorderRadius.only(bottomLeft: Radius.circular(12)),
                                ),
                              ),
                            ),
                          Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: <Widget>[
                                Text('${d.day}',
                                    style: AppFonts.mono(size: 13, color: c.ink)),
                                const SizedBox(height: 3),
                                if (cc != null && (cc.$1 + cc.$2 + cc.$3) > 0)
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: <Widget>[
                                      if (cc.$1 > 0) Text('${cc.$1} ', style: AppFonts.mono(size: 10, color: c.inkMutedXl)),
                                      if (cc.$2 > 0) Text('${cc.$2} ', style: AppFonts.mono(size: 10, color: c.accent)),
                                      if (cc.$3 > 0) Text('${cc.$3}', style: AppFonts.mono(size: 10, color: c.danger)),
                                    ],
                                  )
                                else
                                  const SizedBox(height: 10),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────── WEEK ───────────────────────────

class _WeekView extends StatefulWidget {
  const _WeekView({
    required this.anchor,
    required this.sessions,
    required this.onPickDay,
    required this.onTap,
    required this.onVisibleWeekChange,
  });
  final DateTime anchor;
  final List<CalSession> sessions;
  final void Function(DateTime) onPickDay;
  final void Function(CalSession) onTap;
  // Сообщает наверх, какая неделя сейчас у верхнего края при прокрутке.
  final void Function(DateTime) onVisibleWeekChange;

  @override
  State<_WeekView> createState() => _WeekViewState();
}

class _WeekViewState extends State<_WeekView> {
  // Окно недель вокруг опорной: опорная — индекс _anchorIdx.
  static const int _count = 51;
  static const int _anchorIdx = 16;
  final GlobalKey _listKey = GlobalKey();
  late final List<GlobalKey> _weekKeys =
      List<GlobalKey>.generate(_count, (_) => GlobalKey());
  DateTime? _lastReported;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToAnchor());
  }

  @override
  void didUpdateWidget(_WeekView old) {
    super.didUpdateWidget(old);
    if (!calSameDay(calStartOfWeek(old.anchor), calStartOfWeek(widget.anchor))) {
      _lastReported = null;
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToAnchor());
    }
  }

  void _scrollToAnchor() {
    final BuildContext? ctx = _weekKeys[_anchorIdx].currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(ctx, alignment: 0, duration: const Duration(milliseconds: 1));
    }
  }

  /// Определяет верхнюю видимую неделю по позициям смонтированных строк
  /// (ListView.builder держит в дереве лишь видимые/кэш — перебор дёшев).
  void _reportVisible() {
    final RenderObject? listRo = _listKey.currentContext?.findRenderObject();
    if (listRo is! RenderBox) return;
    final double listTop = listRo.localToGlobal(Offset.zero).dy;
    int? topIdx;
    for (int i = 0; i < _count; i++) {
      final RenderObject? ro = _weekKeys[i].currentContext?.findRenderObject();
      if (ro is! RenderBox) continue;
      final double top = ro.localToGlobal(Offset.zero).dy;
      final double bottom = top + ro.size.height;
      if (bottom > listTop + 2) {
        topIdx = i;
        break;
      }
    }
    if (topIdx == null) return;
    final DateTime ws = calAddDays(calStartOfWeek(widget.anchor), (topIdx - _anchorIdx) * 7);
    if (_lastReported == null || !calSameDay(_lastReported!, ws)) {
      _lastReported = ws;
      widget.onVisibleWeekChange(ws);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final DateTime anchorWeek = calStartOfWeek(widget.anchor);

    return Column(
      children: <Widget>[
        // Дни недели — фиксированная шапка.
        Container(
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: c.line)),
          ),
          padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
          child: Row(
            children: calDayShort
                .map((String n) => Expanded(
                      child: Center(
                        child: Text(n,
                            style: TextStyle(
                                fontSize: 10, fontWeight: FontWeight.w600, color: c.inkMuted)),
                      ),
                    ))
                .toList(),
          ),
        ),
        Expanded(
          child: NotificationListener<ScrollNotification>(
            onNotification: (ScrollNotification n) {
              if (n is ScrollUpdateNotification || n is ScrollEndNotification) {
                _reportVisible();
              }
              return false;
            },
            child: ListView.builder(
              key: _listKey,
              padding: const EdgeInsets.only(bottom: 90),
              itemCount: _count,
              itemBuilder: (BuildContext ctx, int i) {
                final DateTime ws = calAddDays(anchorWeek, (i - _anchorIdx) * 7);
                return _WeekRow(
                  key: _weekKeys[i],
                  weekStart: ws,
                  sessions: widget.sessions,
                  onPickDay: widget.onPickDay,
                  onTap: widget.onTap,
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

class _WeekRow extends StatelessWidget {
  const _WeekRow({
    super.key,
    required this.weekStart,
    required this.sessions,
    required this.onPickDay,
    required this.onTap,
  });
  final DateTime weekStart;
  final List<CalSession> sessions;
  final void Function(DateTime) onPickDay;
  final void Function(CalSession) onTap;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final DateTime now = DateTime.now();
    final List<DateTime> dates = calWeekDates(weekStart);
    final double colMinH = MediaQuery.of(context).size.height * 0.34;

    return Container(
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.line))),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        children: <Widget>[
          // Числа недели.
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: dates.map((DateTime d) {
                final bool today = calSameDay(d, now);
                return Expanded(
                  child: GestureDetector(
                    onTap: () => onPickDay(d),
                    behavior: HitTestBehavior.opaque,
                    child: Center(
                      child: Container(
                        width: 24,
                        height: 24,
                        alignment: Alignment.center,
                        decoration: today
                            ? BoxDecoration(color: c.accent, shape: BoxShape.circle)
                            : null,
                        child: Text('${d.day}',
                            style: AppFonts.mono(
                                size: 12, color: today ? c.accentOn : c.ink)),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          // Колонки-дни.
          ConstrainedBox(
            constraints: BoxConstraints(minHeight: colMinH),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: dates.map((DateTime d) {
                  final List<CalSession> items = calSessionsOf(sessions, d);
                  final bool today = calSameDay(d, now);
                  return Expanded(
                    child: Container(
                      color: today ? c.card.withValues(alpha: 0.4) : null,
                      padding: const EdgeInsets.symmetric(horizontal: 1.5),
                      child: Column(
                        children: <Widget>[
                          const SizedBox(height: 4),
                          ...items.map((CalSession s) => _WeekCard(session: s, onTap: () => onTap(s))),
                          Expanded(
                            child: GestureDetector(
                              onTap: () => onPickDay(d),
                              behavior: HitTestBehavior.opaque,
                              child: const SizedBox(width: double.infinity),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WeekCard extends StatelessWidget {
  const _WeekCard({required this.session, required this.onTap});
  final CalSession session;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final CalTileColors tc = calTileColors(session, c.cardElevated, c.inkMuted);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        decoration: BoxDecoration(color: tc.bg, borderRadius: BorderRadius.circular(8)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                if (session.isOnline)
                  Padding(
                    padding: const EdgeInsets.only(right: 2, top: 1),
                    child: Icon(Icons.wifi, size: 10, color: tc.fg),
                  ),
                Expanded(
                  child: Text(
                    session.label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      height: 1.15,
                      fontWeight: FontWeight.w600,
                      color: tc.fg,
                      decoration: tc.strike ? TextDecoration.lineThrough : null,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(session.startTime,
                style: AppFonts.mono(size: 10, color: tc.fg.withValues(alpha: 0.8))),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────── DAY ───────────────────────────

class _DayView extends StatefulWidget {
  const _DayView({required this.date, required this.sessions, required this.onTap});
  final DateTime date;
  final List<CalSession> sessions;
  final void Function(CalSession) onTap;

  @override
  State<_DayView> createState() => _DayViewState();
}

class _DayViewState extends State<_DayView> {
  late final ScrollController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = ScrollController(initialScrollOffset: _initialOffset());
  }

  double _initialOffset() {
    final List<CalSession> items = calSessionsOf(widget.sessions, widget.date);
    if (items.isNotEmpty) {
      final double top = (items.first.startMin - calStartHour * 60) / 60 * _dayHourH;
      return (top - 120).clamp(0, calHours * _dayHourH);
    }
    return (_scrollHour - calStartHour) * _dayHourH;
  }

  @override
  void didUpdateWidget(_DayView old) {
    super.didUpdateWidget(old);
    if (!calSameDay(old.date, widget.date)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_ctrl.hasClients) _ctrl.jumpTo(_initialOffset());
      });
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final DateTime now = DateTime.now();
    final List<CalSession> items = calSessionsOf(widget.sessions, widget.date);
    final Map<String, ({int col, int cols})> layout = calLayoutColumns(items);
    final double gridH = calHours * _dayHourH;
    final double nowTop = (now.hour * 60 + now.minute - calStartHour * 60) / 60 * _dayHourH;
    final bool isToday = calSameDay(widget.date, now);

    return SingleChildScrollView(
      controller: _ctrl,
      padding: const EdgeInsets.only(bottom: 90, top: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // Часовые метки.
          SizedBox(
            width: 44,
            height: gridH,
            child: Stack(
              children: List<Widget>.generate(calHours, (int i) {
                return Positioned(
                  top: i * _dayHourH - 6,
                  left: 6,
                  child: Text('${(calStartHour + i).toString().padLeft(2, '0')}:00',
                      style: AppFonts.mono(size: 10, color: c.inkMuted, weight: FontWeight.w500)),
                );
              }),
            ),
          ),
          Expanded(
            child: Container(
              decoration: BoxDecoration(border: Border(left: BorderSide(color: c.line))),
              height: gridH,
              child: LayoutBuilder(
                builder: (BuildContext ctx, BoxConstraints cons) {
                  final double areaW = cons.maxWidth;
                  return Stack(
                    children: <Widget>[
                      // Часовые линии.
                      ...List<Widget>.generate(calHours, (int i) {
                        return Positioned(
                          top: i * _dayHourH,
                          left: 0,
                          right: 0,
                          child: Container(height: 1, color: c.line),
                        );
                      }),
                      // Линия «сейчас».
                      if (isToday && nowTop >= 0 && nowTop <= gridH)
                        Positioned(
                          top: nowTop - 1,
                          left: 0,
                          right: 0,
                          child: Row(
                            children: <Widget>[
                              Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(color: c.coral, shape: BoxShape.circle),
                              ),
                              Expanded(child: Container(height: 1, color: c.coral)),
                            ],
                          ),
                        ),
                      // Блоки занятий.
                      ...items.map((CalSession s) {
                        final double top = (s.startMin - calStartHour * 60) / 60 * _dayHourH;
                        final double height = ((s.durationMin / 60) * _dayHourH - 2).clamp(18, gridH);
                        final ({int col, int cols}) lay = layout[s.id] ?? (col: 0, cols: 1);
                        final double wPct = 1 / lay.cols;
                        final CalTileColors tc = calTileColors(s, c.cardElevated, c.inkMuted);
                        return Positioned(
                          top: top,
                          left: lay.col * wPct * areaW + 6,
                          width: wPct * areaW - 12,
                          height: height,
                          child: GestureDetector(
                            onTap: () => widget.onTap(s),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                              decoration:
                                  BoxDecoration(color: tc.bg, borderRadius: BorderRadius.circular(10)),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Row(
                                    children: <Widget>[
                                      if (s.isOnline)
                                        Padding(
                                          padding: const EdgeInsets.only(right: 4),
                                          child: Icon(Icons.wifi, size: 12, color: tc.fg),
                                        ),
                                      Expanded(
                                        child: Text(s.label,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.w600,
                                                color: tc.fg,
                                                decoration: tc.strike
                                                    ? TextDecoration.lineThrough
                                                    : null)),
                                      ),
                                    ],
                                  ),
                                  if (height > 30)
                                    Text(
                                      <String>[
                                        '${s.startTime}–${s.endTime}',
                                        if (s.isOnline) 'Online' else if (s.location?.isNotEmpty == true) s.location!,
                                      ].join(' · '),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: AppFonts.mono(size: 10, color: tc.fg.withValues(alpha: 0.8)),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        );
                      }),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
