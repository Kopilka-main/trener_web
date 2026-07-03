import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_accounting.dart';
import '../api/trainer_client_card.dart';
import '../api/trainer_clients.dart';

/// Тип дохода. package/installment/subscription → пакет; остальные → простой доход.
enum _IncomeKind { package, installment, subscription, online, inventory, other }

const Map<_IncomeKind, String> _incomeLabels = <_IncomeKind, String>{
  _IncomeKind.package: 'Пакет тренировок',
  _IncomeKind.installment: 'Рассрочка',
  _IncomeKind.subscription: 'Абонемент',
  _IncomeKind.online: 'Онлайн сопровождение',
  _IncomeKind.inventory: 'Инвентарь',
  _IncomeKind.other: 'Прочее',
};

/// Строка редактора графика рассрочки (дата + сумма).
class _InstallmentRow {
  _InstallmentRow({required this.date, String amount = ''}) : amount = TextEditingController(text: amount);
  DateTime date;
  final TextEditingController amount;
  void dispose() => amount.dispose();
}

/// Выбор клиента поиском. Возвращает выбранного [Client] или `null`, если
/// шторка закрыта без выбора. Для явного «Без клиента» используется отдельная
/// кнопка в форме — здесь она просто закрывает шторку с `null`.
Future<Client?> pickClientSearch(BuildContext context, WidgetRef ref, {String? selectedId}) {
  final AppColors c = context.colors;
  return showModalBottomSheet<Client?>(
    context: context,
    backgroundColor: c.bg,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _ClientSearchSheet(selectedId: selectedId),
  );
}

class _ClientSearchSheet extends ConsumerStatefulWidget {
  const _ClientSearchSheet({this.selectedId});
  final String? selectedId;
  @override
  ConsumerState<_ClientSearchSheet> createState() => _ClientSearchSheetState();
}

class _ClientSearchSheetState extends ConsumerState<_ClientSearchSheet> {
  final TextEditingController _query = TextEditingController();

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final List<Client> all = (ref.watch(trainerClientsProvider).valueOrNull ?? <Client>[])
        .where((Client cl) => cl.status == ClientStatus.active)
        .toList();
    final String q = _query.text.trim().toLowerCase();
    final List<Client> filtered =
        q.isEmpty ? all : all.where((Client cl) => cl.fullName.toLowerCase().contains(q)).toList();
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('Клиент', style: AppFonts.display(size: 22, color: c.ink)),
          const SizedBox(height: 12),
          SelectAllTextField(
            controller: _query,
            autofocus: true,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: 'Поиск клиента',
              prefixIcon: Icon(Icons.search, size: 18, color: c.inkMuted),
              filled: true,
              fillColor: c.card,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 8),
          Flexible(
            child: filtered.isEmpty
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Text('Ничего не найдено', style: TextStyle(fontSize: 13, color: c.inkMuted)),
                  )
                : ListView.separated(
                    shrinkWrap: true,
                    itemCount: filtered.length,
                    separatorBuilder: (BuildContext _, int i) => Divider(height: 1, color: c.line),
                    itemBuilder: (BuildContext ctx, int i) {
                      final Client cl = filtered[i];
                      final bool active = cl.id == widget.selectedId;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(cl.fullName, style: TextStyle(fontSize: 15, color: c.ink)),
                        trailing: active ? Icon(Icons.check, size: 18, color: c.accent) : null,
                        onTap: () => Navigator.of(ctx).pop(cl),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

/// Форма «Новый доход» (зеркало веб IncomeForm): чипы типа + поля по типу.
/// [clientId] опционален: если задан (карточка клиента) — без выбора клиента;
/// если `null` (Финансы) — сверху блок выбора клиента через поиск.
class IncomeForm extends ConsumerStatefulWidget {
  const IncomeForm({super.key, this.clientId});
  final String? clientId;
  @override
  ConsumerState<IncomeForm> createState() => _IncomeFormState();
}

class _IncomeFormState extends ConsumerState<IncomeForm> {
  _IncomeKind _kind = _IncomeKind.package;
  final TextEditingController _lessons = TextEditingController(text: '20');
  final TextEditingController _price = TextEditingController(); // ₽ за тренировку / период / сумма
  final TextEditingController _total = TextEditingController(); // сумма пакета (двусторонний пересчёт с _price)
  // Что тренер вводил последним для пакета: 'price' (цена за тренировку) или 'total' (сумма пакета).
  // От этого зависит, какое поле пересчитывать при смене количества тренировок.
  String _pkgAnchor = 'price';
  final TextEditingController _note = TextEditingController();
  DateTime _paidAt = DateTime.now();
  DateTime _starts = DateTime.now();
  DateTime? _ends;
  bool _busy = false;
  final List<_InstallmentRow> _plan = <_InstallmentRow>[];

  // Выбор клиента в режиме «Финансы» (clientId == null).
  String? _pickedClientId;
  String? _pickedName;

  /// Эффективный клиент: явно переданный из карточки либо выбранный поиском.
  String? get _effClientId => widget.clientId ?? _pickedClientId;
  bool get _needsClientPicker => widget.clientId == null;

  bool get _isPackage => _kind == _IncomeKind.package;
  bool get _isInstallment => _kind == _IncomeKind.installment;
  bool get _isSubscription => _kind == _IncomeKind.subscription;
  bool get _isPkgKind => _isPackage || _isInstallment || _isSubscription;

  @override
  void initState() {
    super.initState();
    _plan.add(_InstallmentRow(date: DateTime.now().add(const Duration(days: 10))));
  }

  @override
  void dispose() {
    _lessons.dispose();
    _price.dispose();
    _total.dispose();
    _note.dispose();
    for (final _InstallmentRow r in _plan) {
      r.dispose();
    }
    super.dispose();
  }

  num _rowAmount(_InstallmentRow r) => num.tryParse(r.amount.text.trim().replaceAll(',', '.')) ?? 0;

  /// Итог графика рассрочки.
  num get _planTotal => _plan.fold<num>(0, (num s, _InstallmentRow r) => s + _rowAmount(r));

  /// Валидные платежи (сумма > 0).
  List<_InstallmentRow> get _planFilled => _plan.where((_InstallmentRow r) => _rowAmount(r) > 0).toList();

  /// Рассрочка готова к сохранению: указана полная сумма, есть платежи и график
  /// покрывает всю сумму (с точностью до копейки).
  bool get _installmentComplete =>
      _totalNum > 0 && _planFilled.isNotEmpty && (_planTotal - _totalNum).abs() < 0.01;

  void _addPlanRow() {
    final DateTime base = _plan.isNotEmpty ? _plan.last.date : DateTime.now();
    // В новую строку подставляем остаток к распределению — график быстро сходится.
    final num remaining = _totalNum - _planTotal;
    setState(() => _plan.add(_InstallmentRow(
          date: base.add(const Duration(days: 10)),
          amount: remaining > 0 ? _fmtNum(remaining) : '',
        )));
  }

  void _removePlanRow(_InstallmentRow r) {
    setState(() {
      _plan.remove(r);
      r.dispose();
    });
  }

  String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  String _fmtRu(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
  num get _priceNum => num.tryParse(_price.text.trim().replaceAll(',', '.')) ?? 0;
  num get _totalNum => num.tryParse(_total.text.trim().replaceAll(',', '.')) ?? 0;
  int get _lessonsNum => int.tryParse(_lessons.text.trim()) ?? 0;

  /// Число → строка для поля: пусто при 0, целое без дробной части, иначе до 2 знаков.
  String _fmtNum(num v) {
    if (v <= 0) return '';
    if (v == v.roundToDouble()) return v.round().toString();
    return v.toStringAsFixed(2).replaceFirst(RegExp(r'\.?0+$'), '');
  }

  /// Двусторонний пересчёт цены за тренировку ↔ суммы пакета.
  /// source: 'price' — тренер правил цену → пересчитываем сумму; 'total' — правил
  /// сумму → пересчитываем цену; 'lessons' — сменилось кол-во → пересчитываем то,
  /// что НЕ трогали последним ([_pkgAnchor]).
  void _recomputePackage(String source) {
    final int n = _lessonsNum;
    if (source == 'price') {
      _pkgAnchor = 'price';
      _total.text = _fmtNum(n * _priceNum);
    } else if (source == 'total') {
      _pkgAnchor = 'total';
      _price.text = n > 0 ? _fmtNum(_totalNum / n) : '';
    } else {
      // Сменилось количество тренировок — держим последнее введённое поле как якорь.
      if (_pkgAnchor == 'total') {
        _price.text = n > 0 ? _fmtNum(_totalNum / n) : '';
      } else {
        _total.text = _fmtNum(n * _priceNum);
      }
    }
  }

  String _money(num v) {
    final int n = v.round();
    final String s = n.abs().toString();
    final StringBuffer b = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) b.write(' ');
      b.write(s[i]);
    }
    return '$b ₽';
  }

  Future<void> _openClientPicker() async {
    final Client? picked = await pickClientSearch(context, ref, selectedId: _pickedClientId);
    if (picked == null) return; // шторка закрыта без выбора — состояние не трогаем
    setState(() {
      _pickedClientId = picked.id;
      _pickedName = picked.fullName;
    });
  }

  Future<void> _save() async {
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    final NavigatorState nav = Navigator.of(context);
    final String? effClientId = _effClientId;
    // Пакет/рассрочка/абонемент требуют клиента.
    if (_isPkgKind && effClientId == null) {
      m.showSnackBar(const SnackBar(content: Text('Выберите клиента')));
      return;
    }
    if (_isInstallment) {
      if (_totalNum <= 0) {
        m.showSnackBar(const SnackBar(content: Text('Укажите полную сумму рассрочки')));
        return;
      }
      if (_planFilled.isEmpty) {
        m.showSnackBar(const SnackBar(content: Text('Добавьте хотя бы один платёж с суммой')));
        return;
      }
      if ((_planTotal - _totalNum).abs() >= 0.01) {
        final num rem = _totalNum - _planTotal;
        m.showSnackBar(SnackBar(
            content: Text(rem > 0
                ? 'Распределите всю сумму: осталось ${_money(rem)}'
                : 'Платежи превышают сумму на ${_money(-rem)}')));
        return;
      }
    } else if (_isPackage) {
      if (_totalNum <= 0) {
        m.showSnackBar(const SnackBar(content: Text('Укажите сумму пакета или стоимость тренировки')));
        return;
      }
    } else if (_priceNum <= 0) {
      m.showSnackBar(const SnackBar(content: Text('Укажите сумму')));
      return;
    }
    if (_isSubscription && _ends == null) {
      m.showSnackBar(const SnackBar(content: Text('Укажите дату окончания абонемента')));
      return;
    }
    setState(() => _busy = true);
    try {
      if (_isInstallment) {
        final List<Map<String, dynamic>> installments = _planFilled
            .map((_InstallmentRow r) => <String, dynamic>{'dueDate': _iso(r.date), 'amount': _rowAmount(r)})
            .toList();
        await ref.read(trainerClientCardApiProvider).createPackage(
              effClientId!,
              lessonsPaid: _lessonsNum,
              totalPaid: _totalNum,
              startsAt: _iso(_starts),
              endsAt: _ends != null ? _iso(_ends!) : null,
              installments: installments,
            );
        ref.invalidate(clientPackagesProvider(effClientId));
      } else if (_isPkgKind) {
        // package: lessonsPaid=N, totalPaid=сумма пакета (двусторонний ввод);
        // subscription: lessonsPaid=0, totalPaid=цена периода.
        final int lessons = _isPackage ? _lessonsNum : 0;
        final num total = _isPackage ? _totalNum : _priceNum;
        await ref.read(trainerClientCardApiProvider).createPackage(
              effClientId!,
              lessonsPaid: lessons,
              totalPaid: total,
              workoutType: _isSubscription ? 'Абонемент' : null,
              startsAt: _iso(_starts),
              endsAt: _ends != null ? _iso(_ends!) : null,
            );
        ref.invalidate(clientPackagesProvider(effClientId));
      } else {
        await ref.read(trainerAccountingApiProvider).createIncome(<String, dynamic>{
          'category': _incomeLabels[_kind],
          'amount': _priceNum,
          'date': _iso(_paidAt),
          'clientId': ?effClientId,
          if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
        });
        if (effClientId != null) ref.invalidate(clientPackagesProvider(effClientId));
      }
      ref.invalidate(trainerIncomesProvider);
      if (!mounted) return;
      nav.pop(true);
      m.showSnackBar(const SnackBar(content: Text('Доход добавлен')));
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
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Новый доход', style: AppFonts.display(size: 22, color: c.ink)),
            const SizedBox(height: 14),
            // Блок выбора клиента (только в режиме «Финансы»).
            if (_needsClientPicker) ...<Widget>[
              Text('КЛИЕНТ', style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w600)),
              const SizedBox(height: 8),
              _clientField(c),
              const SizedBox(height: 14),
            ],
            // Чипы типа.
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _IncomeKind.values
                  .map((_IncomeKind k) => _IncomeChip(
                        label: _incomeLabels[k]!,
                        active: _kind == k,
                        onTap: () => setState(() => _kind = k),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 14),
            if (_isInstallment) ...<Widget>[
              // Сначала задаём ПОЛНУЮ сумму (кол-во + цена за тренировку ↔ сумма),
              // затем разбиваем её на платежи в графике ниже.
              Row(
                children: <Widget>[
                  Expanded(
                    child: SelectAllTextField(
                      controller: _lessons,
                      keyboardType: TextInputType.number,
                      onChanged: (_) => setState(() => _recomputePackage('lessons')),
                      decoration: InputDecoration(
                        labelText: 'Тренировок',
                        filled: true,
                        fillColor: c.card,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SelectAllTextField(
                      controller: _price,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      onChanged: (_) => setState(() => _recomputePackage('price')),
                      decoration: InputDecoration(
                        labelText: '₽ за тренировку',
                        filled: true,
                        fillColor: c.card,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SelectAllTextField(
                controller: _total,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                onChanged: (_) => setState(() => _recomputePackage('total')),
                decoration: InputDecoration(
                  labelText: 'Полная сумма, ₽',
                  helperText: 'Укажите сумму (или цену за тренировку) — ниже разбейте её на платежи',
                  filled: true,
                  fillColor: c.card,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: <Widget>[
                  Expanded(child: _dateField(c, 'Дата начала', _starts, (DateTime d) => setState(() => _starts = d))),
                  const SizedBox(width: 12),
                  Expanded(child: _dateFieldOpt(c, 'Окончание (необяз.)', _ends,
                      (DateTime? d) => setState(() => _ends = d))),
                ],
              ),
              const SizedBox(height: 16),
              Text('ГРАФИК ПЛАТЕЖЕЙ',
                  style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w700)),
              const SizedBox(height: 8),
              ..._plan.map((_InstallmentRow r) => _planRow(c, r)),
            ] else if (_isPkgKind) ...<Widget>[
              Row(
                children: <Widget>[
                  if (_isPackage) ...<Widget>[
                    Expanded(
                      child: SelectAllTextField(
                        controller: _lessons,
                        keyboardType: TextInputType.number,
                        onChanged: (_) => setState(() => _recomputePackage('lessons')),
                        decoration: InputDecoration(
                          labelText: 'Тренировок',
                          filled: true,
                          fillColor: c.card,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: SelectAllTextField(
                      controller: _price,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      onChanged: (_) => setState(() {
                        if (_isPackage) _recomputePackage('price');
                      }),
                      decoration: InputDecoration(
                        labelText: _isPackage ? '₽ за тренировку' : 'Цена периода, ₽',
                        filled: true,
                        fillColor: c.card,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                      ),
                    ),
                  ),
                ],
              ),
              if (_isPackage) ...<Widget>[
                const SizedBox(height: 12),
                SelectAllTextField(
                  controller: _total,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  onChanged: (_) => setState(() => _recomputePackage('total')),
                  decoration: InputDecoration(
                    labelText: 'Сумма пакета, ₽',
                    helperText: 'Заполните любое из двух — второе посчитается само',
                    filled: true,
                    fillColor: c.card,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              _dateField(c, 'Дата оплаты', _paidAt, (DateTime d) => setState(() => _paidAt = d)),
              const SizedBox(height: 12),
              Row(
                children: <Widget>[
                  Expanded(child: _dateField(c, 'Дата начала', _starts, (DateTime d) => setState(() => _starts = d))),
                  const SizedBox(width: 12),
                  Expanded(child: _dateFieldOpt(c, _isSubscription ? 'Окончание' : 'Окончание (необяз.)', _ends,
                      (DateTime? d) => setState(() => _ends = d))),
                ],
              ),
            ] else ...<Widget>[
              SelectAllTextField(
                controller: _price,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: 'Сумма, ₽',
                  filled: true,
                  fillColor: c.card,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                ),
              ),
              const SizedBox(height: 12),
              _dateField(c, 'Дата', _paidAt, (DateTime d) => setState(() => _paidAt = d)),
            ],
            if (!_isInstallment) ...<Widget>[
              const SizedBox(height: 12),
              SelectAllTextField(
                controller: _note,
                decoration: InputDecoration(
                  labelText: 'Заметка (необязательно)',
                  filled: true,
                  fillColor: c.card,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                ),
              ),
            ],
            if (_isPackage) ...<Widget>[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 12),
                alignment: Alignment.center,
                decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
                child: Text('Итого пакет: ${_money(_totalNum)}',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
              ),
            ],
            if (_isInstallment) ...<Widget>[
              const SizedBox(height: 8),
              _remainingHint(c),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _addPlanRow,
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Добавить платёж'),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: (_busy || (_isInstallment && !_installmentComplete)) ? null : _save,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              child: _busy
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(_isPackage
                      ? 'Сохранить пакет'
                      : _isInstallment
                          ? 'Сохранить рассрочку'
                          : _isSubscription
                              ? 'Сохранить абонемент'
                              : 'Сохранить доход'),
            ),
          ],
        ),
      ),
    );
  }

  /// Поле-кнопка выбора клиента (стиль как _dateField).
  Widget _clientField(AppColors c) {
    final bool picked = _pickedClientId != null;
    return Row(
      children: <Widget>[
        Expanded(
          child: InkWell(
            onTap: _openClientPicker,
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
                      picked ? (_pickedName ?? 'Клиент') : 'Выбрать клиента',
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
            onPressed: () => setState(() {
              _pickedClientId = null;
              _pickedName = null;
            }),
            tooltip: 'Без клиента',
          ),
      ],
    );
  }

  /// Строка редактора графика: дата + сумма + удалить.
  Widget _planRow(AppColors c, _InstallmentRow r) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: <Widget>[
          Expanded(
            flex: 5,
            child: _dateField(c, 'Дата', r.date, (DateTime d) => setState(() => r.date = d)),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 4,
            child: SelectAllTextField(
              controller: r.amount,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: 'Сумма, ₽',
                filled: true,
                fillColor: c.card,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              ),
            ),
          ),
          IconButton(
            icon: Icon(Icons.close, size: 20, color: c.inkMuted),
            onPressed: _plan.length <= 1 ? null : () => _removePlanRow(r),
            tooltip: 'Удалить платёж',
          ),
        ],
      ),
    );
  }

  /// Подсказка под графиком: сколько ещё нужно распределить по платежам.
  Widget _remainingHint(AppColors c) {
    final num total = _totalNum;
    final num remaining = total - _planTotal;
    final String text;
    final Color color;
    if (total <= 0) {
      text = 'Сначала укажите полную сумму';
      color = c.inkMuted;
    } else if (remaining > 0.01) {
      text = 'Осталось распределить: ${_money(remaining)}';
      color = c.ink;
    } else if (remaining < -0.01) {
      text = 'Платежи больше суммы на ${_money(-remaining)}';
      color = c.amber;
    } else {
      text = 'График готов · ${_money(total)}';
      color = c.accent;
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
      alignment: Alignment.center,
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
      child: Text(text, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: color)),
    );
  }

  Widget _dateField(AppColors c, String label, DateTime value, ValueChanged<DateTime> onPick) {
    return InkWell(
      onTap: () async {
        final DateTime? d = await showDatePicker(
            context: context, initialDate: value, firstDate: DateTime(value.year - 2), lastDate: DateTime(value.year + 3));
        if (d != null) onPick(d);
      },
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: c.card,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        ),
        child: Text(_fmtRu(value)),
      ),
    );
  }

  Widget _dateFieldOpt(AppColors c, String label, DateTime? value, ValueChanged<DateTime?> onPick) {
    return InkWell(
      onTap: () async {
        final DateTime base = value ?? _starts;
        final DateTime? d = await showDatePicker(
            context: context, initialDate: base, firstDate: _starts, lastDate: DateTime(base.year + 3));
        if (d != null) onPick(d);
      },
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: c.card,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
          suffixIcon: value != null
              ? IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () => onPick(null))
              : const Icon(Icons.event),
        ),
        child: Text(value != null ? _fmtRu(value) : '—'),
      ),
    );
  }
}

class _IncomeChip extends StatelessWidget {
  const _IncomeChip({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(color: active ? c.accent : c.chip, borderRadius: BorderRadius.circular(20)),
        child: Text(label,
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: active ? c.accentOn : c.inkMuted)),
      ),
    );
  }
}
