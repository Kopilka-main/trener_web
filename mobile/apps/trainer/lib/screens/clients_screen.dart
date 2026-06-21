import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_accounting.dart';
import '../api/trainer_assign.dart';
import '../api/trainer_calendar.dart';
import '../api/trainer_catalog.dart';
import '../api/trainer_client_card.dart';
import '../api/trainer_client_stats.dart';
import '../api/trainer_clients.dart';
import '../api/trainer_medical.dart';
import '../api/trainer_workouts.dart';
import 'active_workout_screen.dart';
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

String _ageDecl(int n) {
  final int m10 = n % 10, m100 = n % 100;
  if (m10 == 1 && m100 != 11) return 'год';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'года';
  return 'лет';
}

/// «11 июня 1990 · 35 лет» из birthDate (YYYY-MM-DD), либо null.
String? _birthLine(String? iso) {
  if (iso == null || iso.length < 10) return null;
  final List<String> p = iso.substring(0, 10).split('-');
  if (p.length != 3) return null;
  final int y = int.tryParse(p[0]) ?? 0, mo = int.tryParse(p[1]) ?? 1, da = int.tryParse(p[2]) ?? 1;
  if (y == 0) return null;
  final DateTime now = DateTime.now();
  int age = now.year - y;
  if (now.month < mo || (now.month == mo && now.day < da)) age--;
  return '$da ${_ruMonthsGen[(mo - 1).clamp(0, 11)]} $y · $age ${_ageDecl(age)}';
}

/// Карточка клиента как хаб (зеркало web ClientCardPage): шапка, теги, большая
/// CTA «Тренировки», сетка из 6 плиток-разделов, контакты, заметки. Все рабочие
/// действия (пакеты/замеры/медкарта/статистика/назначение/чат) достижимы через
/// плитки → пушащиеся под-экраны разделов.
class ClientDetailScreen extends ConsumerWidget {
  const ClientDetailScreen({super.key, required this.client});
  final Client client;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors col = context.colors;
    // Свежий снимок клиента (статус подключения/теги/заметки). До загрузки —
    // переданный из списка `client`, чтобы карточка отрисовалась мгновенно.
    final Client c = ref.watch(trainerClientProvider(client.id)).valueOrNull ?? client;

    final bool isArchived = c.status == ClientStatus.archived;
    final String name = c.fullName.isNotEmpty ? c.fullName : 'Без имени';
    final String? avatarUrl = c.avatarFileId != null
        ? '${ref.read(baseUrlProvider).replaceAll(RegExp(r'/$'), '')}/api/files/${c.avatarFileId}'
        : null;

    // Бейджи: paidBalance / calBalance / achievements (формулы — зеркало web).
    final List<TPackage> pkgs = ref.watch(clientPackagesProvider(c.id)).valueOrNull ?? <TPackage>[];
    final List<TWorkout> workouts = ref.watch(clientWorkoutsCardProvider(c.id)).valueOrNull ?? <TWorkout>[];
    final ClientStatsData? stats = ref.watch(clientStatsProvider(c.id)).valueOrNull;
    final List<Session> sessions = (ref.watch(trainerSessionsProvider).valueOrNull ?? <Session>[])
        .where((Session s) => s.clientId == c.id)
        .toList();

    final int paidLessons = pkgs.where((TPackage p) => p.isActive).fold(0, (int a, TPackage p) => a + p.lessonsPaid);
    final int completedWorkouts =
        workouts.where((TWorkout w) => w.status == 'completed' && !w.createdByClient).length;
    final int paidBalance = paidLessons - completedWorkouts;
    final int plannedSessions = sessions.where((Session s) => s.status == SessionStatus.planned).length;
    final int calBalance = paidBalance - plannedSessions;
    final int achievements = stats?.records.length ?? 0;
    final bool connected = c.isConnected;

    void openProfile() => Navigator.of(context).push<void>(
          MaterialPageRoute<void>(builder: (_) => ClientProfileScreen(client: c)),
        );

    Future<void> openConnectDialog() async {
      final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
      final String? code = await _showConnectDialog(context);
      if (code == null || code.trim().isEmpty) return;
      try {
        await ref.read(trainerClientsApiProvider).connectAccount(c.id, code.trim());
        ref.invalidate(trainerClientsProvider);
        ref.invalidate(trainerClientProvider(c.id));
        if (!context.mounted) return;
        context.push('/chat/${c.id}?name=${Uri.encodeComponent(c.fullName)}');
      } catch (_) {
        m.showSnackBar(const SnackBar(content: Text('Не удалось подключить клиента')));
      }
    }

    final List<_HubTile> tiles = <_HubTile>[
      _HubTile(
        key: 'calendar',
        icon: Icons.calendar_today_outlined,
        label: 'Календарь',
        sub: 'занятия клиента',
        badge: (plannedSessions > 0 || sessions.isNotEmpty)
            ? _Badge.calendar(planned: plannedSessions, calBalance: calBalance)
            : null,
        onTap: () => context.push('/calendar'),
      ),
      _HubTile(
        key: 'chat',
        icon: Icons.chat_bubble_outline,
        label: 'Написать',
        sub: 'чат с клиентом',
        locked: !connected,
        onTap: connected
            ? () => context.push('/chat/${c.id}?name=${Uri.encodeComponent(c.fullName)}')
            : openConnectDialog,
      ),
      _HubTile(
        key: 'stats',
        icon: Icons.bar_chart_outlined,
        label: 'Прогресс',
        sub: 'рекорды и история',
        badge: achievements > 0 ? _Badge.achievements(achievements) : null,
        onTap: () => Navigator.of(context).push<void>(
          MaterialPageRoute<void>(builder: (_) => ClientStatsScreen(client: c)),
        ),
      ),
      _HubTile(
        key: 'payments',
        icon: Icons.account_balance_wallet_outlined,
        label: 'Оплата',
        sub: 'пакеты и расходы',
        badge: _Badge.balance(paidBalance),
        onTap: () => Navigator.of(context).push<void>(
          MaterialPageRoute<void>(builder: (_) => ClientPaymentsScreen(client: c)),
        ),
      ),
      _HubTile(
        key: 'medcard',
        icon: Icons.description_outlined,
        label: 'Медкарта',
        sub: 'файлы и заметки',
        onTap: () async {
          await Navigator.of(context).push<void>(
            MaterialPageRoute<void>(
              builder: (_) => ClientMedicalScreen(clientId: c.id, clientName: c.fullName),
            ),
          );
          ref.invalidate(clientMedicalProvider(c.id));
        },
      ),
      _HubTile(
        key: 'profile',
        icon: Icons.person_outline,
        label: 'Профиль',
        sub: 'контакты и данные',
        onTap: openProfile,
      ),
    ];

    return Scaffold(
      // Без AppBar/стрелки назад: шапка-контент (аватар + имя) как в вебе.
      // Возврат — системным жестом/кнопкой назад.
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(trainerClientProvider(c.id));
          ref.invalidate(clientPackagesProvider(c.id));
          ref.invalidate(clientWorkoutsCardProvider(c.id));
          ref.invalidate(clientStatsProvider(c.id));
          ref.invalidate(trainerSessionsProvider);
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: <Widget>[
            // Шапка: аватар 64 + имя 26 + чип «Архив».
            Row(
              children: <Widget>[
                Opacity(
                  opacity: isArchived ? 0.55 : 1,
                  child: AuthedAvatar(
                    url: avatarUrl,
                    token: ref.watch(sessionProvider).token,
                    initials: c.initials,
                    radius: 32,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Row(
                    children: <Widget>[
                      Flexible(
                        child: Text(name,
                            style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold, height: 1.05, color: col.ink)),
                      ),
                      if (isArchived) ...<Widget>[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                          decoration: BoxDecoration(color: col.chip, borderRadius: BorderRadius.circular(999)),
                          child: Text('АРХИВ',
                              style: AppFonts.mono(size: 11, color: col.inkMuted, weight: FontWeight.w700)),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            // Теги.
            if (c.tags.isNotEmpty) ...<Widget>[
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: c.tags
                    .map((String t) => Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(color: col.chip, borderRadius: BorderRadius.circular(999)),
                          child: Text(t.startsWith('#') ? t : '#$t', style: TextStyle(fontSize: 13, color: col.ink)),
                        ))
                    .toList(),
              ),
            ],
            // Большая primary-плитка: переход к тренировкам.
            const SizedBox(height: 20),
            _WorkoutsCta(
              onTap: () => Navigator.of(context).push<void>(
                MaterialPageRoute<void>(builder: (_) => ClientWorkoutsScreen(client: c)),
              ),
            ),
            // Сетка плиток-разделов (2 колонки, естественная высота).
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.4,
              children: tiles.map((_HubTile t) => _HubTileView(tile: t)).toList(),
            ),
            // Контакты: телефон + дата рождения.
            if (c.phone?.trim().isNotEmpty == true || c.birthDate != null) ...<Widget>[
              const SizedBox(height: 20),
              if (c.phone?.trim().isNotEmpty == true)
                _ContactRow(
                  icon: Icons.phone_outlined,
                  iconColor: col.accent,
                  text: c.phone!.trim(),
                  textColor: col.ink,
                ),
              if (_birthLine(c.birthDate) case final String b) ...<Widget>[
                if (c.phone?.trim().isNotEmpty == true) const SizedBox(height: 12),
                _ContactRow(icon: Icons.cake_outlined, iconColor: col.inkMuted, text: b, textColor: col.ink),
              ],
            ],
            // Заметки.
            if (c.notes?.trim().isNotEmpty == true) ...<Widget>[
              const SizedBox(height: 24),
              Text('ЗАМЕТКИ', style: AppFonts.mono(size: 11, color: col.inkMutedXl, weight: FontWeight.w700)),
              const SizedBox(height: 6),
              Text(c.notes!.trim(), style: TextStyle(fontSize: 14, height: 1.5, color: col.ink)),
            ],
          ],
        ),
        ),
      ),
    );
  }
}

/// Бейдж плитки-раздела: значение + цвет + опциональная иконка-тренд.
class _Badge {
  const _Badge({required this.text, required this.danger, this.trend = false});
  final String text;
  final bool danger;
  final bool trend;

  factory _Badge.balance(int v) =>
      _Badge(text: v > 0 ? '+$v' : '$v', danger: v < 0);

  factory _Badge.calendar({required int planned, required int calBalance}) =>
      _Badge(text: '$planned / ${calBalance > 0 ? '+$calBalance' : '$calBalance'}', danger: calBalance < 0);

  factory _Badge.achievements(int v) => _Badge(text: '$v', danger: false, trend: true);
}

class _HubTile {
  const _HubTile({
    required this.key,
    required this.icon,
    required this.label,
    required this.sub,
    required this.onTap,
    this.badge,
    this.locked = false,
  });
  final String key;
  final IconData icon;
  final String label;
  final String sub;
  final VoidCallback onTap;
  final _Badge? badge;
  final bool locked;
}

class _HubTileView extends StatelessWidget {
  const _HubTileView({required this.tile});
  final _HubTile tile;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final Color iconColor = tile.locked ? c.inkMuted : c.ink;
    return Opacity(
      opacity: tile.locked ? 0.6 : 1,
      child: GestureDetector(
        onTap: tile.onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: c.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: c.line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Icon(tile.icon, size: 22, color: iconColor),
                  const Spacer(),
                  if (tile.locked)
                    Icon(Icons.link_off, size: 18, color: c.danger)
                  else if (tile.badge != null)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: <Widget>[
                        Text(tile.badge!.text,
                            style: AppFonts.display(
                                size: 22, color: tile.badge!.danger ? c.danger : c.accent, letterSpacing: -0.5)),
                        if (tile.badge!.trend) ...<Widget>[
                          const SizedBox(width: 2),
                          Icon(Icons.trending_up, size: 16, color: c.accent),
                        ],
                      ],
                    ),
                ],
              ),
              const Spacer(),
              Text(tile.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: c.ink)),
              Text(tile.sub,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: c.inkMuted)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Большая acid-fill CTA: иконка гантели + «текущая + история» + тройной шеврон.
class _WorkoutsCta extends StatefulWidget {
  const _WorkoutsCta({required this.onTap});
  final VoidCallback onTap;
  @override
  State<_WorkoutsCta> createState() => _WorkoutsCtaState();
}

class _WorkoutsCtaState extends State<_WorkoutsCta> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  /// Треугольная волна 0→1→0 от нормализованной фазы.
  double _wave(double t) {
    final double x = ((t % 1.0) + 1.0) % 1.0;
    return x < 0.5 ? x * 2 : (1 - x) * 2;
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: widget.onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        decoration: BoxDecoration(color: c.accent, borderRadius: BorderRadius.circular(20)),
        child: Row(
          children: <Widget>[
            Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(color: Colors.black12, shape: BoxShape.circle),
              child: Icon(Icons.fitness_center, size: 22, color: c.accentOn),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text('Перейти к тренировкам',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: c.accentOn)),
                  Text('текущая + история',
                      style: TextStyle(fontSize: 12, color: c.accentOn.withValues(alpha: 0.7))),
                ],
              ),
            ),
            // «Бегущие» шевроны: волна прозрачности слева→направо + лёгкий сдвиг.
            AnimatedBuilder(
              animation: _ctrl,
              builder: (BuildContext context, _) => Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  for (int i = 0; i < 3; i++)
                    Transform.translate(
                      offset: Offset(-8.0 * i + 3 * _wave(_ctrl.value - i * 0.18), 0),
                      child: Opacity(
                        opacity: 0.3 + 0.7 * _wave(_ctrl.value - i * 0.18),
                        child: Icon(Icons.chevron_right, size: 22, color: c.accentOn),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ContactRow extends StatelessWidget {
  const _ContactRow({
    required this.icon,
    required this.iconColor,
    required this.text,
    required this.textColor,
  });
  final IconData icon;
  final Color iconColor;
  final String text;
  final Color textColor;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Row(
          children: <Widget>[
            Icon(icon, size: 18, color: iconColor),
            const SizedBox(width: 12),
            Expanded(child: Text(text, style: TextStyle(fontSize: 15, color: textColor))),
          ],
        ),
    );
  }
}

/// Диалог подключения чата: ввод кода (accountId) клиентского приложения.
Future<String?> _showConnectDialog(BuildContext context) {
  final TextEditingController code = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (BuildContext ctx) {
      final AppColors c = ctx.colors;
      return AlertDialog(
        backgroundColor: c.card,
        title: Text('Нет связи с клиентом', style: TextStyle(color: c.ink)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Чтобы писать клиенту, укажите его клиентский номер (ID) из приложения клиента.',
                style: TextStyle(fontSize: 13, color: c.inkMuted)),
            const SizedBox(height: 12),
            TextField(
              controller: code,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'ID клиента', border: OutlineInputBorder()),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Отмена')),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(code.text.trim()),
            child: const Text('Подключить'),
          ),
        ],
      );
    },
  );
}

/// Раздел «Тренировки»: список (к проведению + история) + «Назначить».
/// Тренировки клиента глазами тренера: «ближайшая» (черновик/активная) сверху,
/// ниже история по датам; создание пустой / из шаблона / ретро-запись. Зеркало
/// веб ClientWorkoutsPage.
class ClientWorkoutsScreen extends ConsumerStatefulWidget {
  const ClientWorkoutsScreen({super.key, required this.client});
  final Client client;
  @override
  ConsumerState<ClientWorkoutsScreen> createState() => _ClientWorkoutsScreenState();
}

class _ClientWorkoutsScreenState extends ConsumerState<ClientWorkoutsScreen> {
  bool _busy = false;

  String get _cid => widget.client.id;

  Future<void> _openConduct(String wid) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(builder: (_) => ActiveWorkoutScreen(clientId: _cid, workoutId: wid)),
    );
    ref.invalidate(clientWorkoutsCardProvider(_cid));
  }

  /// Создать черновик и открыть редактор. [exercises] — план (пустой/из шаблона).
  /// [excluded] — историческая запись (постфактум, без влияния на баланс/календарь).
  Future<void> _createAndOpen(String name, List<Map<String, dynamic>> exercises,
      {bool excluded = false}) async {
    if (_busy) return;
    setState(() => _busy = true);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      final String id = await ref
          .read(trainerAssignApiProvider)
          .assignReturningId(_cid, name, exercises, excludedFromBalance: excluded);
      ref.invalidate(clientWorkoutsCardProvider(_cid));
      if (!mounted) return;
      setState(() => _busy = false);
      if (id.isNotEmpty) await _openConduct(id);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось создать тренировку')));
    }
  }

  /// Удалить назначенную тренировку (черновик/активную) у клиента.
  Future<void> _cancelWorkout(TWorkout w) async {
    final bool ok = await confirmDelete(
      context,
      title: 'Удалить тренировку?',
      message: '«${w.name}» будет удалена у клиента.',
    );
    if (!ok) return;
    try {
      await ref.read(trainerWorkoutsApiProvider).delete(_cid, w.id);
      ref.invalidate(clientWorkoutsCardProvider(_cid));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Не удалось удалить')));
    }
  }

  Future<void> _pickTemplate({bool excluded = false}) async {
    final WorkoutTemplate? t = await showModalBottomSheet<WorkoutTemplate>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _TemplatePickerSheet(),
    );
    if (t == null) return;
    final List<Map<String, dynamic>> ex = t.exercises
        .map((TemplateExercise e) => <String, dynamic>{
              'exerciseId': e.exerciseId,
              'sets': <Map<String, dynamic>>[
                <String, dynamic>{
                  'plannedReps': ?e.reps,
                  'plannedWeightKg': ?e.weightKg,
                  'plannedTimeSec': ?e.timeSec,
                  'plannedRestSec': ?e.restSec,
                },
              ],
            })
        .toList();
    await _createAndOpen(t.name, ex, excluded: excluded);
  }

  /// Ретроспективно зафиксировать уже проведённую тренировку: лист вариантов
  /// (пустая / из базы / повторить из истории). Созданный черновик помечается
  /// excludedFromBalance и финализируется в редакторе датой. Зеркало веб
  /// HistoryComposeSheet.
  Future<void> _addToHistoryCompose(List<TWorkout> history) async {
    final String? choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext ctx) {
        final AppColors c = ctx.colors;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text('Добавить в историю',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: c.ink)),
                const SizedBox(height: 6),
                Text(
                  'Зафиксируйте уже проведённую тренировку. Она не запускается, не влияет на '
                  'баланс пакета и не попадает в календарь.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: c.inkMuted, height: 1.4),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx, 'empty'),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  child: const Text('Создать пустую'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () => Navigator.pop(ctx, 'template'),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  child: const Text('Выбрать из базы'),
                ),
                if (history.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 8),
                  OutlinedButton(
                    onPressed: () => Navigator.pop(ctx, 'history'),
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                    child: const Text('Повторить из истории'),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
    if (choice == null || !mounted) return;
    switch (choice) {
      case 'empty':
        await _createAndOpen('Новая тренировка', <Map<String, dynamic>>[], excluded: true);
      case 'template':
        await _pickTemplate(excluded: true);
      case 'history':
        await _pickHistory(history, excluded: true);
    }
  }

  /// Повтор из истории: выбрать проведённую тренировку, собрать план из её ФАКТА
  /// (пропущенные подходы исключаются) и создать новую запись.
  Future<void> _pickHistory(List<TWorkout> history, {bool excluded = false}) async {
    final TWorkout? picked = await showModalBottomSheet<TWorkout>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext ctx) {
        final AppColors c = ctx.colors;
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.7),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                  child: Text('Повторить из истории',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: c.ink)),
                ),
                Flexible(
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                    shrinkWrap: true,
                    itemCount: history.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (BuildContext _, int i) {
                      final TWorkout w = history[i];
                      final DateTime? d = w.completedAt;
                      final String date = d != null
                          ? '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}'
                          : '';
                      return GestureDetector(
                        onTap: () => Navigator.pop(ctx, w),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                          child: Row(
                            children: <Widget>[
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: <Widget>[
                                    Text(w.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                                    Text(<String>[if (date.isNotEmpty) date, '${w.exerciseCount} упр.'].join(' · '),
                                        style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                                  ],
                                ),
                              ),
                              Icon(Icons.chevron_right, size: 20, color: c.inkMuted),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
    if (picked == null || !mounted) return;
    // Полная тренировка нужна ради подходов (в карточке только счётчик).
    try {
      final Workout full = await ref.read(trainerWorkoutsApiProvider).fetch(_cid, picked.id);
      final List<Map<String, dynamic>> plan = _repeatPlan(full);
      await _createAndOpen(full.name, plan, excluded: excluded);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Не удалось повторить тренировку')));
      }
    }
  }

  /// План «точь-в-точь» из ФАКТА выполненной тренировки: для каждого упражнения
  /// берём выполненные подходы (actual → planned), пропущенные исключаем.
  List<Map<String, dynamic>> _repeatPlan(Workout w) {
    final List<Map<String, dynamic>> out = <Map<String, dynamic>>[];
    for (final WorkoutExercise ex in w.exercises) {
      final List<Map<String, dynamic>> sets = <Map<String, dynamic>>[];
      for (final WorkoutSet s in ex.sets.where((WorkoutSet s) => s.done)) {
        final num? reps = s.actualReps ?? s.plannedReps;
        final num? weight = s.actualWeightKg ?? s.plannedWeightKg;
        final num? time = s.actualTimeSec ?? s.plannedTimeSec;
        sets.add(<String, dynamic>{
          'plannedReps': ?reps,
          'plannedWeightKg': ?weight,
          'plannedTimeSec': ?time,
          'plannedRestSec': ?s.plannedRestSec,
        });
      }
      if (sets.isNotEmpty) {
        out.add(<String, dynamic>{'exerciseId': ex.exerciseId, 'sets': sets});
      }
    }
    return out;
  }

  /// Повторить тренировку из истории: тянем полную запись, собираем план из её
  /// ФАКТА и создаём новый черновик (открываем его).
  Future<void> _repeatWorkout(TWorkout w) async {
    if (_busy) return;
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      final Workout full = await ref.read(trainerWorkoutsApiProvider).fetch(_cid, w.id);
      final List<Map<String, dynamic>> plan = _repeatPlan(full);
      if (plan.isEmpty) {
        m.showSnackBar(const SnackBar(content: Text('Нет выполненных подходов для повтора')));
        return;
      }
      await _createAndOpen(full.name, plan);
    } catch (_) {
      m.showSnackBar(const SnackBar(content: Text('Не удалось повторить тренировку')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final AsyncValue<List<TWorkout>> ws = ref.watch(clientWorkoutsCardProvider(_cid));
    return Scaffold(
      appBar: AppBar(title: Text('Тренировки · ${widget.client.fullName}')),
      body: ws.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object e, _) => Center(
          child: FilledButton(
            onPressed: () => ref.invalidate(clientWorkoutsCardProvider(_cid)),
            child: const Text('Повторить'),
          ),
        ),
        data: (List<TWorkout> all) {
          // Ближайшая — только тренерская (не createdByClient), активная раньше черновика.
          final List<TWorkout> current = all
              .where((TWorkout w) => (w.status == 'active' || w.status == 'draft') && !w.createdByClient)
              .toList()
            ..sort((TWorkout a, TWorkout b) => a.status == 'active' ? -1 : 1);
          final List<TWorkout> history = all.where((TWorkout w) => w.status == 'completed' || w.status == 'skipped').toList()
            ..sort((TWorkout a, TWorkout b) => (b.completedAt ?? DateTime(0)).compareTo(a.completedAt ?? DateTime(0)));

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: <Widget>[
              Text('БЛИЖАЙШАЯ ТРЕНИРОВКА', style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w700)),
              const SizedBox(height: 8),
              if (current.isNotEmpty)
                _CurrentWorkoutCard(
                  w: current.first,
                  onTap: () => _openConduct(current.first.id),
                  onCancel: () => _cancelWorkout(current.first),
                )
              else
                _EmptyCurrent(
                  busy: _busy,
                  onCreate: () => _createAndOpen('Новая тренировка', <Map<String, dynamic>>[]),
                  onTemplate: _pickTemplate,
                ),
              if (history.isNotEmpty) ...<Widget>[
                const SizedBox(height: 20),
                Text('ИСТОРИЯ ТРЕНИРОВОК · ${history.length}',
                    style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w700)),
                const SizedBox(height: 8),
                ..._historyGrouped(c, history),
              ],
              // Ретро-запись уже проведённой тренировки в историю клиента.
              const SizedBox(height: 16),
              GestureDetector(
                onTap: _busy ? null : () => _addToHistoryCompose(history),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: c.line, width: 2),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: <Widget>[
                      Icon(Icons.add, size: 18, color: c.inkMuted),
                      const SizedBox(width: 8),
                      Text('Добавить в историю',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.inkMuted)),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  List<Widget> _historyGrouped(AppColors c, List<TWorkout> history) {
    final List<Widget> out = <Widget>[];
    String? lastDate;
    for (final TWorkout w in history) {
      final DateTime? d = w.completedAt;
      final String key = d != null
          ? '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}'
          : 'Без даты';
      if (key != lastDate) {
        out.add(Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 6),
          child: Text(key, style: AppFonts.mono(size: 12, color: c.accent, weight: FontWeight.w700)),
        ));
        lastDate = key;
      }
      out.add(_HistoryCard(
        key: ValueKey<String>(w.id),
        workout: w,
        clientId: _cid,
        busy: _busy,
        onRepeat: () => _repeatWorkout(w),
      ));
    }
    return out;
  }
}

/// Карточка истории тренировки: тап разворачивает состав (упражнения + сводка
/// подходов), кнопка ↺ — повторить (клон выполненного в новый черновик).
class _HistoryCard extends ConsumerStatefulWidget {
  const _HistoryCard({
    super.key,
    required this.workout,
    required this.clientId,
    required this.onRepeat,
    required this.busy,
  });
  final TWorkout workout;
  final String clientId;
  final VoidCallback onRepeat;
  final bool busy;
  @override
  ConsumerState<_HistoryCard> createState() => _HistoryCardState();
}

class _HistoryCardState extends ConsumerState<_HistoryCard> {
  bool _expanded = false;

  String _setSummary(WorkoutSet s, {required bool actual}) {
    final num? reps = actual ? (s.actualReps ?? s.plannedReps) : s.plannedReps;
    final num? weight = actual ? (s.actualWeightKg ?? s.plannedWeightKg) : s.plannedWeightKg;
    final num? time = actual ? (s.actualTimeSec ?? s.plannedTimeSec) : s.plannedTimeSec;
    final List<String> p = <String>[
      if (reps != null) '${reps.toInt()}',
      if (weight != null && weight != 0) '× ${weight % 1 == 0 ? weight.toInt() : weight} кг',
      if (time != null && time != 0) '${time.toInt()} с',
    ];
    return p.isEmpty ? '—' : p.join(' ');
  }

  String _exerciseSummary(WorkoutExercise ex) {
    final WorkoutSet? first = ex.sets.isNotEmpty ? ex.sets.first : null;
    if (first == null) return '';
    final String head = ex.sets.length > 1 ? '${ex.sets.length}× ' : '';
    final bool done = ex.sets.any((WorkoutSet s) => s.done);
    return '$head${_setSummary(first, actual: done)}';
  }

  Future<void> _confirmRepeat() async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Повторить тренировку?'),
        content: Text('«${widget.workout.name}» — создадим новый черновик из выполненных подходов.'),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Повторить')),
        ],
      ),
    );
    if (ok == true) widget.onRepeat();
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final TWorkout w = widget.workout;
    final bool skipped = w.status == 'skipped';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 9, 10, 9),
            child: Row(
              children: <Widget>[
                Icon(skipped ? Icons.do_not_disturb_on_outlined : Icons.fitness_center,
                    size: 18, color: c.inkMuted),
                const SizedBox(width: 12),
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => setState(() => _expanded = !_expanded),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(w.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                        Text(
                          <String>[
                            if (skipped) 'Пропущена' else '${w.exerciseCount} упр.',
                            if (w.createdByClient) 'клиентская',
                          ].join(' · '),
                          style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500),
                        ),
                      ],
                    ),
                  ),
                ),
                if (!skipped && w.exerciseCount > 0) ...<Widget>[
                  GestureDetector(
                    onTap: widget.busy ? null : _confirmRepeat,
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(color: c.cardElevated, shape: BoxShape.circle),
                      child: Icon(Icons.replay, size: 18, color: c.inkMuted),
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                GestureDetector(
                  onTap: () => setState(() => _expanded = !_expanded),
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(color: c.cardElevated, shape: BoxShape.circle),
                    child: Icon(_expanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                        size: 18, color: c.inkMuted),
                  ),
                ),
              ],
            ),
          ),
          if (_expanded) _composition(c),
        ],
      ),
    );
  }

  Widget _composition(AppColors c) {
    final AsyncValue<Workout> full =
        ref.watch(trainerWorkoutProvider((clientId: widget.clientId, wid: widget.workout.id)));
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(border: Border(top: BorderSide(color: c.line))),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
      child: full.when(
        loading: () => const Padding(
          padding: EdgeInsets.symmetric(vertical: 8),
          child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))),
        ),
        error: (Object e, _) =>
            Text('Не удалось загрузить состав', style: TextStyle(fontSize: 12, color: c.inkMuted)),
        data: (Workout wd) {
          if (wd.exercises.isEmpty) {
            return Text('Упражнений нет', style: TextStyle(fontSize: 12, color: c.inkMuted));
          }
          final List<WorkoutExercise> exs = <WorkoutExercise>[...wd.exercises]
            ..sort((a, b) => a.position - b.position);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              for (final WorkoutExercise ex in exs)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    children: <Widget>[
                      Expanded(
                        child: Text(ex.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: c.ink)),
                      ),
                      const SizedBox(width: 8),
                      Text(_exerciseSummary(ex),
                          style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w600)),
                    ],
                  ),
                ),
              if (wd.trainerNote?.isNotEmpty == true) ...<Widget>[
                const SizedBox(height: 6),
                Text('«${wd.trainerNote}»',
                    style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: c.inkMuted)),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// Карточка ближайшей (черновик/активная) тренировки + начать/продолжить + отмена.
class _CurrentWorkoutCard extends StatelessWidget {
  const _CurrentWorkoutCard({required this.w, required this.onTap, required this.onCancel});
  final TWorkout w;
  final VoidCallback onTap;
  final VoidCallback onCancel;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final bool active = w.status == 'active';
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(w.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
                ),
                GestureDetector(
                  onTap: onCancel,
                  child: Icon(Icons.delete_outline, size: 20, color: c.inkMuted),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text('${w.exerciseCount} упр.${active ? ' · идёт' : ''}',
                style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
            const SizedBox(height: 12),
            Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(color: c.accent, borderRadius: BorderRadius.circular(12)),
              child: Text(active ? 'Продолжить' : 'Начать тренировку',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.accentOn)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Пустая «ближайшая»: создать пустую / выбрать из базы.
class _EmptyCurrent extends StatelessWidget {
  const _EmptyCurrent({required this.busy, required this.onCreate, required this.onTemplate});
  final bool busy;
  final VoidCallback onCreate;
  final VoidCallback onTemplate;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.line, width: 2),
      ),
      child: Column(
        children: <Widget>[
          GestureDetector(
            onTap: busy ? null : onCreate,
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(color: c.card, shape: BoxShape.circle, border: Border.all(color: c.line)),
              child: busy
                  ? const Padding(padding: EdgeInsets.all(14), child: CircularProgressIndicator(strokeWidth: 2))
                  : Icon(Icons.add, size: 24, color: c.ink),
            ),
          ),
          const SizedBox(height: 10),
          Text('Тренировка не запланирована', style: TextStyle(fontSize: 14, color: c.inkMuted)),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: busy ? null : onTemplate,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
              child: const Text('Выбрать из базы'),
            ),
          ),
        ],
      ),
    );
  }
}

/// Шит выбора шаблона тренировки.
class _TemplatePickerSheet extends ConsumerWidget {
  const _TemplatePickerSheet();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final List<WorkoutTemplate> templates = ref.watch(trainerTemplatesProvider).valueOrNull ?? <WorkoutTemplate>[];
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.7,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text('Выбрать из базы', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: c.ink)),
          ),
          if (templates.isEmpty)
            Padding(
              padding: const EdgeInsets.all(20),
              child: Text('Шаблонов нет. Создайте их в базе знаний.', style: TextStyle(color: c.inkMuted)),
            )
          else
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                itemCount: templates.length,
                itemBuilder: (BuildContext ctx, int i) {
                  final WorkoutTemplate t = templates[i];
                  return GestureDetector(
                    onTap: () => Navigator.pop(ctx, t),
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                      child: Row(
                        children: <Widget>[
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Text(t.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                                Text('${t.exercises.length} упр.${t.categoryTag != null ? ' · ${t.categoryTag}' : ''}',
                                    style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                              ],
                            ),
                          ),
                          Icon(Icons.chevron_right, size: 18, color: c.inkMutedXl),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

/// Раздел «Оплата»: карточка баланса (проведено | оплачено−проведено) + пакеты
/// и история платежей + добавление. Зеркало веб ClientPaymentsPage.
class ClientPaymentsScreen extends ConsumerWidget {
  const ClientPaymentsScreen({super.key, required this.client});
  final Client client;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final List<TPackage> pkgs = ref.watch(clientPackagesProvider(client.id)).valueOrNull ?? <TPackage>[];
    final List<TWorkout> workouts = ref.watch(clientWorkoutsCardProvider(client.id)).valueOrNull ?? <TWorkout>[];
    final int done = workouts.where((TWorkout w) => w.status == 'completed').length;
    final int paid = pkgs.where((TPackage p) => p.isActive).fold(0, (int a, TPackage p) => a + p.lessonsPaid);
    final int remaining = paid - done;

    return Scaffold(
      appBar: AppBar(title: Text('Оплата · ${client.fullName}')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          // Карточка баланса: проведено | баланс.
          Container(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(18)),
            child: Row(
              children: <Widget>[
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text('ПРОВЕДЕНО', style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text('$done', style: AppFonts.display(size: 28, color: c.ink, letterSpacing: -1)),
                    ],
                  ),
                ),
                Container(width: 1, height: 44, color: c.line),
                const SizedBox(width: 18),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text('БАЛАНС', style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(remaining > 0 ? '+$remaining' : '$remaining',
                          style: AppFonts.display(
                              size: 28, color: remaining < 0 ? c.danger : c.accent, letterSpacing: -1)),
                      Text(
                          remaining > 0
                              ? 'оплачено сверх'
                              : remaining < 0
                                  ? 'в долг'
                                  : 'ровно по оплате',
                          style: TextStyle(fontSize: 11, color: c.inkMuted)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _Section(
            title: 'Пакеты и платежи',
            action: _AddPackageButton(clientId: client.id),
            child: _PackagesBlock(clientId: client.id),
          ),
        ],
      ),
    );
  }
}

/// Раздел «Прогресс»: вкладки Упражнения / Замеры / Фото. Зеркало веб ClientStatsPage.
class ClientStatsScreen extends ConsumerStatefulWidget {
  const ClientStatsScreen({super.key, required this.client});
  final Client client;
  @override
  ConsumerState<ClientStatsScreen> createState() => _ClientStatsScreenState();
}

enum _ProgTab { exercises, measure, photos }

class _ClientStatsScreenState extends ConsumerState<ClientStatsScreen> {
  _ProgTab _tab = _ProgTab.exercises;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Scaffold(
      appBar: AppBar(title: Text('Прогресс · ${widget.client.fullName}')),
      body: Column(
        children: <Widget>[
          // Сегмент-вкладки.
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
              child: Row(
                children: <Widget>[
                  _ProgSeg(label: 'Упражнения', active: _tab == _ProgTab.exercises, onTap: () => setState(() => _tab = _ProgTab.exercises)),
                  _ProgSeg(label: 'Замеры', active: _tab == _ProgTab.measure, onTap: () => setState(() => _tab = _ProgTab.measure)),
                  _ProgSeg(label: 'Фото', active: _tab == _ProgTab.photos, onTap: () => setState(() => _tab = _ProgTab.photos)),
                ],
              ),
            ),
          ),
          Expanded(child: _body(c)),
        ],
      ),
    );
  }

  Widget _body(AppColors c) {
    switch (_tab) {
      case _ProgTab.exercises:
        return ListView(padding: const EdgeInsets.all(16), children: <Widget>[_StatsBlock(clientId: widget.client.id)]);
      case _ProgTab.measure:
        return ListView(
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            Align(alignment: Alignment.centerRight, child: _RequestMeasureButton(clientId: widget.client.id)),
            const SizedBox(height: 4),
            _MeasurementsBlock(clientId: widget.client.id),
          ],
        );
      case _ProgTab.photos:
        return _PhotosTab(clientId: widget.client.id);
    }
  }
}

class _ProgSeg extends StatelessWidget {
  const _ProgSeg({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(color: active ? c.accent : Colors.transparent, borderRadius: BorderRadius.circular(11)),
          child: Text(label,
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: active ? c.accentOn : c.inkMuted)),
        ),
      ),
    );
  }
}

/// Вкладка «Фото»: сетка фото прогресса клиента (просмотр), по ракурсам.
class _PhotosTab extends ConsumerWidget {
  const _PhotosTab({required this.clientId});
  final String clientId;
  static const Map<String, String> _angles = <String, String>{'front': 'Спереди', 'side': 'Сбоку', 'back': 'Сзади'};
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final AsyncValue<List<TClientPhoto>> photos = ref.watch(clientPhotosCardProvider(clientId));
    final String? token = ref.watch(sessionProvider).token;
    final String base = ref.read(baseUrlProvider).replaceAll(RegExp(r'/$'), '');
    return photos.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (Object e, _) => Center(child: Text('Не удалось загрузить фото', style: TextStyle(color: c.inkMuted))),
      data: (List<TClientPhoto> list) {
        if (list.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Фото прогресса пока нет.', textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted)),
            ),
          );
        }
        return GridView.builder(
          padding: const EdgeInsets.all(16),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3, mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: 0.7),
          itemCount: list.length,
          itemBuilder: (BuildContext ctx, int i) {
            final TClientPhoto p = list[i];
            return Stack(
              fit: StackFit.expand,
              children: <Widget>[
                AuthedImage(url: '$base/api/files/${p.fileId}', token: token, radius: 12),
                Positioned(
                  left: 0, right: 0, bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                    decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.45),
                        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12))),
                    child: Text(_angles[p.angle] ?? p.angle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

/// Раздел «Профиль»: контакты/данные + замеры + правка через ClientEditScreen.
class ClientProfileScreen extends ConsumerWidget {
  const ClientProfileScreen({super.key, required this.client});
  final Client client;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors col = context.colors;
    // Свежий снимок (после правки данные обновляются без возврата старого объекта).
    final Client c = ref.watch(trainerClientProvider(client.id)).valueOrNull ?? client;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Профиль'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Править',
            icon: const Icon(Icons.edit_outlined),
            onPressed: () async {
              final bool? changed = await Navigator.of(context).push<bool>(
                MaterialPageRoute<bool>(builder: (_) => ClientEditScreen(client: c)),
              );
              if (changed == true) {
                ref.invalidate(trainerClientsProvider);
                ref.invalidate(trainerClientProvider(client.id));
              }
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: <Widget>[
          // Центрированная шапка: аватар + имя + формат/возраст.
          Center(
            child: Column(
              children: <Widget>[
                AuthedAvatar(
                  url: c.avatarFileId != null
                      ? '${ref.read(baseUrlProvider).replaceAll(RegExp(r'/$'), '')}/api/files/${c.avatarFileId}'
                      : null,
                  token: ref.watch(sessionProvider).token,
                  initials: c.initials,
                  radius: 44,
                ),
                const SizedBox(height: 12),
                Text(c.fullName.isNotEmpty ? c.fullName : 'Без имени',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: col.ink)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  alignment: WrapAlignment.center,
                  children: <Widget>[
                    _ProfileChip(c.isOnline ? 'Онлайн' : 'Спортзал'),
                    if (_ageOnly(c.birthDate) case final String age) _ProfileChip(age),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          // Раздел «Данные».
          if (c.phone?.trim().isNotEmpty == true || c.contacts.isNotEmpty ||
              c.birthDate != null || c.accountId != null) ...<Widget>[
            _SettingsLabel('Данные'),
            if (c.phone?.trim().isNotEmpty == true)
              _DataRow(icon: Icons.phone_outlined, type: 'Телефон', value: c.phone!.trim()),
            ...c.contacts.map((ClientContact ct) =>
                _DataRow(icon: Icons.alternate_email, type: ct.type, value: ct.value)),
            if (_birthLine(c.birthDate) case final String b)
              _DataRow(icon: Icons.cake_outlined, type: 'Дата рождения', value: b),
            if (c.accountId?.isNotEmpty == true)
              _DataRow(icon: Icons.link, type: 'Клиентский ID', value: c.accountId!, copyable: true),
          ],
          if (c.tags.isNotEmpty) ...<Widget>[
            const SizedBox(height: 16),
            _SettingsLabel('Теги'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: c.tags
                  .map((String t) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                        decoration: BoxDecoration(color: col.chip, borderRadius: BorderRadius.circular(18)),
                        child: Text('#$t', style: AppFonts.mono(size: 12, color: col.inkMuted, weight: FontWeight.w600)),
                      ))
                  .toList(),
            ),
          ],
          if (c.notes?.trim().isNotEmpty == true) ...<Widget>[
            const SizedBox(height: 16),
            _SettingsLabel('Заметки'),
            Text(c.notes!.trim(), style: TextStyle(fontSize: 14, height: 1.5, color: col.ink)),
          ],
        ],
      ),
    );
  }
}

/// Возраст коротко «35 лет» из birthDate (без даты), либо null.
String? _ageOnly(String? iso) {
  if (iso == null || iso.length < 10) return null;
  final List<String> p = iso.substring(0, 10).split('-');
  if (p.length != 3) return null;
  final int y = int.tryParse(p[0]) ?? 0, mo = int.tryParse(p[1]) ?? 1, da = int.tryParse(p[2]) ?? 1;
  if (y == 0) return null;
  final DateTime now = DateTime.now();
  int age = now.year - y;
  if (now.month < mo || (now.month == mo && now.day < da)) age--;
  return '$age ${_ageDecl(age)}';
}

class _ProfileChip extends StatelessWidget {
  const _ProfileChip(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(color: c.chip, borderRadius: BorderRadius.circular(18)),
      child: Text(text, style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w600)),
    );
  }
}

class _SettingsLabel extends StatelessWidget {
  const _SettingsLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text.toUpperCase(),
            style: AppFonts.mono(size: 11, color: context.colors.inkMutedXl, weight: FontWeight.w700)),
      );
}

/// Строка данных: иконка + тип + значение; long-press копирует.
class _DataRow extends StatelessWidget {
  const _DataRow({required this.icon, required this.type, required this.value, this.copyable = false});
  final IconData icon;
  final String type;
  final String value;
  final bool copyable;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onLongPress: () {
        Clipboard.setData(ClipboardData(text: value));
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Скопировано')));
      },
      onTap: copyable
          ? () {
              Clipboard.setData(ClipboardData(text: value));
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Скопировано')));
            }
          : null,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
        child: Row(
          children: <Widget>[
            Icon(icon, size: 18, color: c.inkMuted),
            const SizedBox(width: 12),
            Text(type, style: TextStyle(fontSize: 14, color: c.inkMuted)),
            const Spacer(),
            Flexible(
              child: Text(value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: copyable ? c.accent : c.ink)),
            ),
            if (copyable) ...<Widget>[const SizedBox(width: 6), Icon(Icons.copy, size: 15, color: c.inkMutedXl)],
          ],
        ),
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
        builder: (_) => _AddIncomeForm(clientId: clientId),
      ),
      icon: const Icon(Icons.add, size: 16),
      label: const Text('Добавить'),
    );
  }
}

/// Тип дохода. package/subscription → пакет; остальные → простой доход.
enum _IncomeKind { package, subscription, online, inventory, pharma, other }

const Map<_IncomeKind, String> _incomeLabels = <_IncomeKind, String>{
  _IncomeKind.package: 'Пакет тренировок',
  _IncomeKind.subscription: 'Абонемент',
  _IncomeKind.online: 'Онлайн сопровождение',
  _IncomeKind.inventory: 'Инвентарь',
  _IncomeKind.pharma: 'Фарма',
  _IncomeKind.other: 'Прочее',
};

/// Форма «Новый доход» (зеркало веб IncomeForm): чипы типа + поля по типу.
class _AddIncomeForm extends ConsumerStatefulWidget {
  const _AddIncomeForm({required this.clientId});
  final String clientId;
  @override
  ConsumerState<_AddIncomeForm> createState() => _AddIncomeFormState();
}

class _AddIncomeFormState extends ConsumerState<_AddIncomeForm> {
  _IncomeKind _kind = _IncomeKind.package;
  final TextEditingController _lessons = TextEditingController(text: '20');
  final TextEditingController _price = TextEditingController(); // ₽ за тренировку / период / сумма
  final TextEditingController _note = TextEditingController();
  DateTime _paidAt = DateTime.now();
  DateTime _starts = DateTime.now();
  DateTime? _ends;
  bool _busy = false;

  bool get _isPackage => _kind == _IncomeKind.package;
  bool get _isSubscription => _kind == _IncomeKind.subscription;
  bool get _isPkgKind => _isPackage || _isSubscription;

  @override
  void dispose() {
    _lessons.dispose();
    _price.dispose();
    _note.dispose();
    super.dispose();
  }

  String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  String _fmtRu(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
  num get _priceNum => num.tryParse(_price.text.trim().replaceAll(',', '.')) ?? 0;
  int get _lessonsNum => int.tryParse(_lessons.text.trim()) ?? 0;

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

  Future<void> _save() async {
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    final NavigatorState nav = Navigator.of(context);
    if (_priceNum <= 0) {
      m.showSnackBar(const SnackBar(content: Text('Укажите сумму')));
      return;
    }
    if (_isSubscription && _ends == null) {
      m.showSnackBar(const SnackBar(content: Text('Укажите дату окончания абонемента')));
      return;
    }
    setState(() => _busy = true);
    try {
      if (_isPkgKind) {
        // package: lessonsPaid=N, totalPaid=N*price; subscription: lessonsPaid=0, totalPaid=цена периода.
        final int lessons = _isPackage ? _lessonsNum : 0;
        final num total = _isPackage ? _lessonsNum * _priceNum : _priceNum;
        await ref.read(trainerClientCardApiProvider).createPackage(
              widget.clientId,
              lessonsPaid: lessons,
              totalPaid: total,
              workoutType: _isSubscription ? 'Абонемент' : null,
              startsAt: _iso(_starts),
              endsAt: _ends != null ? _iso(_ends!) : null,
            );
        ref.invalidate(clientPackagesProvider(widget.clientId));
      } else {
        await ref.read(trainerAccountingApiProvider).createIncome(<String, dynamic>{
          'category': _incomeLabels[_kind],
          'amount': _priceNum,
          'date': _iso(_paidAt),
          'clientId': widget.clientId,
          if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
        });
      }
      ref.invalidate(trainerIncomesProvider);
      if (!mounted) return;
      nav.pop();
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
            Text('Новый доход', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
            const SizedBox(height: 14),
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
            if (_isPkgKind) ...<Widget>[
              Row(
                children: <Widget>[
                  if (_isPackage) ...<Widget>[
                    Expanded(
                      child: TextField(
                        controller: _lessons,
                        keyboardType: TextInputType.number,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(labelText: 'Тренировок', border: OutlineInputBorder()),
                      ),
                    ),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: TextField(
                      controller: _price,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                          labelText: _isPackage ? '₽ за тренировку' : 'Цена периода, ₽',
                          border: const OutlineInputBorder()),
                    ),
                  ),
                ],
              ),
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
              TextField(
                controller: _price,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(labelText: 'Сумма, ₽', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 12),
              _dateField(c, 'Дата', _paidAt, (DateTime d) => setState(() => _paidAt = d)),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _note,
              decoration: const InputDecoration(labelText: 'Заметка (необязательно)', border: OutlineInputBorder()),
            ),
            if (_isPackage) ...<Widget>[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 12),
                alignment: Alignment.center,
                decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(12)),
                child: Text('Итого пакет: ${_money(_lessonsNum * _priceNum)}',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _save,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              child: _busy
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(_isPackage ? 'Сохранить пакет' : _isSubscription ? 'Сохранить абонемент' : 'Сохранить доход'),
            ),
          ],
        ),
      ),
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
        decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
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
          border: const OutlineInputBorder(),
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

