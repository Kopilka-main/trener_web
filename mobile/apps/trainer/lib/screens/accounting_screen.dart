import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_accounting.dart';
import '../api/trainer_clients.dart';
import '../api/trainer_gyms.dart';
import '../widgets/income_form.dart';

// ─── Утилиты ───
const List<String> _ruMonthsShort = <String>[
  'янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String _money(num v) {
  final int n = v.round();
  final String s = n.abs().toString();
  final StringBuffer b = StringBuffer();
  for (int i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(' ');
    b.write(s[i]);
  }
  return '${n < 0 ? '−' : ''}${b.toString()} ₽';
}

enum _Mode { month, quarter, year, custom }

/// Фильтр списка операций: все / только доходы / только расходы.
enum _Filter { all, income, expense }

/// Операция в едином списке (доход или расход), для рендера общей строкой.
class _Op {
  _Op({
    required this.date,
    required this.primary,
    required this.kicker,
    required this.meta,
    required this.amount,
    required this.isIncome,
    required this.tags,
    this.onTap,
  });
  final DateTime? date;
  final String primary;
  final String kicker;
  final String meta;
  final num amount;
  final bool isIncome;
  final List<String> tags;
  final VoidCallback? onTap;
}

class AccountingScreen extends ConsumerStatefulWidget {
  const AccountingScreen({super.key});

  @override
  ConsumerState<AccountingScreen> createState() => _AccountingScreenState();
}

class _AccountingScreenState extends ConsumerState<AccountingScreen> {
  _Mode _mode = _Mode.month;
  _Filter _filter = _Filter.all;
  DateTime _anchor = DateTime.now();
  DateTime _customFrom = DateTime(DateTime.now().year, DateTime.now().month, 1);
  DateTime _customTo = DateTime.now();

  // Фильтры списков.
  String _catFilter = '';
  String _tagFilter = '';

  DateTime get _from {
    switch (_mode) {
      case _Mode.month:
        return DateTime(_anchor.year, _anchor.month, 1);
      case _Mode.quarter:
        final int q = (_anchor.month - 1) ~/ 3;
        return DateTime(_anchor.year, q * 3 + 1, 1);
      case _Mode.year:
        return DateTime(_anchor.year, 1, 1);
      case _Mode.custom:
        return _customFrom;
    }
  }

  DateTime get _to {
    switch (_mode) {
      case _Mode.month:
        return DateTime(_anchor.year, _anchor.month + 1, 0);
      case _Mode.quarter:
        final int q = (_anchor.month - 1) ~/ 3;
        return DateTime(_anchor.year, q * 3 + 4, 0);
      case _Mode.year:
        return DateTime(_anchor.year, 12, 31);
      case _Mode.custom:
        return _customTo;
    }
  }

  String get _periodLabel {
    final DateTime f = _from;
    switch (_mode) {
      case _Mode.month:
        return '${_ruMonthsShort[f.month - 1]} ${f.year}';
      case _Mode.quarter:
        return '${(f.month - 1) ~/ 3 + 1} кв. ${f.year}';
      case _Mode.year:
        return '${f.year}';
      case _Mode.custom:
        return '${f.day} ${_ruMonthsShort[f.month - 1]} – ${_to.day} ${_ruMonthsShort[_to.month - 1]}';
    }
  }

  void _shift(int dir) {
    setState(() {
      switch (_mode) {
        case _Mode.month:
          _anchor = DateTime(_anchor.year, _anchor.month + dir, 1);
        case _Mode.quarter:
          _anchor = DateTime(_anchor.year, _anchor.month + dir * 3, 1);
        case _Mode.year:
          _anchor = DateTime(_anchor.year + dir, _anchor.month, 1);
        case _Mode.custom:
          break;
      }
    });
  }

  bool _inRange(DateTime? d) {
    if (d == null) return false;
    final DateTime day = DateTime(d.year, d.month, d.day);
    return !day.isBefore(_from) && !day.isAfter(_to);
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: _onAdd,
        child: const Icon(Icons.add),
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Text('Бухгалтерия', style: AppFonts.display(size: 24, color: c.ink)),
            ),
            _modeBar(c),
            _periodBar(c),
            Expanded(child: _body(c)),
          ],
        ),
      ),
    );
  }

  Widget _modeBar(AppColors c) {
    Widget seg(String label, _Mode m) => Expanded(
          child: GestureDetector(
            onTap: () => setState(() => _mode = m),
            child: Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                  color: _mode == m ? c.accent : Colors.transparent, borderRadius: BorderRadius.circular(10)),
              child: Text(label,
                  style: TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w700, color: _mode == m ? c.accentOn : c.inkMuted)),
            ),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
        child: Row(children: <Widget>[
          seg('Месяц', _Mode.month),
          seg('Квартал', _Mode.quarter),
          seg('Год', _Mode.year),
          seg('Период', _Mode.custom),
        ]),
      ),
    );
  }

  Widget _periodBar(AppColors c) {
    if (_mode == _Mode.custom) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        child: Row(
          children: <Widget>[
            Expanded(child: _dateBox(c, 'С', _customFrom, (DateTime d) => setState(() => _customFrom = d))),
            const SizedBox(width: 8),
            Expanded(child: _dateBox(c, 'По', _customTo, (DateTime d) => setState(() => _customTo = d))),
          ],
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Row(
        children: <Widget>[
          _Round(icon: Icons.chevron_left, onTap: () => _shift(-1)),
          Expanded(
            child: Text(_periodLabel,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.ink)),
          ),
          _Round(icon: Icons.chevron_right, onTap: () => _shift(1)),
        ],
      ),
    );
  }

  Widget _dateBox(AppColors c, String label, DateTime value, ValueChanged<DateTime> onPick) {
    return GestureDetector(
      onTap: () async {
        final DateTime now = DateTime.now();
        final DateTime? d = await showDatePicker(
          context: context,
          initialDate: value,
          firstDate: DateTime(now.year - 5),
          lastDate: DateTime(now.year + 1),
        );
        if (d != null) onPick(d);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
        child: Row(
          children: <Widget>[
            Text('$label: ', style: AppFonts.mono(size: 11, color: c.inkMutedXl)),
            Text('${value.day} ${_ruMonthsShort[value.month - 1]}',
                style: TextStyle(fontSize: 13, color: c.ink)),
          ],
        ),
      ),
    );
  }

  Widget _body(AppColors c) {
    final AsyncValue<List<Income>> inc = ref.watch(trainerIncomesProvider);
    final AsyncValue<List<Expense>> exp = ref.watch(trainerExpensesProvider);
    if (inc.isLoading || exp.isLoading) return const Center(child: CircularProgressIndicator());
    if (inc.hasError || exp.hasError) {
      return _err(c, () {
        ref.invalidate(trainerIncomesProvider);
        ref.invalidate(trainerExpensesProvider);
      });
    }
    final List<Income> incomes =
        (inc.valueOrNull ?? <Income>[]).where((Income e) => _inRange(e.date)).toList();
    final List<Expense> expenses =
        (exp.valueOrNull ?? <Expense>[]).where((Expense e) => _inRange(e.date)).toList();
    final num incomeTotal = incomes.fold<num>(0, (num a, Income e) => a + e.amount);
    final num expenseTotal = expenses.fold<num>(0, (num a, Expense e) => a + e.amount);
    final Map<String, String> names = _clientNames();

    // Единый список операций по фильтру (доходы и/или расходы).
    final List<_Op> ops = <_Op>[];
    if (_filter != _Filter.expense) {
      for (final Income e in incomes) {
        ops.add(_Op(
          date: e.date,
          primary: e.title ?? (e.clientId != null ? (names[e.clientId] ?? e.category) : e.category),
          kicker: e.category,
          meta: <String>[
            if (e.subtitle?.isNotEmpty == true) e.subtitle!,
            if (e.note?.isNotEmpty == true) e.note!,
          ].join(' · '),
          amount: e.amount,
          isIncome: true,
          tags: e.tags,
          onTap: e.isPackage
              ? (e.clientId != null ? () => _openClient(e.clientId!) : null)
              : () => _editIncome(e),
        ));
      }
    }
    if (_filter != _Filter.income) {
      for (final Expense e in expenses) {
        ops.add(_Op(
          date: e.date,
          primary: e.category,
          kicker: e.category,
          meta: e.note ?? '',
          amount: e.amount,
          isIncome: false,
          tags: e.tags,
          onTap: () => _editExpense(e),
        ));
      }
    }
    ops.sort((_Op a, _Op b) => (b.date ?? DateTime(0)).compareTo(a.date ?? DateTime(0)));
    final List<String> cats = ops.map((_Op o) => o.kicker).toSet().toList()..sort();
    final List<_Op> shown = ops.where((_Op o) {
      if (_catFilter.isNotEmpty && o.kicker != _catFilter) return false;
      if (_tagFilter.isNotEmpty && !o.tags.contains(_tagFilter)) return false;
      return true;
    }).toList();

    return Column(
      children: <Widget>[
        _summaryCards(c, incomeTotal, expenseTotal),
        _catChips(c, cats),
        Expanded(
          child: shown.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text('Операций нет', style: TextStyle(color: c.inkMuted)),
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 6, 16, 96),
                  itemCount: shown.length,
                  itemBuilder: (BuildContext ctx, int i) {
                    final _Op o = shown[i];
                    return _entryRow(c, o.primary, o.kicker, o.meta, o.amount,
                        sign: o.isIncome ? '+' : '−',
                        color: o.isIncome ? c.accent : c.inkMuted,
                        tags: o.tags,
                        onTap: o.onTap);
                  },
                ),
        ),
      ],
    );
  }

  /// Карточки сводки: прибыль + доходы/расходы. Доходы/расходы — фильтры списка
  /// (тап → показать только их; тап по активной/по прибыли → все операции).
  Widget _summaryCards(AppColors c, num income, num expense) {
    final num balance = income - expense;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          GestureDetector(
            onTap: () => setState(() {
              _filter = _Filter.all;
              _catFilter = '';
              _tagFilter = '';
            }),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
              decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(18)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text('ПРИБЫЛЬ ЗА ПЕРИОД',
                      style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Text(_money(balance),
                      style: AppFonts.display(
                          size: 40, color: balance >= 0 ? c.accent : c.danger, letterSpacing: -1)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: <Widget>[
              Expanded(
                child: _statCard(c, 'Доходы', income, c.accent,
                    active: _filter == _Filter.income, onTap: () => _toggleFilter(_Filter.income)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _statCard(c, 'Расходы', expense, c.inkMuted,
                    active: _filter == _Filter.expense, onTap: () => _toggleFilter(_Filter.expense)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _toggleFilter(_Filter f) => setState(() {
        _filter = _filter == f ? _Filter.all : f;
        _catFilter = '';
        _tagFilter = '';
      });

  /// FAB: добавить операцию. В фильтре доход/расход — сразу нужную; иначе — выбор.
  Future<void> _onAdd() async {
    switch (_filter) {
      case _Filter.income:
        await _showAddSheet(true);
      case _Filter.expense:
        await _showAddSheet(false);
      case _Filter.all:
        await _showAddChooser();
    }
  }

  Future<void> _showAddChooser() async {
    final bool? isIncome = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: context.colors.bg,
      showDragHandle: true,
      builder: (BuildContext ctx) {
        final AppColors c = ctx.colors;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 0, 8, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                ListTile(
                  leading: Icon(Icons.add, color: c.accent),
                  title: const Text('Добавить доход'),
                  onTap: () => Navigator.pop(ctx, true),
                ),
                ListTile(
                  leading: Icon(Icons.remove, color: c.inkMuted),
                  title: const Text('Добавить расход'),
                  onTap: () => Navigator.pop(ctx, false),
                ),
              ],
            ),
          ),
        );
      },
    );
    if (isIncome != null) await _showAddSheet(isIncome);
  }

  Widget _statCard(AppColors c, String label, num value, Color color,
          {bool active = false, VoidCallback? onTap}) =>
      GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
          decoration: BoxDecoration(
            color: c.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: active ? c.accent : Colors.transparent, width: 1.5),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(label.toUpperCase(),
                  style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w700)),
              const SizedBox(height: 6),
              Text(_money(value),
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
            ],
          ),
        ),
      );

  Widget _catChips(AppColors c, List<String> cats) {
    if (cats.isEmpty) return const SizedBox(height: 4);
    return SizedBox(
      height: 38,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: <Widget>[
          _Chip(label: 'Все', active: _catFilter.isEmpty, onTap: () => setState(() => _catFilter = '')),
          ...cats.map((String g) => _Chip(label: g, active: _catFilter == g, onTap: () => setState(() => _catFilter = g))),
        ],
      ),
    );
  }

  Widget _entryRow(AppColors c, String primary, String kicker, String meta, num amount,
      {required String sign, required Color color, List<String> tags = const <String>[], VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 10, 12, 10),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                if (kicker != primary)
                  Text(kicker.toUpperCase(), style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w600)),
                Text(primary,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                if (meta.isNotEmpty)
                  Text(meta, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: c.inkMuted)),
                if (tags.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: tags
                          .map((String t) => GestureDetector(
                                onTap: () => setState(() => _tagFilter = _tagFilter == t ? '' : t),
                                child: Text('#$t',
                                    style: AppFonts.mono(
                                        size: 11,
                                        color: _tagFilter == t ? c.accent : c.inkMutedXl,
                                        weight: FontWeight.w600)),
                              ))
                          .toList(),
                    ),
                  ),
              ],
            ),
          ),
          Text('$sign${_money(amount)}', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: color)),
          if (onTap != null)
            Padding(
              padding: const EdgeInsets.only(left: 4),
              child: Icon(Icons.chevron_right, size: 18, color: c.inkMutedXl),
            ),
        ],
      ),
      ),
    );
  }

  Map<String, String> _clientNames() {
    final List<Client> cs = ref.watch(trainerClientsProvider).valueOrNull ?? <Client>[];
    return <String, String>{for (final Client c in cs) c.id: c.fullName};
  }

  Widget _err(AppColors c, VoidCallback retry) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text('Не удалось загрузить', style: TextStyle(color: c.inkMuted)),
            const SizedBox(height: 12),
            FilledButton(onPressed: retry, child: const Text('Повторить')),
          ],
        ),
      );

  Future<void> _showAddSheet(bool isIncome) async {
    // Доход добавляется полной формой IncomeForm (типы Пакет/Абонемент/…,
    // график рассрочки, выбор клиента поиском). Расход — прежней шторкой.
    final bool? saved = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => isIncome
          ? const IncomeForm()
          : const _AddEntrySheet(isIncome: false, categories: _kExpenseCats),
    );
    if (saved == true) {
      ref.invalidate(isIncome ? trainerIncomesProvider : trainerExpensesProvider);
    }
  }

  Future<void> _editIncome(Income e) async {
    final bool? changed = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _AddEntrySheet(
        isIncome: true,
        categories: _withCategory(_kIncomeCats, e.category),
        edit: _EntryEdit(
          id: e.id,
          category: e.category,
          amount: e.amount,
          date: e.date,
          note: e.note,
          tags: e.tags,
          clientId: e.clientId,
        ),
      ),
    );
    if (changed == true) ref.invalidate(trainerIncomesProvider);
  }

  Future<void> _editExpense(Expense e) async {
    final bool? changed = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _AddEntrySheet(
        isIncome: false,
        categories: _withCategory(_kExpenseCats, e.category),
        edit: _EntryEdit(
          id: e.id,
          category: e.category,
          amount: e.amount,
          date: e.date,
          note: e.note,
          tags: e.tags,
          clientId: e.clientId,
        ),
      ),
    );
    if (changed == true) ref.invalidate(trainerExpensesProvider);
  }

  // Гарантируем, что текущая категория записи есть в списке чипов (для старых
  // значений вроде «Фарма», убранных из выбора для новых записей).
  List<String> _withCategory(List<String> base, String cat) =>
      base.contains(cat) ? base : <String>[cat, ...base];

  void _openClient(String clientId) {
    final List<Client> cs = ref.read(trainerClientsProvider).valueOrNull ?? <Client>[];
    Client? cl;
    for (final Client c in cs) {
      if (c.id == clientId) {
        cl = c;
        break;
      }
    }
    if (cl != null) context.push('/client/${cl.id}', extra: cl);
  }
}

class _Round extends StatelessWidget {
  const _Round({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(color: c.card, shape: BoxShape.circle, border: Border.all(color: c.line)),
        child: Icon(icon, size: 20, color: c.ink),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(color: active ? c.accent : c.chip, borderRadius: BorderRadius.circular(20)),
          child: Text(label,
              style: AppFonts.mono(size: 12, color: active ? c.accentOn : c.inkMuted, weight: FontWeight.w600)),
        ),
      ),
    );
  }
}

/// Выбор зала для расхода (опционально).
class _GymPicker extends ConsumerWidget {
  const _GymPicker({required this.selected, required this.onPick});
  final String? selected;
  final ValueChanged<String?> onPick;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final List<Gym> gyms = ref.watch(trainerGymsProvider).valueOrNull ?? <Gym>[];
    if (gyms.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: <Widget>[
        _Pill(label: 'Без зала', active: selected == null, onTap: () => onPick(null)),
        ...gyms.map((Gym g) => _Pill(label: g.name, active: selected == g.id, onTap: () => onPick(g.id))),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(color: active ? c.accent : c.chip, borderRadius: BorderRadius.circular(18)),
        child: Text(label,
            style: AppFonts.mono(size: 11, color: active ? c.accentOn : c.inkMuted, weight: FontWeight.w600)),
      ),
    );
  }
}

/// Категории источников. «Фарма» убрана из доходов.
const List<String> _kIncomeCats = <String>['Тренировка', 'Консультация', 'Прочее'];
const List<String> _kExpenseCats = <String>['Аренда', 'Инвентарь', 'Обучение', 'Прочее'];

/// Данные редактируемой записи для префилла формы.
class _EntryEdit {
  _EntryEdit({
    required this.id,
    required this.category,
    required this.amount,
    this.date,
    this.note,
    this.tags = const <String>[],
    this.clientId,
  });
  final String id;
  final String category;
  final num amount;
  final DateTime? date;
  final String? note;
  final List<String> tags;
  final String? clientId;
}

/// Форма добавления/редактирования дохода/расхода (категория, сумма, дата,
/// заметка, теги; для дохода — привязка клиента). В режиме правки доступны
/// «Перейти к клиенту» и «Удалить».
class _AddEntrySheet extends ConsumerStatefulWidget {
  const _AddEntrySheet({required this.isIncome, required this.categories, this.edit});
  final bool isIncome;
  final List<String> categories;
  final _EntryEdit? edit;

  @override
  ConsumerState<_AddEntrySheet> createState() => _AddEntrySheetState();
}

class _AddEntrySheetState extends ConsumerState<_AddEntrySheet> {
  late String _category = widget.edit?.category ?? widget.categories.first;
  late final TextEditingController _amount =
      TextEditingController(text: widget.edit != null ? _amountText(widget.edit!.amount) : '');
  late final TextEditingController _note = TextEditingController(text: widget.edit?.note ?? '');
  late final TextEditingController _tags = TextEditingController(
      text: (widget.edit?.tags ?? const <String>[]).map((String t) => '#$t').join(' '));
  String? _gymId;
  late String? _clientId = widget.edit?.clientId;
  late DateTime _date = widget.edit?.date ?? DateTime.now();
  bool _busy = false;

  bool get _isEdit => widget.edit != null;

  static String _amountText(num a) => a % 1 == 0 ? a.toInt().toString() : a.toString();

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    _tags.dispose();
    super.dispose();
  }

  List<String> _parseTags() => _tags.text
      .split(RegExp(r'[,\s]+'))
      .map((String s) => s.replaceAll('#', '').trim())
      .where((String s) => s.isNotEmpty)
      .toList();

  Future<void> _save() async {
    final num? amount = num.tryParse(_amount.text.trim().replaceAll(',', '.'));
    if (amount == null || amount <= 0 || _busy) return;
    setState(() => _busy = true);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    final NavigatorState nav = Navigator.of(context);
    final List<String> tags = _parseTags();
    final Map<String, dynamic> body = <String, dynamic>{
      'category': _category,
      'amount': amount,
      'date': _iso(_date),
      'note': _note.text.trim().isEmpty ? null : _note.text.trim(),
      'tags': tags,
      if (widget.isIncome) 'clientId': _clientId,
      if (!widget.isIncome && _gymId != null) 'gymId': _gymId,
    };
    try {
      final TrainerAccountingApi api = ref.read(trainerAccountingApiProvider);
      if (widget.isIncome) {
        _isEdit ? await api.updateIncome(widget.edit!.id, body) : await api.createIncome(body);
      } else {
        _isEdit ? await api.updateExpense(widget.edit!.id, body) : await api.createExpense(body);
      }
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось сохранить')));
    }
  }

  Future<void> _delete() async {
    if (_busy || !_isEdit) return;
    if (!await confirmDelete(context, title: 'Удалить операцию?')) return;
    if (!mounted) return;
    setState(() => _busy = true);
    final NavigatorState nav = Navigator.of(context);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      final TrainerAccountingApi api = ref.read(trainerAccountingApiProvider);
      if (widget.isIncome) {
        await api.deleteIncome(widget.edit!.id);
      } else {
        await api.deleteExpense(widget.edit!.id);
      }
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось удалить')));
    }
  }

  /// Имя выбранного клиента по id (для показа в поле-кнопке).
  String? _clientName() {
    final String? id = _clientId;
    if (id == null) return null;
    final List<Client> cs = ref.read(trainerClientsProvider).valueOrNull ?? <Client>[];
    for (final Client c in cs) {
      if (c.id == id) return c.fullName;
    }
    return null;
  }

  /// Поле-кнопка выбора клиента через поиск (общая с формой дохода).
  Widget _clientField(AppColors c) {
    final String? name = _clientName();
    final bool picked = _clientId != null;
    return Row(
      children: <Widget>[
        Expanded(
          child: InkWell(
            onTap: () async {
              final Client? cl = await pickClientSearch(context, ref, selectedId: _clientId);
              if (cl != null) setState(() => _clientId = cl.id);
            },
            borderRadius: BorderRadius.circular(14),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
              child: Row(
                children: <Widget>[
                  Icon(picked ? Icons.person : Icons.person_search, size: 18, color: c.inkMuted),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      picked ? (name ?? 'Клиент') : 'Выбрать клиента',
                      style: TextStyle(fontSize: 14, color: picked ? c.ink : c.inkMuted),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (picked)
          IconButton(
            icon: Icon(Icons.close, size: 18, color: c.inkMuted),
            onPressed: () => setState(() => _clientId = null),
            tooltip: 'Без клиента',
          ),
      ],
    );
  }

  void _goToClient() {
    final String? id = _clientId;
    if (id == null) return;
    final List<Client> cs = ref.read(trainerClientsProvider).valueOrNull ?? <Client>[];
    Client? cl;
    for (final Client c in cs) {
      if (c.id == id) {
        cl = c;
        break;
      }
    }
    Navigator.of(context).pop(false);
    if (cl != null) context.push('/client/${cl.id}', extra: cl);
  }

  // Поле даты в едином стиле формы (как в IncomeForm): подписанное, filled, radius 14.
  Widget _dateField(AppColors c) {
    return InkWell(
      onTap: () async {
        final DateTime now = DateTime.now();
        final DateTime? d = await showDatePicker(
          context: context,
          initialDate: _date,
          firstDate: DateTime(now.year - 5),
          lastDate: DateTime(now.year + 1),
        );
        if (d != null) setState(() => _date = d);
      },
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: 'Дата',
          filled: true,
          fillColor: c.card,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        ),
        child: Text('${_date.day} ${_ruMonthsShort[_date.month - 1]} ${_date.year}'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
              _isEdit
                  ? (widget.isIncome ? 'Редактировать доход' : 'Редактировать расход')
                  : (widget.isIncome ? 'Новый доход' : 'Новый расход'),
              style: AppFonts.display(size: 22, color: c.ink)),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: widget.categories
                .map((String g) => _Chip(label: g, active: _category == g, onTap: () => setState(() => _category = g)))
                .toList(),
          ),
          if (widget.isIncome) ...<Widget>[
            const SizedBox(height: 14),
            Text('КЛИЕНТ', style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w600)),
            const SizedBox(height: 8),
            _clientField(c),
          ],
          const SizedBox(height: 14),
          SelectAllTextField(
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
            decoration: InputDecoration(
              labelText: 'Сумма, ₽',
              filled: true,
              fillColor: c.card,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 10),
          _dateField(c),
          const SizedBox(height: 10),
          SelectAllTextField(
            controller: _note,
            decoration: InputDecoration(
              labelText: 'Заметка (необязательно)',
              filled: true,
              fillColor: c.card,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 10),
          SelectAllTextField(
            controller: _tags,
            decoration: InputDecoration(
              hintText: 'Теги через пробел: #абонемент #нал',
              filled: true,
              fillColor: c.card,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
          if (!widget.isIncome) ...<Widget>[
            const SizedBox(height: 10),
            _GymPicker(selected: _gymId, onPick: (String? id) => setState(() => _gymId = id)),
          ],
          const SizedBox(height: 14),
          FilledButton(
            onPressed: _busy ? null : _save,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: const Text('Сохранить'),
          ),
          if (widget.isIncome && _clientId != null) ...<Widget>[
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _busy ? null : _goToClient,
              icon: const Icon(Icons.person_outline, size: 18),
              label: const Text('Перейти к клиенту'),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
            ),
          ],
          if (_isEdit) ...<Widget>[
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: _busy ? null : _delete,
              icon: Icon(Icons.delete_outline, size: 18, color: c.danger),
              label: Text('Удалить', style: TextStyle(color: c.danger)),
              style: TextButton.styleFrom(minimumSize: const Size.fromHeight(46)),
            ),
          ],
        ],
      ),
    );
  }
}

