import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_accounting.dart';
import '../api/trainer_clients.dart';

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
enum _Tab { summary, income, expense }

class AccountingScreen extends ConsumerStatefulWidget {
  const AccountingScreen({super.key});

  @override
  ConsumerState<AccountingScreen> createState() => _AccountingScreenState();
}

class _AccountingScreenState extends ConsumerState<AccountingScreen> {
  _Mode _mode = _Mode.month;
  _Tab _tab = _Tab.summary;
  DateTime _anchor = DateTime.now();
  DateTime _customFrom = DateTime(DateTime.now().year, DateTime.now().month, 1);
  DateTime _customTo = DateTime.now();

  // Фильтры списков.
  String _catFilter = '';

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
      floatingActionButton: _tab == _Tab.summary
          ? null
          : FloatingActionButton(
              onPressed: () => _showAddSheet(_tab == _Tab.income),
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
            _tabBar(c),
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

  Widget _tabBar(AppColors c) {
    Widget tab(String label, _Tab t) => GestureDetector(
          onTap: () => setState(() {
            _tab = t;
            _catFilter = '';
          }),
          child: Container(
            margin: const EdgeInsets.only(right: 8),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
                color: _tab == t ? c.accent : c.chip, borderRadius: BorderRadius.circular(20)),
            child: Text(label,
                style: AppFonts.mono(
                    size: 12, color: _tab == t ? c.accentOn : c.inkMuted, weight: FontWeight.w700)),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 2, 16, 8),
      child: Row(children: <Widget>[tab('Сводка', _Tab.summary), tab('Доходы', _Tab.income), tab('Расходы', _Tab.expense)]),
    );
  }

  Widget _body(AppColors c) {
    switch (_tab) {
      case _Tab.summary:
        return _summaryBody(c);
      case _Tab.income:
        return _incomeBody(c);
      case _Tab.expense:
        return _expenseBody(c);
    }
  }

  // ─── Сводка ───
  Widget _summaryBody(AppColors c) {
    final AsyncValue<List<Income>> inc = ref.watch(trainerIncomesProvider);
    final AsyncValue<List<Expense>> exp = ref.watch(trainerExpensesProvider);
    if (inc.isLoading || exp.isLoading) return const Center(child: CircularProgressIndicator());
    final num income = (inc.valueOrNull ?? <Income>[]).where((Income e) => _inRange(e.date)).fold<num>(0, (num a, Income e) => a + e.amount);
    final num expense = (exp.valueOrNull ?? <Expense>[]).where((Expense e) => _inRange(e.date)).fold<num>(0, (num a, Expense e) => a + e.amount);
    final num balance = income - expense;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: <Widget>[
        Container(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(18)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text('ПРИБЫЛЬ ЗА ПЕРИОД', style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w700)),
              const SizedBox(height: 6),
              Text(_money(balance),
                  style: AppFonts.display(size: 40, color: balance >= 0 ? c.accent : c.danger, letterSpacing: -1)),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: <Widget>[
            Expanded(child: _statCard(c, 'Доходы', income, c.accent)),
            const SizedBox(width: 10),
            Expanded(child: _statCard(c, 'Расходы', expense, c.inkMuted)),
          ],
        ),
      ],
    );
  }

  Widget _statCard(AppColors c, String label, num value, Color color) => Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(label.toUpperCase(), style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text(_money(value), style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
          ],
        ),
      );

  // ─── Доходы ───
  Widget _incomeBody(AppColors c) {
    final AsyncValue<List<Income>> inc = ref.watch(trainerIncomesProvider);
    final Map<String, String> names = _clientNames();
    return inc.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (Object e, _) => _err(c, () => ref.invalidate(trainerIncomesProvider)),
      data: (List<Income> all) {
        final List<Income> ranged = all.where((Income e) => _inRange(e.date)).toList()
          ..sort((Income a, Income b) => (b.date ?? DateTime(0)).compareTo(a.date ?? DateTime(0)));
        final List<String> cats = ranged.map((Income e) => e.category).toSet().toList()..sort();
        final List<Income> list = _catFilter.isEmpty ? ranged : ranged.where((Income e) => e.category == _catFilter).toList();
        final num subtotal = list.fold<num>(0, (num a, Income e) => a + e.amount);
        return Column(
          children: <Widget>[
            _catChips(c, cats),
            _subtotalBar(c, 'Доходы', subtotal, c.accent),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                itemCount: list.length,
                itemBuilder: (BuildContext ctx, int i) {
                  final Income e = list[i];
                  final String primary = e.title ?? (e.clientId != null ? (names[e.clientId] ?? e.category) : e.category);
                  final String meta = <String>[
                    if (e.subtitle?.isNotEmpty == true) e.subtitle!,
                    if (e.note?.isNotEmpty == true) e.note!,
                  ].join(' · ');
                  return _entryRow(c, primary, e.category, meta, e.amount, sign: '+', color: c.accent,
                      onDelete: e.isPackage ? null : () => _deleteIncome(e.id));
                },
              ),
            ),
          ],
        );
      },
    );
  }

  // ─── Расходы ───
  Widget _expenseBody(AppColors c) {
    final AsyncValue<List<Expense>> exp = ref.watch(trainerExpensesProvider);
    return exp.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (Object e, _) => _err(c, () => ref.invalidate(trainerExpensesProvider)),
      data: (List<Expense> all) {
        final List<Expense> ranged = all.where((Expense e) => _inRange(e.date)).toList()
          ..sort((Expense a, Expense b) => (b.date ?? DateTime(0)).compareTo(a.date ?? DateTime(0)));
        final List<String> cats = ranged.map((Expense e) => e.category).toSet().toList()..sort();
        final List<Expense> list = _catFilter.isEmpty ? ranged : ranged.where((Expense e) => e.category == _catFilter).toList();
        final num subtotal = list.fold<num>(0, (num a, Expense e) => a + e.amount);
        return Column(
          children: <Widget>[
            _catChips(c, cats),
            _subtotalBar(c, 'Расходы', subtotal, c.inkMuted),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                itemCount: list.length,
                itemBuilder: (BuildContext ctx, int i) {
                  final Expense e = list[i];
                  return _entryRow(c, e.category, e.category, e.note ?? '', e.amount,
                      sign: '−', color: c.inkMuted, onDelete: () => _deleteExpense(e.id));
                },
              ),
            ),
          ],
        );
      },
    );
  }

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

  Widget _subtotalBar(AppColors c, String label, num value, Color color) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
        child: Row(
          children: <Widget>[
            Text('${label.toUpperCase()} ЗА ПЕРИОД', style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w700)),
            const Spacer(),
            Text(_money(value), style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color)),
          ],
        ),
      );

  Widget _entryRow(AppColors c, String primary, String kicker, String meta, num amount,
      {required String sign, required Color color, VoidCallback? onDelete}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
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
              ],
            ),
          ),
          Text('$sign${_money(amount)}', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: color)),
          if (onDelete != null)
            GestureDetector(
              onTap: onDelete,
              child: Padding(
                padding: const EdgeInsets.only(left: 4),
                child: Icon(Icons.delete_outline, size: 18, color: c.inkMutedXl),
              ),
            )
          else
            const SizedBox(width: 8),
        ],
      ),
    );
  }

  Map<String, String> _clientNames() {
    final List<Client> cs = ref.watch(trainerClientsProvider).valueOrNull ?? <Client>[];
    return <String, String>{for (final Client c in cs) c.id: c.fullName};
  }

  Future<void> _deleteIncome(String id) async {
    try {
      await ref.read(trainerAccountingApiProvider).deleteIncome(id);
      ref.invalidate(trainerIncomesProvider);
    } catch (_) {}
  }

  Future<void> _deleteExpense(String id) async {
    try {
      await ref.read(trainerAccountingApiProvider).deleteExpense(id);
      ref.invalidate(trainerExpensesProvider);
    } catch (_) {}
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
    final List<String> cats = isIncome
        ? const <String>['Тренировка', 'Консультация', 'Фарма', 'Прочее']
        : const <String>['Аренда', 'Инвентарь', 'Обучение', 'Фарма', 'Прочее'];
    final bool? saved = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _AddEntrySheet(isIncome: isIncome, categories: cats),
    );
    if (saved == true) {
      ref.invalidate(isIncome ? trainerIncomesProvider : trainerExpensesProvider);
    }
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

/// Форма добавления дохода/расхода (категория, сумма, дата, заметка).
class _AddEntrySheet extends ConsumerStatefulWidget {
  const _AddEntrySheet({required this.isIncome, required this.categories});
  final bool isIncome;
  final List<String> categories;

  @override
  ConsumerState<_AddEntrySheet> createState() => _AddEntrySheetState();
}

class _AddEntrySheetState extends ConsumerState<_AddEntrySheet> {
  late String _category = widget.categories.first;
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _note = TextEditingController();
  DateTime _date = DateTime.now();
  bool _busy = false;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final num? amount = num.tryParse(_amount.text.trim().replaceAll(',', '.'));
    if (amount == null || amount <= 0 || _busy) return;
    setState(() => _busy = true);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    final NavigatorState nav = Navigator.of(context);
    final Map<String, dynamic> body = <String, dynamic>{
      'category': _category,
      'amount': amount,
      'date': _iso(_date),
      'note': _note.text.trim().isEmpty ? null : _note.text.trim(),
    };
    try {
      final TrainerAccountingApi api = ref.read(trainerAccountingApiProvider);
      if (widget.isIncome) {
        await api.createIncome(body);
      } else {
        await api.createExpense(body);
      }
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось сохранить')));
    }
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
          Text(widget.isIncome ? 'Новый доход' : 'Новый расход',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: widget.categories
                .map((String g) => _Chip(label: g, active: _category == g, onTap: () => setState(() => _category = g)))
                .toList(),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
            style: AppFonts.display(size: 28, color: c.ink),
            decoration: InputDecoration(
              hintText: '0 ₽',
              filled: true,
              fillColor: c.card,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: <Widget>[
              GestureDetector(
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
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Icon(Icons.event, size: 16, color: c.inkMuted),
                      const SizedBox(width: 8),
                      Text('${_date.day} ${_ruMonthsShort[_date.month - 1]} ${_date.year}',
                          style: TextStyle(fontSize: 13, color: c.ink)),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _note,
            decoration: InputDecoration(
              hintText: 'Заметка (необязательно)',
              filled: true,
              fillColor: c.card,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: _busy ? null : _save,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: const Text('Сохранить'),
          ),
        ],
      ),
    );
  }
}
