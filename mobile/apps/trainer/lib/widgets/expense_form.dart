import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_accounting.dart';
import '../api/trainer_gyms.dart';

/// Категории расхода (без «Фарма»).
const List<String> _kExpenseCategories = <String>['Аренда', 'Инвентарь', 'Обучение', 'Прочее'];

/// Форма «Новый расход» — в едином стиле с [IncomeForm]: чипы категории, сумма,
/// дата, заметка, теги и (если есть залы) выбор зала.
class ExpenseForm extends ConsumerStatefulWidget {
  const ExpenseForm({super.key});
  @override
  ConsumerState<ExpenseForm> createState() => _ExpenseFormState();
}

class _ExpenseFormState extends ConsumerState<ExpenseForm> {
  String _category = _kExpenseCategories.first;
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _note = TextEditingController();
  final TextEditingController _tags = TextEditingController();
  String? _gymId;
  DateTime _date = DateTime.now();
  bool _busy = false;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    _tags.dispose();
    super.dispose();
  }

  String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  String _fmtRu(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';

  List<String> _parseTags() => _tags.text
      .split(RegExp(r'[,\s]+'))
      .map((String s) => s.replaceAll('#', '').trim())
      .where((String s) => s.isNotEmpty)
      .toList();

  Future<void> _save() async {
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    final NavigatorState nav = Navigator.of(context);
    final num? amount = num.tryParse(_amount.text.trim().replaceAll(',', '.'));
    if (amount == null || amount <= 0) {
      m.showSnackBar(const SnackBar(content: Text('Укажите сумму')));
      return;
    }
    setState(() => _busy = true);
    final List<String> tags = _parseTags();
    try {
      await ref.read(trainerAccountingApiProvider).createExpense(<String, dynamic>{
        'category': _category,
        'amount': amount,
        'date': _iso(_date),
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
        if (tags.isNotEmpty) 'tags': tags,
        if (_gymId != null) 'gymId': _gymId,
      });
      ref.invalidate(trainerExpensesProvider);
      if (!mounted) return;
      nav.pop(true);
      m.showSnackBar(const SnackBar(content: Text('Расход добавлен')));
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось сохранить')));
    }
  }

  InputDecoration _dec(AppColors c, String label) => InputDecoration(
        labelText: label,
        filled: true,
        fillColor: c.card,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      );

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final List<Gym> gyms = ref.watch(trainerGymsProvider).valueOrNull ?? <Gym>[];
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Новый расход', style: AppFonts.display(size: 22, color: c.ink)),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _kExpenseCategories
                  .map((String g) => _ExpenseChip(
                        label: g,
                        active: _category == g,
                        onTap: () => setState(() => _category = g),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 14),
            SelectAllTextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
              decoration: _dec(c, 'Сумма, ₽'),
            ),
            const SizedBox(height: 12),
            _dateField(c, 'Дата', _date, (DateTime d) => setState(() => _date = d)),
            const SizedBox(height: 12),
            SelectAllTextField(controller: _note, decoration: _dec(c, 'Заметка (необязательно)')),
            const SizedBox(height: 12),
            SelectAllTextField(controller: _tags, decoration: _dec(c, 'Теги через пробел: #аренда')),
            if (gyms.isNotEmpty) ...<Widget>[
              const SizedBox(height: 14),
              Text('ЗАЛ', style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w600)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: <Widget>[
                  _ExpenseChip(label: 'Без зала', active: _gymId == null, onTap: () => setState(() => _gymId = null)),
                  ...gyms.map((Gym g) =>
                      _ExpenseChip(label: g.name, active: _gymId == g.id, onTap: () => setState(() => _gymId = g.id))),
                ],
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _save,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              child: _busy
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Сохранить расход'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _dateField(AppColors c, String label, DateTime value, ValueChanged<DateTime> onPick) {
    return InkWell(
      onTap: () async {
        final DateTime now = DateTime.now();
        final DateTime? d = await showDatePicker(
            context: context, initialDate: value, firstDate: DateTime(now.year - 5), lastDate: DateTime(now.year + 1));
        if (d != null) onPick(d);
      },
      child: InputDecorator(
        decoration: _dec(c, label),
        child: Text(_fmtRu(value)),
      ),
    );
  }
}

class _ExpenseChip extends StatelessWidget {
  const _ExpenseChip({required this.label, required this.active, required this.onTap});
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
