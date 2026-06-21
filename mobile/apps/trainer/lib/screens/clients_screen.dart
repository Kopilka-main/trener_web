import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_accounting.dart';
import '../api/trainer_calendar.dart';
import '../api/trainer_client_card.dart';
import '../api/trainer_client_stats.dart';
import '../api/trainer_clients.dart';
import '../api/trainer_medical.dart';
import 'active_workout_screen.dart';
import 'assign_workout_screen.dart';
import 'client_edit_screen.dart';
import 'client_medical_screen.dart';

enum _Format { all, online, gym }

const List<String> _ruMonthsGen = <String>[
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

String _isoToday() {
  final DateTime n = DateTime.now();
  return '${n.year.toString().padLeft(4, '0')}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
}

/// Ближайшее запланированное занятие на клиента: clientId → Session (минимум по date+time, не раньше сегодня).
Map<String, Session> _nextSessionByClient(List<Session> sessions) {
  final String today = _isoToday();
  final Map<String, Session> out = <String, Session>{};
  for (final Session s in sessions) {
    if (s.status != SessionStatus.planned) continue;
    if (s.date.compareTo(today) < 0) continue;
    if (s.clientId.isEmpty) continue;
    final Session? cur = out[s.clientId];
    if (cur == null ||
        s.date.compareTo(cur.date) < 0 ||
        (s.date == cur.date && s.startTime.compareTo(cur.startTime) < 0)) {
      out[s.clientId] = s;
    }
  }
  return out;
}

/// Заголовок группы по дате занятия: Сегодня / Завтра / «3 июня».
String _groupLabel(String date) {
  final DateTime now = DateTime.now();
  final String today = _isoToday();
  final String tomorrow =
      '${now.add(const Duration(days: 1)).year.toString().padLeft(4, '0')}-${now.add(const Duration(days: 1)).month.toString().padLeft(2, '0')}-${now.add(const Duration(days: 1)).day.toString().padLeft(2, '0')}';
  if (date == today) return 'Сегодня';
  if (date == tomorrow) return 'Завтра';
  final DateTime? d = DateTime.tryParse(date);
  return d != null ? '${d.day} ${_ruMonthsGen[d.month - 1]}' : date;
}

class ClientsScreen extends ConsumerStatefulWidget {
  const ClientsScreen({super.key});
  @override
  ConsumerState<ClientsScreen> createState() => _ClientsScreenState();
}

class _ClientsScreenState extends ConsumerState<ClientsScreen> {
  String _query = '';
  bool _sortBySession = false; // false → алфавит, true → по ближайшему занятию
  _Format _format = _Format.all;

  bool _matchesQuery(Client c) {
    if (_query.isEmpty) return true;
    final String hay = <String>[
      c.fullName,
      if (c.phone != null) c.phone!,
      ...c.tags,
    ].join(' ').toLowerCase();
    return hay.contains(_query);
  }

  bool _matchesFormat(Client c) => switch (_format) {
        _Format.all => true,
        _Format.online => c.isOnline,
        _Format.gym => !c.isOnline,
      };

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final AsyncValue<List<Client>> clients = ref.watch(trainerClientsProvider);
    final Map<String, Session> nextByClient =
        _nextSessionByClient(ref.watch(trainerSessionsProvider).valueOrNull ?? <Session>[]);

    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.of(context).push<bool>(
          MaterialPageRoute<bool>(builder: (_) => const ClientEditScreen()),
        ),
        child: const Icon(Icons.person_add_alt),
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Text('Клиенты', style: AppFonts.display(size: 24, color: c.ink)),
            ),
            // Поиск.
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                onChanged: (String v) => setState(() => _query = v.trim().toLowerCase()),
                decoration: InputDecoration(
                  hintText: 'Поиск по имени, тегу',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  isDense: true,
                  filled: true,
                  fillColor: c.card,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                ),
              ),
            ),
            // Сортировка + фильтр формата.
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                children: <Widget>[
                  GestureDetector(
                    onTap: () => setState(() => _sortBySession = !_sortBySession),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                      decoration: BoxDecoration(
                          color: c.card, borderRadius: BorderRadius.circular(20), border: Border.all(color: c.line)),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          Icon(_sortBySession ? Icons.sort_by_alpha : Icons.calendar_month_outlined,
                              size: 15, color: c.inkMuted),
                          const SizedBox(width: 6),
                          Text(_sortBySession ? 'По алфавиту' : 'По занятию',
                              style: AppFonts.mono(size: 11, color: c.inkMuted, weight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                  const Spacer(),
                  _FormatSeg(value: _format, onChanged: (_Format f) => setState(() => _format = f)),
                ],
              ),
            ),
            Expanded(
              child: clients.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (Object e, _) => Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Text('Не удалось загрузить клиентов', style: TextStyle(color: c.inkMuted)),
                      const SizedBox(height: 12),
                      FilledButton(
                          onPressed: () => ref.invalidate(trainerClientsProvider),
                          child: const Text('Повторить')),
                    ],
                  ),
                ),
                data: (List<Client> all) {
                  final List<Client> filtered =
                      all.where((Client x) => _matchesQuery(x) && _matchesFormat(x)).toList();
                  if (filtered.isEmpty) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(_query.isEmpty ? 'Пока нет клиентов. Добавьте первого.' : 'Никого не нашлось.',
                            textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted)),
                      ),
                    );
                  }
                  return RefreshIndicator(
                    onRefresh: () async {
                      ref.invalidate(trainerClientsProvider);
                      ref.invalidate(trainerSessionsProvider);
                    },
                    child: _sortBySession
                        ? _sessionList(filtered, nextByClient)
                        : _alphaList(filtered, nextByClient),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _alphaList(List<Client> clients, Map<String, Session> next) {
    final List<Client> sorted = <Client>[...clients]
      ..sort((Client a, Client b) => a.fullName.toLowerCase().compareTo(b.fullName.toLowerCase()));
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
      itemCount: sorted.length,
      itemBuilder: (BuildContext ctx, int i) => _ClientRow(client: sorted[i], next: next[sorted[i].id]),
    );
  }

  Widget _sessionList(List<Client> clients, Map<String, Session> next) {
    // Клиенты с занятием — по (date,time); без занятия — в конец.
    final List<Client> withS = clients.where((Client c) => next[c.id] != null).toList()
      ..sort((Client a, Client b) {
        final Session sa = next[a.id]!;
        final Session sb = next[b.id]!;
        final int byDate = sa.date.compareTo(sb.date);
        return byDate != 0 ? byDate : sa.startTime.compareTo(sb.startTime);
      });
    final List<Client> without = clients.where((Client c) => next[c.id] == null).toList()
      ..sort((Client a, Client b) => a.fullName.toLowerCase().compareTo(b.fullName.toLowerCase()));

    final List<Widget> items = <Widget>[];
    String? lastHeader;
    for (final Client cl in withS) {
      final String h = _groupLabel(next[cl.id]!.date);
      if (h != lastHeader) {
        items.add(_GroupHeader(text: h));
        lastHeader = h;
      }
      items.add(_ClientRow(client: cl, next: next[cl.id]));
    }
    if (without.isNotEmpty) {
      items.add(const _GroupHeader(text: 'Без занятий'));
      items.addAll(without.map((Client cl) => _ClientRow(client: cl, next: null)));
    }
    return ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 96), children: items);
  }
}

class _FormatSeg extends StatelessWidget {
  const _FormatSeg({required this.value, required this.onChanged});
  final _Format value;
  final ValueChanged<_Format> onChanged;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    Widget seg(String label, _Format f) {
      final bool active = value == f;
      return GestureDetector(
        onTap: () => onChanged(f),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
              color: active ? c.accent : Colors.transparent, borderRadius: BorderRadius.circular(16)),
          child: Text(label,
              style: AppFonts.mono(size: 11, color: active ? c.accentOn : c.inkMuted, weight: FontWeight.w600)),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(18), border: Border.all(color: c.line)),
      child: Row(mainAxisSize: MainAxisSize.min, children: <Widget>[
        seg('Все', _Format.all),
        seg('Онлайн', _Format.online),
        seg('Зал', _Format.gym),
      ]),
    );
  }
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 12, 2, 6),
        child: Text(text.toUpperCase(),
            style: AppFonts.mono(size: 11, color: context.colors.inkMutedXl, weight: FontWeight.w700)),
      );
}

class _ClientRow extends ConsumerWidget {
  const _ClientRow({required this.client, required this.next});
  final Client client;
  final Session? next;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final String? fileId = client.avatarFileId;
    final String? url = fileId != null
        ? '${ref.read(baseUrlProvider).replaceAll(RegExp(r'/$'), '')}/api/files/$fileId'
        : null;
    final String subtitle = next != null
        ? '${_groupLabel(next!.date)}, ${next!.startTime}'
        : (client.phone?.trim().isNotEmpty == true ? client.phone!.trim() : 'без телефона');
    return Opacity(
      opacity: client.status == ClientStatus.archived ? 0.6 : 1,
      child: GestureDetector(
        onTap: () => context.push('/client/${client.id}', extra: client),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
          child: Row(
            children: <Widget>[
              AuthedAvatar(url: url, token: ref.watch(sessionProvider).token, initials: client.initials, radius: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(client.fullName.isNotEmpty ? client.fullName : 'Без имени',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                    Text(subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, size: 18, color: c.inkMutedXl),
            ],
          ),
        ),
      ),
    );
  }
}

/// Карточка клиента: контакты, теги, заметки + быстрый переход в чат.
const List<String> _ruMonths = <String>[
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];
String _date(DateTime? d) => d == null ? '' : '${d.day} ${_ruMonths[d.month - 1]} ${d.year}';

class ClientDetailScreen extends ConsumerWidget {
  const ClientDetailScreen({super.key, required this.client});
  final Client client;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(client.fullName.isNotEmpty ? client.fullName : 'Клиент'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Редактировать',
            icon: const Icon(Icons.edit_outlined),
            onPressed: () async {
              final bool? changed = await Navigator.of(context).push<bool>(
                MaterialPageRoute<bool>(builder: (_) => ClientEditScreen(client: client)),
              );
              if (changed == true && context.mounted) {
                ref.invalidate(trainerClientsProvider);
                Navigator.of(context).pop();
              }
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Row(
            children: <Widget>[
              CircleAvatar(
                radius: 28,
                backgroundColor: cs.primary.withValues(alpha: 0.18),
                child: Text(client.initials,
                    style: TextStyle(color: cs.primary, fontWeight: FontWeight.w800, fontSize: 20)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(client.fullName.isNotEmpty ? client.fullName : 'Без имени',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text(
                      <String>[
                        client.isOnline ? 'Онлайн' : 'Очно',
                        client.status == ClientStatus.active ? 'активный' : 'в архиве',
                        if (!client.hasAccount) 'без аккаунта',
                      ].join(' · '),
                      style: TextStyle(color: cs.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          if (client.phone?.trim().isNotEmpty == true)
            _InfoRow(icon: Icons.phone_outlined, text: client.phone!.trim()),
          ...client.contacts.map((ClientContact c) =>
              _InfoRow(icon: Icons.alternate_email, text: '${c.type}: ${c.value}')),
          if (client.tags.isNotEmpty) ...<Widget>[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: client.tags
                  .map((String t) => Chip(
                        label: Text(t),
                        visualDensity: VisualDensity.compact,
                      ))
                  .toList(),
            ),
          ],
          if (client.notes?.trim().isNotEmpty == true) ...<Widget>[
            const SizedBox(height: 16),
            Text('Заметки', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 6),
            Text(client.notes!.trim(), style: const TextStyle(fontSize: 15)),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: () => context.push(
                '/chat/${client.id}?name=${Uri.encodeComponent(client.fullName)}'),
            icon: const Icon(Icons.chat_bubble_outline, size: 18),
            label: const Text('Открыть чат'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          ),
          const SizedBox(height: 20),
          _Section(
            title: 'Баланс',
            action: _AddPackageButton(clientId: client.id),
            child: _PackagesBlock(clientId: client.id),
          ),
          const SizedBox(height: 16),
          _Section(
            title: 'Замеры',
            action: _RequestMeasureButton(clientId: client.id),
            child: _MeasurementsBlock(clientId: client.id),
          ),
          const SizedBox(height: 16),
          _Section(
            title: 'Мед.карта',
            action: _MedicalButton(clientId: client.id, clientName: client.fullName),
            child: _MedicalBlock(clientId: client.id, clientName: client.fullName),
          ),
          const SizedBox(height: 16),
          _Section(title: 'Статистика', child: _StatsBlock(clientId: client.id)),
          const SizedBox(height: 16),
          _Section(
            title: 'Тренировки',
            action: _AssignButton(clientId: client.id, clientName: client.fullName),
            child: _WorkoutsBlock(clientId: client.id),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

/// Заголовок секции + опциональная кнопка действия справа.
class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child, this.action});
  final String title;
  final Widget child;
  final Widget? action;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          children: <Widget>[
            Text(title.toUpperCase(),
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: c.inkMutedXl)),
            const Spacer(),
            ?action,
          ],
        ),
        const SizedBox(height: 8),
        child,
      ],
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty(this.text);
  final String text;
  @override
  Widget build(BuildContext context) =>
      Text(text, style: TextStyle(fontSize: 13, color: context.colors.inkMuted));
}

class _AddPackageButton extends ConsumerWidget {
  const _AddPackageButton({required this.clientId});
  final String clientId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return TextButton.icon(
      onPressed: () => showModalBottomSheet<void>(
        context: context,
        backgroundColor: context.colors.bg,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => _AddPackageForm(clientId: clientId),
      ),
      icon: const Icon(Icons.add, size: 16),
      label: const Text('Добавить'),
    );
  }
}

class _AddPackageForm extends ConsumerStatefulWidget {
  const _AddPackageForm({required this.clientId});
  final String clientId;
  @override
  ConsumerState<_AddPackageForm> createState() => _AddPackageFormState();
}

class _AddPackageFormState extends ConsumerState<_AddPackageForm> {
  final TextEditingController _lessons = TextEditingController(text: '8');
  final TextEditingController _total = TextEditingController();
  final TextEditingController _type = TextEditingController();
  DateTime _starts = DateTime.now();
  DateTime? _ends;
  bool _busy = false;

  @override
  void dispose() {
    _lessons.dispose();
    _total.dispose();
    _type.dispose();
    super.dispose();
  }

  String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _save() async {
    final int lessons = int.tryParse(_lessons.text.trim()) ?? 0;
    final num total = num.tryParse(_total.text.trim().replaceAll(',', '.')) ?? 0;
    if (total <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Укажите сумму')));
      return;
    }
    setState(() => _busy = true);
    final NavigatorState nav = Navigator.of(context);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      await ref.read(trainerClientCardApiProvider).createPackage(
            widget.clientId,
            lessonsPaid: lessons,
            totalPaid: total,
            workoutType: _type.text,
            startsAt: _iso(_starts),
            endsAt: _ends != null ? _iso(_ends!) : null,
          );
      ref.invalidate(clientPackagesProvider(widget.clientId));
      if (!mounted) return;
      nav.pop();
      m.showSnackBar(const SnackBar(content: Text('Пакет добавлен')));
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось добавить пакет')));
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
          Text('Новый пакет', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
          const SizedBox(height: 16),
          Row(
            children: <Widget>[
              Expanded(
                child: TextField(
                  controller: _lessons,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Тренировок', border: OutlineInputBorder()),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _total,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Сумма, ₽', border: OutlineInputBorder()),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _type,
            decoration: const InputDecoration(labelText: 'Тип (необязательно)', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton(
                  onPressed: () async {
                    final DateTime? d = await showDatePicker(
                      context: context, initialDate: _starts,
                      firstDate: DateTime(_starts.year - 1), lastDate: DateTime(_starts.year + 2));
                    if (d != null) setState(() => _starts = d);
                  },
                  child: Text('С ${_iso(_starts)}'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton(
                  onPressed: () async {
                    final DateTime? d = await showDatePicker(
                      context: context, initialDate: _ends ?? _starts,
                      firstDate: _starts, lastDate: DateTime(_starts.year + 2));
                    if (d != null) setState(() => _ends = d);
                  },
                  child: Text(_ends != null ? 'До ${_iso(_ends!)}' : 'До (необяз.)'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : _save,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: _busy
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Добавить пакет'),
          ),
        ],
      ),
    );
  }
}

class _PackagesBlock extends ConsumerWidget {
  const _PackagesBlock({required this.clientId});
  final String clientId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<TPackage>> pkgs = ref.watch(clientPackagesProvider(clientId));
    return pkgs.when(
      loading: () => const _Empty('Загрузка…'),
      error: (Object e, _) => const _Empty('Не удалось загрузить'),
      data: (List<TPackage> all) {
        final List<TPackage> active = all.where((TPackage p) => p.isActive).toList();
        // История платежей: доходы, привязанные к этому клиенту.
        final List<Income> payments = (ref.watch(trainerIncomesProvider).valueOrNull ?? <Income>[])
            .where((Income e) => e.clientId == clientId)
            .toList()
          ..sort((Income a, Income b) => (b.date ?? DateTime(0)).compareTo(a.date ?? DateTime(0)));
        if (active.isEmpty && payments.isEmpty) return const _Empty('Активных пакетов нет');
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            ...active.map((TPackage p) => Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                  child: Row(
                    children: <Widget>[
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(p.workoutType?.isNotEmpty == true ? p.workoutType! : 'Пакет',
                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                            if (p.endsAt != null)
                              Text('до ${_date(DateTime.tryParse(p.endsAt!)?.toLocal())}',
                                  style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: <Widget>[
                          Text('${p.remaining}',
                              style: AppFonts.display(size: 22, color: p.remaining > 0 ? c.accent : c.danger)),
                          Text('осталось', style: AppFonts.mono(size: 9, color: c.inkMutedXl, weight: FontWeight.w700)),
                        ],
                      ),
                    ],
                  ),
                )),
            if (payments.isNotEmpty) ...<Widget>[
              const SizedBox(height: 4),
              Text('ИСТОРИЯ ПЛАТЕЖЕЙ',
                  style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w700)),
              const SizedBox(height: 6),
              ...payments.take(8).map((Income e) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Row(
                      children: <Widget>[
                        Text(_date(e.date), style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(e.title ?? e.category,
                              maxLines: 1, overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 13, color: c.ink)),
                        ),
                        Text('+${e.amount.round()} ₽',
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.accent)),
                      ],
                    ),
                  )),
            ],
          ],
        );
      },
    );
  }
}

class _MeasurementsBlock extends ConsumerWidget {
  const _MeasurementsBlock({required this.clientId});
  final String clientId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<TMeasurement>> ms = ref.watch(clientMeasurementsProvider(clientId));
    return ms.when(
      loading: () => const _Empty('Загрузка…'),
      error: (Object e, _) => const _Empty('Не удалось загрузить'),
      data: (List<TMeasurement> all) {
        if (all.isEmpty) return const _Empty('Замеров пока нет');
        final TMeasurement last = all.first;
        final List<String> chips = <String>[
          if (last.weightKg != null) '${last.weightKg} кг',
          if (last.bodyFatPct != null) '${last.bodyFatPct}% жира',
          ...last.metrics.entries.map((MapEntry<String, num> e) => '${e.key} ${e.value}'),
        ];
        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(_date(last.date), style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: chips
                    .map((String s) => Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(color: c.chip, borderRadius: BorderRadius.circular(10)),
                          child: Text(s, style: TextStyle(fontSize: 13, color: c.ink)),
                        ))
                    .toList(),
              ),
              if (all.length > 1) ...<Widget>[
                const SizedBox(height: 8),
                Text('Всего замеров: ${all.length}',
                    style: TextStyle(fontSize: 12, color: c.inkMutedXl)),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _RequestMeasureButton extends ConsumerWidget {
  const _RequestMeasureButton({required this.clientId});
  final String clientId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return TextButton.icon(
      onPressed: () async {
        final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
        try {
          await ref.read(trainerClientCardApiProvider).requestMeasurements(clientId, null);
          m.showSnackBar(const SnackBar(content: Text('Запрос на замеры отправлен')));
        } catch (_) {
          m.showSnackBar(const SnackBar(content: Text('Не удалось отправить запрос')));
        }
      },
      icon: const Icon(Icons.straighten, size: 16),
      label: const Text('Запросить'),
    );
  }
}

String _dur(int sec) {
  if (sec <= 0) return '0';
  final int h = sec ~/ 3600;
  final int m = (sec % 3600) ~/ 60;
  return h > 0 ? '$h ч ${m > 0 ? '$m м' : ''}'.trim() : '$m м';
}

class _StatsBlock extends ConsumerWidget {
  const _StatsBlock({required this.clientId});
  final String clientId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<ClientStatsData> stats = ref.watch(clientStatsProvider(clientId));
    return stats.when(
      loading: () => const _Empty('Загрузка…'),
      error: (Object e, _) => const _Empty('Не удалось загрузить'),
      data: (ClientStatsData s) {
        if (s.completedWorkouts == 0) return const _Empty('Нет проведённых тренировок');
        final List<(String, String)> cells = <(String, String)>[
          ('${s.completedWorkouts}', 'тренировок'),
          ('${s.tonnageKg}', 'кг тоннаж'),
          ('${s.doneSets}', 'подходов'),
          ('${s.totalReps}', 'повторов'),
          (s.avgRpe != null ? '${s.avgRpe}' : '—', 'средний RPE'),
          (_dur(s.totalDurationSec), 'в зале'),
        ];
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 1.7,
              children: cells
                  .map(((String, String) cell) => Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: c.card,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: c.line),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.centerLeft,
                              child: Text(cell.$1, style: AppFonts.display(size: 26, color: c.accent, letterSpacing: -1)),
                            ),
                            Text(cell.$2.toUpperCase(),
                                style: AppFonts.mono(size: 9, color: c.inkMuted, weight: FontWeight.w700)),
                          ],
                        ),
                      ))
                  .toList(),
            ),
            if (s.records.isNotEmpty) ...<Widget>[
              const SizedBox(height: 8),
              ...s.records.take(8).map((StatRecord r) => Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Row(
                      children: <Widget>[
                        Icon(Icons.emoji_events, size: 16, color: c.accent),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(r.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 14, color: c.ink)),
                        ),
                        Text(r.isTimeBased ? '${r.value} с' : '${r.value} кг',
                            style: AppFonts.mono(size: 13, color: c.ink)),
                      ],
                    ),
                  )),
            ],
          ],
        );
      },
    );
  }
}

class _AssignButton extends ConsumerWidget {
  const _AssignButton({required this.clientId, required this.clientName});
  final String clientId;
  final String clientName;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return TextButton.icon(
      onPressed: () async {
        final bool? assigned = await Navigator.of(context).push<bool>(
          MaterialPageRoute<bool>(
            builder: (_) => AssignWorkoutScreen(clientId: clientId, clientName: clientName),
          ),
        );
        if (assigned == true) ref.invalidate(clientWorkoutsCardProvider(clientId));
      },
      icon: const Icon(Icons.add, size: 16),
      label: const Text('Назначить'),
    );
  }
}

class _WorkoutsBlock extends ConsumerWidget {
  const _WorkoutsBlock({required this.clientId});
  final String clientId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<TWorkout>> ws = ref.watch(clientWorkoutsCardProvider(clientId));
    return ws.when(
      loading: () => const _Empty('Загрузка…'),
      error: (Object e, _) => const _Empty('Не удалось загрузить'),
      data: (List<TWorkout> all) {
        // К проведению: черновики (назначенные) и активные — наверху, тапаемые.
        final List<TWorkout> toConduct =
            all.where((TWorkout w) => w.status == 'draft' || w.status == 'active').toList();
        final List<TWorkout> done = all.where((TWorkout w) => w.status == 'completed').take(10).toList();
        if (toConduct.isEmpty && done.isEmpty) return const _Empty('Тренировок нет');

        Future<void> openConduct(TWorkout w) async {
          await Navigator.of(context).push<void>(
            MaterialPageRoute<void>(
              builder: (_) => ActiveWorkoutScreen(clientId: clientId, workoutId: w.id),
            ),
          );
          ref.invalidate(clientWorkoutsCardProvider(clientId));
        }

        return Column(
          children: <Widget>[
            ...toConduct.map((TWorkout w) {
              final bool active = w.status == 'active';
              return GestureDetector(
                onTap: () => openConduct(w),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                  decoration: BoxDecoration(
                    color: c.card,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: active ? c.accent : c.line),
                  ),
                  child: Row(
                    children: <Widget>[
                      Icon(active ? Icons.play_circle_outline : Icons.fitness_center,
                          size: 18, color: active ? c.accent : c.inkMuted),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(w.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                            Text(
                              <String>[
                                active ? 'идёт' : 'к проведению',
                                '${w.exerciseCount} упр.',
                                if (w.createdByClient) 'своя',
                              ].join(' · '),
                              style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500),
                            ),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right, size: 18, color: c.inkMutedXl),
                    ],
                  ),
                ),
              );
            }),
            if (done.isEmpty && toConduct.isNotEmpty)
              const SizedBox.shrink()
            else
              ...done.map((TWorkout w) => Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                    decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                    child: Row(
                      children: <Widget>[
                        Icon(Icons.fitness_center, size: 18, color: c.inkMuted),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Text(w.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                              Text(
                                <String>[
                                  if (w.completedAt != null) _date(w.completedAt),
                                  '${w.exerciseCount} упр.',
                                  if (w.createdByClient) 'своя',
                                ].join(' · '),
                                style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  )),
          ],
        );
      },
    );
  }
}

class _MedicalButton extends ConsumerWidget {
  const _MedicalButton({required this.clientId, required this.clientName});
  final String clientId;
  final String clientName;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return TextButton.icon(
      onPressed: () async {
        await Navigator.of(context).push<void>(
          MaterialPageRoute<void>(
            builder: (_) => ClientMedicalScreen(clientId: clientId, clientName: clientName),
          ),
        );
        ref.invalidate(clientMedicalProvider(clientId));
      },
      icon: const Icon(Icons.open_in_new, size: 16),
      label: const Text('Открыть'),
    );
  }
}

class _MedicalBlock extends ConsumerWidget {
  const _MedicalBlock({required this.clientId, required this.clientName});
  final String clientId;
  final String clientName;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<MedicalRecord>> recs = ref.watch(clientMedicalProvider(clientId));
    return recs.when(
      loading: () => const _Empty('Загрузка…'),
      error: (Object e, _) => const _Empty('Не удалось загрузить'),
      data: (List<MedicalRecord> list) {
        if (list.isEmpty) return const _Empty('Записей нет');
        final MedicalRecord latest = list.first;
        return GestureDetector(
          onTap: () async {
            await Navigator.of(context).push<void>(
              MaterialPageRoute<void>(
                builder: (_) => ClientMedicalScreen(clientId: clientId, clientName: clientName),
              ),
            );
            ref.invalidate(clientMedicalProvider(clientId));
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
            child: Row(
              children: <Widget>[
                Icon(Icons.medical_information_outlined, size: 18, color: c.inkMuted),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(latest.note,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.ink)),
                      Text('${list.length} записей', style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, size: 18, color: c.inkMutedXl),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 18, color: Theme.of(context).colorScheme.onSurfaceVariant),
          const SizedBox(width: 12),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 15))),
        ],
      ),
    );
  }
}
