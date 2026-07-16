import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/trainer_accounting.dart';
import '../api/trainer_assign.dart';
import '../api/trainer_calendar.dart';
import '../api/trainer_catalog.dart';
import '../api/trainer_client_card.dart';
import '../api/trainer_client_stats.dart';
import '../api/trainer_clients.dart';
import '../api/trainer_medical.dart';
import '../api/trainer_workouts.dart';
import '../api/local_workout.dart';
import '../api/offline_providers.dart';
import '../widgets/income_form.dart';
import '../widgets/nav_bar.dart';
import 'accounting_screen.dart';
import 'active_workout_screen.dart';
import 'calendar_screen.dart';
import 'client_edit_screen.dart';
import 'client_medical_screen.dart';
import 'connect_scan_screen.dart';
import 'exercise_progress.dart';
import 'template_edit_screen.dart';

enum _Format { all, online, gym }

/// ID клиентов, у которых сейчас есть оплаченные тренировки (для фильтра
/// «Активные»). Активный = paidBalance > 0 = оплачено (активные пакеты) −
/// проведено (как в бейдже). Тянет пакеты и тренировки по каждому клиенту —
/// провайдер запрашивается только когда фильтр включён.
final FutureProvider<Set<String>> clientsWithPaidLessonsProvider = FutureProvider<Set<String>>((Ref ref) async {
  final List<Client> clients = ref.watch(trainerClientsProvider).valueOrNull ?? <Client>[];
  final TrainerClientCardApi api = ref.read(trainerClientCardApiProvider);
  final List<(String, bool)> results = await Future.wait(clients.map((Client cl) async {
    try {
      final List<TPackage> pkgs = await api.packages(cl.id);
      final List<TWorkout> workouts = await api.workouts(cl.id);
      final int paidLessons =
          pkgs.where((TPackage p) => p.isActive).fold<int>(0, (int a, TPackage p) => a + p.lessonsPaid);
      final int completed =
          workouts.where((TWorkout w) => w.status == 'completed' && !w.createdByClient).length;
      return (cl.id, paidLessons - completed > 0);
    } catch (_) {
      return (cl.id, false);
    }
  }));
  return <String>{for (final (String, bool) r in results) if (r.$2) r.$1};
});

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
  bool _activeOnly = false; // показывать только клиентов с оплаченными тренировками
  _Format _format = _Format.all;
  // Проверку «подскажи про клиентское приложение» делаем один раз за жизнь экрана.
  bool _clientAppNudgeChecked = false;
  // Контроллер контекстной кнопки «+» нижнего меню (захватываем заранее — снятие
  // откладываем на кадр, менять провайдер прямо в dispose нельзя).
  late final _navFabCtrl = ref.read(navFabProvider.notifier);

  @override
  void initState() {
    super.initState();
    // FAB «добавить клиента» переносим в нижнее меню (кнопка «+» в плашке).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _navFabCtrl.state = (
        loc: '/clients',
        icon: Icons.person_add_alt,
        onTap: () => Navigator.of(context).push<bool>(
          MaterialPageRoute<bool>(builder: (_) => const ClientEditScreen()),
        ),
      );
    });
  }

  @override
  void dispose() {
    final ctrl = _navFabCtrl;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (ctrl.state?.loc == '/clients') ctrl.state = null;
    });
    super.dispose();
  }

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
    // Множество «активных» клиентов подтягиваем только когда фильтр включён.
    final AsyncValue<Set<String>>? activeAsync =
        _activeOnly ? ref.watch(clientsWithPaidLessonsProvider) : null;
    final Map<String, Session> nextByClient =
        _nextSessionByClient(ref.watch(trainerSessionsProvider).valueOrNull ?? <Session>[]);

    return Scaffold(
      body: SafeArea(
        // Низ НЕ резервируем: список идёт во всю высоту (за плавающим меню), а
        // отступ под меню задаём как scroll-padding самого списка (см. _alphaList/
        // _sessionList) — тогда последний контакт прокручивается над меню, а не
        // упирается в пустую полосу внизу экрана.
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Text('Клиенты', style: AppFonts.display(size: 24, color: c.ink)),
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
                  const SizedBox(width: 8),
                  // Фильтр «Активные»: только клиенты с оплаченными тренировками.
                  GestureDetector(
                    onTap: () => setState(() => _activeOnly = !_activeOnly),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                      decoration: BoxDecoration(
                        color: _activeOnly ? c.accent : c.card,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: _activeOnly ? c.accent : c.line),
                      ),
                      child: Text('Активные',
                          style: AppFonts.mono(
                              size: 11,
                              color: _activeOnly ? c.accentOn : c.inkMuted,
                              weight: FontWeight.w600)),
                    ),
                  ),
                  const Spacer(),
                  _FormatSeg(value: _format, onChanged: (_Format f) => setState(() => _format = f)),
                ],
              ),
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
                  // Раз за сессию экрана — подсказка про клиентское приложение
                  // (если есть клиенты, но ни один не подключён).
                  if (!_clientAppNudgeChecked && all.isNotEmpty) {
                    _clientAppNudgeChecked = true;
                    WidgetsBinding.instance
                        .addPostFrameCallback((_) => _maybeShowClientAppNudge(all));
                  }
                  if (_activeOnly && activeAsync!.isLoading) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  final Set<String>? activeIds =
                      _activeOnly ? (activeAsync!.valueOrNull ?? <String>{}) : null;
                  final List<Client> filtered = all
                      .where((Client x) =>
                          _matchesQuery(x) &&
                          _matchesFormat(x) &&
                          (activeIds == null || activeIds.contains(x.id)))
                      .toList();
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
      padding: EdgeInsets.fromLTRB(16, 4, 16, MediaQuery.of(context).padding.bottom + 16),
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
    return ListView(padding: EdgeInsets.fromLTRB(16, 4, 16, MediaQuery.of(context).padding.bottom + 16), children: items);
  }

  /// Подсказка «у клиентов есть приложение»: показываем в «Клиентах» не чаще
  /// раза в день, только если есть клиенты и НИ ОДИН не подключён (нет accountId).
  /// Как только тренер подключит хотя бы одного — условие ложно, больше не
  /// показываем. Кнопка «Не показывать» отключает подсказку насовсем.
  Future<void> _maybeShowClientAppNudge(List<Client> all) async {
    if (all.isEmpty || all.any((Client c) => c.isConnected)) return;
    final List<Map<String, dynamic>>? raw =
        await LocalJsonStore.instance.readList('client_app_nudge');
    final Map<String, dynamic> state =
        (raw != null && raw.isNotEmpty) ? Map<String, dynamic>.from(raw.first) : <String, dynamic>{};
    if (state['disabled'] == true) return;
    final String today = DateTime.now().toIso8601String().substring(0, 10);
    if (state['lastShownDate'] == today) return;
    state['lastShownDate'] = today;
    await LocalJsonStore.instance.writeList('client_app_nudge', <Map<String, dynamic>>[state]);
    if (!mounted) return;
    final AppColors c = context.colors;
    await showDialog<void>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        backgroundColor: c.card,
        title: Text('У клиентов есть приложение', style: TextStyle(color: c.ink)),
        content: Text(
          'Если клиент установит приложение «FitFlow me» и вы свяжете его карточку '
          '(по ID или QR клиента), появятся:\n\n'
          '• чат с клиентом;\n'
          '• согласование тренировок;\n'
          '• клиент видит свой прогресс и историю тренировок.\n\n'
          'Попросите клиента установить приложение и передать вам ID/QR — добавьте его в карточке клиента.',
          style: TextStyle(color: c.inkMuted, height: 1.4),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              state['disabled'] = true;
              await LocalJsonStore.instance
                  .writeList('client_app_nudge', <Map<String, dynamic>>[state]);
            },
            child: const Text('Не показывать'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Понятно'),
          ),
        ],
      ),
    );
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
        : (client.phone?.trim().isNotEmpty == true ? formatPhone(client.phone!.trim()) : 'без телефона');
    return Opacity(
      opacity: client.status == ClientStatus.archived ? 0.6 : 1,
      child: GestureDetector(
        onTap: () {
          // Прогреваем данные карточки заранее (бейджи: оплата/календарь/рекорды),
          // чтобы они были готовы к моменту отрисовки хаба, а не подгружались после.
          ref.read(clientPackagesProvider(client.id).future).ignore();
          ref.read(clientWorkoutsCardProvider(client.id).future).ignore();
          ref.read(clientStatsProvider(client.id).future).ignore();
          context.push('/client/${client.id}', extra: client);
        },
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
              // Индикатор связи: зелёный линк — клиент подключён; красный разрыв —
              // нет синхронизации, тап по нему поясняет, что нужно связать клиента
              // (тап перехватывается локально и не открывает карточку).
              if (client.isConnected)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Icon(Icons.link, size: 18, color: c.success),
                )
              else
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      behavior: SnackBarBehavior.floating,
                      content: const Text(
                        'Клиент не синхронизирован. Попросите его установить «FitFlow me» '
                        'и свяжитесь по ID или QR из его приложения.',
                      ),
                    ),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: Icon(Icons.link_off, size: 18, color: c.danger),
                  ),
                ),
              const SizedBox(width: 6),
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

/// "YYYY-MM-DD" → "ДД.ММ.ГГГГ" (для графика рассрочки).
String _dateIso(String iso) {
  final DateTime? d = DateTime.tryParse(iso);
  if (d == null) return iso;
  return '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
}

/// Разбивка числа по разрядам + «₽».
String _moneyRu(num v) {
  final int n = v.round();
  final String s = n.abs().toString();
  final StringBuffer b = StringBuffer();
  for (int i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(' ');
    b.write(s[i]);
  }
  return '$b ₽';
}

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

    // Бейджи: paidBalance / achievements (формулы — зеркало web).
    final List<TPackage> pkgs = ref.watch(clientPackagesProvider(c.id)).valueOrNull ?? <TPackage>[];
    final List<TWorkout> workouts = ref.watch(clientWorkoutsCardProvider(c.id)).valueOrNull ?? <TWorkout>[];
    final ClientStatsData? stats = ref.watch(clientStatsProvider(c.id)).valueOrNull;

    // «X/Y» (проведено/всего) с переносом остатка в новый пакет; «0» — исчерпан.
    final String pkgLabel = packageProgressLabel(packageProgress(pkgs, workouts));
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
        onTap: () => Navigator.of(context).push<void>(MaterialPageRoute<void>(
          builder: (_) => CalendarScreen(clientId: c.id, clientName: c.fullName),
        )),
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
        badge: _Badge(text: pkgLabel, danger: false),
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
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
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
                  phone: c.phone!.trim(),
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
      AnimationController(vsync: this, duration: const Duration(milliseconds: 2200))..repeat();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  /// Импульс появления шеврона (зеркало web cta-chevron-cycle): в первой четверти
  /// фазы яркнет (0→1), во второй гаснет (1→0), остаток — покой. Со сдвигом по i
  /// шевроны «бегут» слева направо медленным каскадом.
  double _pulse(double t) {
    final double x = ((t % 1.0) + 1.0) % 1.0;
    if (x < 0.25) return x / 0.25;
    if (x < 0.5) return (0.5 - x) / 0.25;
    return 0;
  }

  /// Один шеврон каскада: сдвиг (наезд слева) + масштаб-«пульс» + прозрачность.
  Widget _chevron(int i, AppColors c) {
    final double p = _pulse(_ctrl.value - i * 0.14);
    return Transform.translate(
      offset: Offset(-7.0 * i + 5 * (1 - p), 0),
      child: Transform.scale(
        scale: 0.95 + 0.3 * p,
        child: Opacity(
          opacity: 0.25 + 0.75 * p,
          child: Icon(Icons.chevron_right, size: 30, color: c.accentOn),
        ),
      ),
    );
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
            // Массивный медленный каскад шевронов (зеркало web cta-chevron).
            AnimatedBuilder(
              animation: _ctrl,
              builder: (BuildContext context, _) => Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[for (int i = 0; i < 3; i++) _chevron(i, c)],
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
    this.phone,
  });
  final IconData icon;
  final Color iconColor;
  final String text;
  final Color textColor;

  /// Если задан — строка становится телефоном: тап звонит (набор номера),
  /// удержание копирует сырой номер. Отображается через [formatPhone].
  final String? phone;

  Future<void> _dial(BuildContext context) async {
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      await launchUrl(phoneTelUri(phone!), mode: LaunchMode.externalApplication);
    } catch (_) {
      m.showSnackBar(const SnackBar(content: Text('Не удалось открыть набор')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final bool isPhone = phone != null;
    final String display = isPhone ? formatPhone(text) : text;
    final Widget row = Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
      child: Row(
        children: <Widget>[
          Icon(icon, size: 18, color: iconColor),
          const SizedBox(width: 12),
          Expanded(child: Text(display, style: TextStyle(fontSize: 15, color: textColor))),
          if (isPhone) Icon(Icons.call, size: 16, color: c.inkMutedXl),
        ],
      ),
    );
    if (!isPhone) return row;
    return GestureDetector(
      onTap: () => _dial(context),
      onLongPress: () {
        Clipboard.setData(ClipboardData(text: phone!));
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Скопировано')));
      },
      child: row,
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
            Text(
                'Клиент должен установить приложение «FitFlow me» и передать вам свой ID '
                '(или QR) из него — введите его ниже. После связки появятся чат, '
                'согласование тренировок и доступ клиента к своему прогрессу и истории.',
                style: TextStyle(fontSize: 13, color: c.inkMuted)),
            const SizedBox(height: 12),
            SelectAllTextField(
              controller: code,
              autofocus: true,
              decoration: InputDecoration(
                labelText: 'ID клиента',
                border: const OutlineInputBorder(),
                suffixIcon: IconButton(
                  tooltip: 'Сканировать QR-код',
                  icon: const Icon(Icons.qr_code_scanner),
                  onPressed: () async {
                    final String? scanned = await scanConnectCode(ctx);
                    if (scanned != null) code.text = scanned;
                  },
                ),
              ),
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
    // Сбрасываем кэш тренировки, чтобы экран открылся со СВЕЖИМ статусом (active
    // после старта), а не устаревшим черновиком из кэша — иначе «Продолжить»
    // показывал экран-редактор черновика вместо проведения.
    ref.invalidate(trainerWorkoutProvider((clientId: _cid, wid: wid)));
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(builder: (_) => ActiveWorkoutScreen(clientId: _cid, workoutId: wid)),
    );
    ref.invalidate(clientWorkoutsCardProvider(_cid));
  }

  /// Живую тренировку можно провести только по согласованному (подтверждённому
  /// клиентом) занятию. Непривязанному клиенту согласовывать не с кем — разрешаем.
  /// Иначе показываем окно и возвращаем false (тренировку не создаём/не открываем).
  Future<bool> _canConductNow() async {
    if (!widget.client.isConnected) return true;
    try {
      final List<Session> sessions = await ref.read(trainerSessionsProvider.future);
      final bool hasConfirmed = sessions.any((Session s) =>
          s.clientId == _cid &&
          s.status == SessionStatus.planned &&
          s.confirmation == ClientConfirmation.confirmed);
      if (hasConfirmed) return true;
    } catch (_) {
      return true; // не удалось проверить — не блокируем
    }
    if (mounted) await _showNoConfirmedDialog();
    return false;
  }

  Future<void> _showNoConfirmedDialog() async {
    await showDialog<void>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Нет согласованных тренировок'),
        content: const Text(
            'Запланируйте и согласуйте занятие с клиентом в календаре — тогда тренировку можно будет провести.'),
        actions: <Widget>[
          FilledButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Понятно')),
        ],
      ),
    );
  }

  /// Открыть «ближайшую» тренировку. Ещё не начатую (черновик) — только по
  /// согласованному занятию (проверка ДО входа). Идущую (active) — без проверки.
  Future<void> _openCurrent(TWorkout w) async {
    if (w.status == 'draft' && !await _canConductNow()) return;
    await _openConduct(w.id);
  }

  /// Провести тренировку по плану (не историческую). Офлайн → локальный документ
  /// (offline-first: создать+провести+завершить без сети, при связи — импорт);
  /// онлайн → существующий серверный путь (assign + серверный экран проведения).
  /// [exercises] — серверный формат плана (как для assign/шаблона).
  Future<void> _conductPlan(String name, List<Map<String, dynamic>> exercises,
      {String? sourceTemplateId}) async {
    final bool offline = ref.read(isOnlineProvider).valueOrNull == false;
    if (offline) {
      await _conductLocal(name, exercises, sourceTemplateId);
      return;
    }
    await _createAndOpen(name, exercises);
  }

  /// Локальное (offline) проведение: собрать план в локальный формат, создать
  /// документ и открыть экран проведения в локальном режиме.
  Future<void> _conductLocal(
      String name, List<Map<String, dynamic>> exercises, String? sourceTemplateId) async {
    if (_busy) return;
    setState(() => _busy = true);
    final NavigatorState nav = Navigator.of(context);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      final LocalWorkout w = await ref.read(localWorkoutControllerProvider).createFromPlan(
            clientId: _cid,
            name: name,
            sourceTemplateId: sourceTemplateId,
            plan: _mapsToPlan(exercises),
          );
      ref.invalidate(localWorkoutsProvider(_cid));
      if (!mounted) return;
      setState(() => _busy = false);
      await nav.push<void>(MaterialPageRoute<void>(
        builder: (_) => ActiveWorkoutScreen.local(localWorkoutId: w.id),
      ));
      ref.invalidate(localWorkoutsProvider(_cid));
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось создать тренировку')));
    }
  }

  /// Серверный план (exercises c sets) → локальный формат (один LocalSet на
  /// подход). Имена упражнений берём из каталога по exerciseId.
  List<({String exerciseId, String name, LocalSet set})> _mapsToPlan(
      List<Map<String, dynamic>> exercises) {
    final List<TExercise> catalog = ref.read(trainerCatalogProvider).valueOrNull ?? <TExercise>[];
    final Map<String, TExercise> byId = <String, TExercise>{
      for (final TExercise e in catalog) e.id: e,
    };
    final List<({String exerciseId, String name, LocalSet set})> out =
        <({String exerciseId, String name, LocalSet set})>[];
    for (final Map<String, dynamic> ex in exercises) {
      final String id = ex['exerciseId'] as String? ?? '';
      final String nm = byId[id]?.name ?? 'Упражнение';
      final List<Map<String, dynamic>> sets =
          ((ex['sets'] as List<dynamic>?) ?? const <dynamic>[]).cast<Map<String, dynamic>>();
      for (final Map<String, dynamic> s in sets) {
        out.add((
          exerciseId: id,
          name: nm,
          set: LocalSet(
            setIndex: 0,
            plannedReps: s['plannedReps'] as num?,
            plannedWeightKg: s['plannedWeightKg'] as num?,
            plannedTimeSec: s['plannedTimeSec'] as num?,
            plannedRestSec: s['plannedRestSec'] as num?,
          ),
        ));
      }
    }
    return out;
  }

  /// Открыть локальный документ на продолжение (resume).
  Future<void> _openLocal(String localWorkoutId) async {
    await Navigator.of(context).push<void>(MaterialPageRoute<void>(
      builder: (_) => ActiveWorkoutScreen.local(localWorkoutId: localWorkoutId),
    ));
    if (mounted) ref.invalidate(localWorkoutsProvider(_cid));
  }

  /// Создать черновик и открыть редактор. [exercises] — план (пустой/из шаблона).
  /// [excluded] — историческая запись (постфактум, без влияния на баланс/календарь).
  Future<void> _createAndOpen(String name, List<Map<String, dynamic>> exercises,
      {bool excluded = false}) async {
    if (_busy) return;
    // Проверяем согласование ДО создания черновика — чтобы не заходить в тренировку
    // впустую. Историческую запись (excluded, постфактум) согласовывать не нужно.
    if (!excluded && !await _canConductNow()) return;
    if (!mounted) return;
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

  /// Создать ПЕРСОНАЛЬНЫЙ шаблон тренировки для этого клиента (база знаний,
  /// scope = клиент). Сразу назначать не нужно — шаблон появится в базе.
  /// «Создать тренировку» у клиента: собрать в редакторе → сохранить персональный
  /// шаблон в базу И поставить по нему черновик наверх («ближайшая»). Черновик
  /// держится до проведения или создания новой тренировки.
  Future<void> _createTemplate() async {
    final StagedWorkout? staged = await Navigator.of(context).push<StagedWorkout>(
      MaterialPageRoute<StagedWorkout>(
        builder: (_) => TemplateEditScreen(
          clientId: _cid,
          clientName: widget.client.fullName,
          stageDraftForClient: true,
        ),
      ),
    );
    ref.invalidate(trainerTemplatesProvider);
    if (staged == null || !mounted) return;
    await _stageDraft(staged.name, staged.plan);
  }

  /// Поставить свежесозданную тренировку наверх: назначаем клиенту черновик по
  /// плану (без гейта согласования — провести можно будет по тапу). Прежние
  /// неподтверждённые черновики тренера убираем, чтобы наверху была одна — новая.
  Future<void> _stageDraft(String name, List<Map<String, dynamic>> plan) async {
    // Офлайн: сразу проводим локально (серверная «staging» недоступна без сети).
    if (ref.read(isOnlineProvider).valueOrNull == false) {
      await _conductLocal(name, plan, null);
      return;
    }
    if (_busy) return;
    setState(() => _busy = true);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      final String newId =
          await ref.read(trainerAssignApiProvider).assignReturningId(_cid, name, plan);
      final List<TWorkout> existing =
          ref.read(clientWorkoutsCardProvider(_cid)).valueOrNull ?? <TWorkout>[];
      for (final TWorkout w in existing) {
        if (w.id != newId && w.status == 'draft' && !w.createdByClient) {
          await ref.read(trainerWorkoutsApiProvider).delete(_cid, w.id);
        }
      }
      ref.invalidate(clientWorkoutsCardProvider(_cid));
    } catch (_) {
      m.showSnackBar(const SnackBar(
          content: Text('Шаблон сохранён, но не удалось поставить тренировку наверх')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickTemplate({bool excluded = false}) async {
    final WorkoutTemplate? t = await showModalBottomSheet<WorkoutTemplate>(
      context: context,
      backgroundColor: context.colors.bg,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _TemplatePickerSheet(
        clientId: _cid,
        onCreateNew: () => excluded
            ? _createAndOpen('Новая тренировка', <Map<String, dynamic>>[], excluded: true)
            : _conductPlan('Новая тренировка', <Map<String, dynamic>>[]),
      ),
    );
    if (t == null) return;
    // sets=N в шаблоне → N отдельных подходов (как в вебе), иначе тоннаж занижен.
    final List<Map<String, dynamic>> ex = t.exercises
        .expand((TemplateExercise e) => List<Map<String, dynamic>>.generate(
              e.sets < 1 ? 1 : e.sets,
              (_) => <String, dynamic>{
                'exerciseId': e.exerciseId,
                'sets': <Map<String, dynamic>>[
                  <String, dynamic>{
                    'plannedReps': ?e.reps,
                    'plannedWeightKg': ?e.weightKg,
                    'plannedTimeSec': ?e.timeSec,
                    'plannedRestSec': ?e.restSec,
                  },
                ],
              },
            ))
        .toList();
    if (excluded) {
      await _createAndOpen(t.name, ex, excluded: true);
    } else {
      await _conductPlan(t.name, ex, sourceTemplateId: t.id);
    }
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
          // Ближайшая — только тренерская (не createdByClient). Идущая (active) в
          // приоритете, иначе самый свежий черновик (порядок из API — desc
          // createdAt). Разбиваем без sort — Dart List.sort нестабилен.
          final List<TWorkout> currentPool = all
              .where((TWorkout w) => (w.status == 'active' || w.status == 'draft') && !w.createdByClient)
              .toList();
          final List<TWorkout> current = <TWorkout>[
            ...currentPool.where((TWorkout w) => w.status == 'active'),
            ...currentPool.where((TWorkout w) => w.status == 'draft'),
          ];
          final List<TWorkout> history = all.where((TWorkout w) => w.status == 'completed' || w.status == 'skipped').toList()
            ..sort((TWorkout a, TWorkout b) => (b.completedAt ?? DateTime(0)).compareTo(a.completedAt ?? DateTime(0)));

          // Активные ЛОКАЛЬНЫЕ документы (offline-first, «продолжить») — сверху,
          // дополнительно к серверной карточке (её не убираем).
          final List<LocalWorkout> locals =
              ref.watch(localWorkoutsProvider(_cid)).valueOrNull ?? <LocalWorkout>[];

          // Ближайшее запланированное занятие клиента (дата/время) — для подзаголовка.
          final Session? nextSess =
              _nextSessionByClient(ref.watch(trainerSessionsProvider).valueOrNull ?? <Session>[])[_cid];
          final String header = nextSess != null
              ? 'БЛИЖАЙШАЯ ТРЕНИРОВКА · ${_groupLabel(nextSess.date).toUpperCase()}, ${nextSess.startTime}'
              : 'БЛИЖАЙШАЯ ТРЕНИРОВКА';

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: <Widget>[
              Text(header, style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w700)),
              const SizedBox(height: 8),
              // Локальные (offline) активные документы — «Продолжить» (resume).
              for (final LocalWorkout d in locals)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _LocalResumeCard(doc: d, onTap: () => _openLocal(d.id)),
                ),
              if (current.isNotEmpty)
                _CurrentWorkoutCard(
                  w: current.first,
                  onTap: () => _openCurrent(current.first),
                  onCancel: () => _cancelWorkout(current.first),
                )
              else
                _EmptyCurrent(
                  busy: _busy,
                  onTemplate: _pickTemplate,
                  onCreateTemplate: _createTemplate,
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
        onEdit: () => _openConduct(w.id),
        onDelete: () => _cancelWorkout(w),
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
    required this.onEdit,
    required this.onDelete,
    required this.busy,
  });
  final TWorkout workout;
  final String clientId;
  final VoidCallback onRepeat;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final bool busy;
  @override
  ConsumerState<_HistoryCard> createState() => _HistoryCardState();
}

class _HistoryCardState extends ConsumerState<_HistoryCard> {
  bool _expanded = false;

  String _setSummary(WorkoutSet s, {required bool actual}) {
    final num reps = (actual ? (s.actualReps ?? s.plannedReps) : s.plannedReps) ?? 0;
    final num weight = (actual ? (s.actualWeightKg ?? s.plannedWeightKg) : s.plannedWeightKg) ?? 0;
    final num time = (actual ? (s.actualTimeSec ?? s.plannedTimeSec) : s.plannedTimeSec) ?? 0;
    final num rest = s.plannedRestSec ?? 0;
    String n(num v) => v % 1 == 0 ? v.toInt().toString() : v.toString();
    // Основные параметры подхода: повторы/вес/время/отдых (как в строке подхода).
    return '${n(reps)}/${n(weight)}/${n(time)}/${n(rest)}';
  }

  /// Длительность проведённой тренировки: «45 мин» / «1 ч 5 мин» (или «40 с»).
  String _fmtDur(int sec) => sec < 60 ? '$sec с' : calHumanDuration(sec ~/ 60);

  String _exerciseSummary(WorkoutExercise ex) {
    // Только ВЫПОЛНЕННЫЕ подходы (пропущенные в историю не показываем).
    final List<WorkoutSet> done = ex.sets.where((WorkoutSet s) => s.done).toList();
    if (done.isEmpty) return '';
    final String head = done.length > 1 ? '${done.length}× ' : '';
    return '$head${_setSummary(done.first, actual: true)}';
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Slidable(
        key: ValueKey<String>('hist-${w.id}'),
        // Свайп влево → повторить / изменить / удалить (как у строк подходов).
        endActionPane: ActionPane(
          motion: const DrawerMotion(),
          extentRatio: 0.62,
          children: <Widget>[
            SlidableAction(
              onPressed: (_) => _confirmRepeat(),
              backgroundColor: c.accent,
              foregroundColor: c.accentOn,
              icon: Icons.replay,
              label: 'Повторить',
            ),
            SlidableAction(
              onPressed: (_) => widget.onEdit(),
              backgroundColor: c.cardElevated,
              foregroundColor: c.ink,
              icon: Icons.edit_outlined,
              label: 'Изм.',
            ),
            SlidableAction(
              onPressed: (_) => widget.onDelete(),
              backgroundColor: c.danger,
              foregroundColor: Colors.white,
              icon: Icons.delete_outline,
              label: 'Удал.',
            ),
          ],
        ),
        child: Container(
          clipBehavior: Clip.antiAlias,
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
                            if (!skipped && (w.durationSec ?? 0) > 0) _fmtDur(w.durationSec!),
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
        ),
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
          // Только упражнения с ≥1 ВЫПОЛНЕННЫМ подходом (пропущенные не показываем).
          final List<WorkoutExercise> exs = wd.exercises
              .where((WorkoutExercise ex) => ex.sets.any((WorkoutSet s) => s.done))
              .toList()
            ..sort((a, b) => a.position - b.position);
          if (exs.isEmpty) {
            return Text('Нет выполненных упражнений', style: TextStyle(fontSize: 12, color: c.inkMuted));
          }
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

/// Карточка локального (offline) документа — «Продолжить». Тап открывает экран
/// проведения в локальном режиме (resume; переживает перезапуск приложения).
class _LocalResumeCard extends StatelessWidget {
  const _LocalResumeCard({required this.doc, required this.onTap});
  final LocalWorkout doc;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(doc.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
            const SizedBox(height: 4),
            Text('${doc.exercises.length} упр. · идёт (на устройстве)',
                style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
            const SizedBox(height: 12),
            Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(color: c.accent, borderRadius: BorderRadius.circular(12)),
              child: Text('Продолжить',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.accentOn)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Пустая «ближайшая»: создать пустую / выбрать из базы / создать шаблон клиенту.
class _EmptyCurrent extends StatelessWidget {
  const _EmptyCurrent({
    required this.busy,
    required this.onTemplate,
    required this.onCreateTemplate,
  });
  final bool busy;
  final VoidCallback onTemplate;
  final VoidCallback onCreateTemplate;
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
          const SizedBox(height: 8),
          // Создать персональный шаблон тренировки для этого клиента.
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: busy ? null : onCreateTemplate,
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
              child: const Text('Создать тренировку'),
            ),
          ),
        ],
      ),
    );
  }
}

/// Шит выбора шаблона тренировки.
class _TemplatePickerSheet extends ConsumerStatefulWidget {
  const _TemplatePickerSheet({required this.clientId, this.onCreateNew});
  // Клиент, для которого выбираем: показываем общие + его персональные шаблоны.
  final String clientId;
  // Вызывается из пустого состояния (шаблонов нет) — создать тренировку с нуля.
  final VoidCallback? onCreateNew;
  @override
  ConsumerState<_TemplatePickerSheet> createState() => _TemplatePickerSheetState();
}

class _TemplatePickerSheetState extends ConsumerState<_TemplatePickerSheet> {
  final TextEditingController _query = TextEditingController();
  String _cat = ''; // выбранная категория (пусто = все)

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    // Общие (clientId == null) + персональные этого клиента.
    final List<WorkoutTemplate> templates =
        (ref.watch(trainerTemplatesProvider).valueOrNull ?? <WorkoutTemplate>[])
            .where((WorkoutTemplate t) => t.clientId == null || t.clientId == widget.clientId)
            .toList();
    // Категории из доступных шаблонов (как в базе знаний).
    final List<String> tags = <String>{
      for (final WorkoutTemplate t in templates)
        if (t.categoryTag?.isNotEmpty == true) t.categoryTag!,
    }.toList()
      ..sort();
    // Фильтр по категории, затем ранжирование по поиску (по названию).
    final List<WorkoutTemplate> byCat =
        _cat.isEmpty ? templates : templates.where((WorkoutTemplate t) => t.categoryTag == _cat).toList();
    final List<WorkoutTemplate> list = rankBySearch(byCat, _query.text, (WorkoutTemplate t) => t.name);

    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.8,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text('Выбрать из базы', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: c.ink)),
          ),
          if (templates.isEmpty)
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Text('Шаблонов нет. Создайте их в базе знаний.',
                          textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted)),
                      const SizedBox(height: 20),
                      FilledButton.icon(
                        onPressed: () {
                          Navigator.of(context).pop();
                          widget.onCreateNew?.call();
                        },
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Создать новую тренировку'),
                        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                      ),
                    ],
                  ),
                ),
              ),
            )
          else ...<Widget>[
            // Поиск по названию.
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                controller: _query,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: 'Поиск',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: _query.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close, size: 18),
                          onPressed: () => setState(() => _query.clear()),
                        ),
                  filled: true,
                  fillColor: c.card,
                  isDense: true,
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                ),
              ),
            ),
            // Категории (чипы) — как в базе знаний.
            if (tags.isNotEmpty)
              SizedBox(
                height: 40,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: <Widget>[
                    _catChip(c, 'Все', _cat.isEmpty, () => setState(() => _cat = '')),
                    ...tags.map((String g) => _catChip(c, g, _cat == g, () => setState(() => _cat = g))),
                  ],
                ),
              ),
            Expanded(
              child: list.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text('Ничего не нашлось.', style: TextStyle(color: c.inkMuted)),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                      itemCount: list.length,
                      itemBuilder: (BuildContext ctx, int i) {
                        final WorkoutTemplate t = list[i];
                        return GestureDetector(
                          onTap: () => Navigator.pop(ctx, t),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                            child: Row(
                              children: <Widget>[
                                Container(
                                  width: 38,
                                  height: 38,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(color: c.chip, shape: BoxShape.circle),
                                  child: Text('${t.exercises.length}',
                                      style: AppFonts.mono(size: 15, color: c.ink, weight: FontWeight.w700)),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: <Widget>[
                                      Text(t.name,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                                      Text(
                                        <String>[
                                          if (t.categoryTag?.isNotEmpty == true) t.categoryTag!,
                                          '${t.exercises.length} упр.',
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
                      },
                    ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _catChip(AppColors c, String label, bool active, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: active ? c.accent : c.card,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: active ? c.accent : c.line),
            ),
            child: Text(label,
                style: TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w600, color: active ? c.accentOn : c.inkMuted)),
          ),
        ),
      );
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
    // «X/Y» с переносом остатка в новый пакет; «0» — пакет исчерпан.
    final ({int done, int total})? prog = packageProgress(pkgs, workouts);
    final String pkgLabel = packageProgressLabel(prog);

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
                      Text('В ПАКЕТЕ', style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(pkgLabel,
                          style: AppFonts.display(size: 28, color: c.accent, letterSpacing: -1)),
                      Text(
                          prog == null
                              ? 'нет активного пакета'
                              : prog.done >= prog.total
                                  ? 'пакет исчерпан'
                                  : 'проведено / всего',
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
        return ListView(
            padding: const EdgeInsets.all(16),
            children: <Widget>[ExerciseProgressTab(clientId: widget.client.id)]);
      case _ProgTab.measure:
        return ListView(
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: <Widget>[
                _AddMeasureButton(clientId: widget.client.id),
                const SizedBox(width: 4),
                _RequestMeasureButton(clientId: widget.client.id),
              ],
            ),
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

/// Ракурсы фото прогресса: ключ API → подпись (зеркало клиентского kAngleLabels).
const Map<String, String> _kAngleLabels = <String, String>{
  'front': 'Спереди',
  'side': 'Сбоку',
  'back': 'Сзади',
};

/// Вкладка «Фото»: карточка загрузки (дата + гид ракурса + выбор фото) и ниже
/// сетка фото прогресса клиента по ракурсам. Тренер добавляет фото сам (зеркало
/// клиентского `_PhotosTab`): выбор через image_picker, ракурс/дата — как у
/// клиента, загрузка идёт в общий скоуп (клиент увидит фото автоматически).
class _PhotosTab extends ConsumerStatefulWidget {
  const _PhotosTab({required this.clientId});
  final String clientId;
  @override
  ConsumerState<_PhotosTab> createState() => _PhotosTabState();
}

class _PhotosTabState extends ConsumerState<_PhotosTab> {
  String _angle = 'front';
  DateTime _date = DateTime.now();
  bool _uploading = false;
  String? _error;

  Future<void> _pick() async {
    if (_uploading) return;
    // Захватываем messenger до async-гэпа (pickImage) — иначе линт на context.
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    final XFile? p =
        await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, imageQuality: 85);
    if (p == null) return;
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      await ref.read(trainerClientCardApiProvider).uploadPhoto(
            widget.clientId,
            date: _isoDate(_date),
            angle: _angle,
            filePath: p.path,
            fileName: p.name,
          );
      if (!mounted) return;
      ref.invalidate(clientPhotosCardProvider(widget.clientId));
      m.showSnackBar(const SnackBar(content: Text('Фото добавлено')));
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Не удалось загрузить фото.');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  /// Мультизагрузка: до 3 фото одним выбором, ракурс по индексу
  /// (0→спереди, 1→сбоку, 2→сзади), дата — выбранная `_date`.
  Future<void> _pickMany() async {
    if (_uploading) return;
    // Захватываем messenger до async-гэпа (pickMultiImage) — иначе линт на context.
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    final List<XFile> picked =
        await ImagePicker().pickMultiImage(limit: 3, maxWidth: 1600, imageQuality: 85);
    if (picked.isEmpty) return;
    final List<XFile> ps = picked.take(3).toList();
    const List<String> angles = <String>['front', 'side', 'back'];
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      for (int i = 0; i < ps.length; i++) {
        final XFile x = ps[i];
        await ref.read(trainerClientCardApiProvider).uploadPhoto(
              widget.clientId,
              date: _isoDate(_date),
              angle: angles[i],
              filePath: x.path,
              fileName: x.name,
            );
      }
      if (!mounted) return;
      ref.invalidate(clientPhotosCardProvider(widget.clientId));
      m.showSnackBar(SnackBar(content: Text('Фото добавлены (${ps.length} шт.)')));
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Не удалось загрузить фото.');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final AsyncValue<List<TClientPhoto>> photos = ref.watch(clientPhotosCardProvider(widget.clientId));
    final String? token = ref.watch(sessionProvider).token;
    final String base = ref.read(baseUrlProvider).replaceAll(RegExp(r'/$'), '');
    return ListView(
      padding: const EdgeInsets.all(16),
      children: <Widget>[
        // Карточка загрузки: дата + силуэтный гид ракурса + кнопка выбора фото.
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(16)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              GestureDetector(
                onTap: () async {
                  final DateTime now = DateTime.now();
                  final DateTime? d = await showDatePicker(
                      context: context, initialDate: _date, firstDate: DateTime(now.year - 5), lastDate: now);
                  if (d != null) setState(() => _date = d);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(color: c.cardElevated, borderRadius: BorderRadius.circular(12)),
                  child: Row(children: <Widget>[
                    Icon(Icons.event, size: 16, color: c.inkMuted),
                    const SizedBox(width: 8),
                    Text(_fullDate(_date), style: TextStyle(fontSize: 14, color: c.ink)),
                  ]),
                ),
              ),
              const SizedBox(height: 12),
              _BodyPoseGuide(value: _angle, onSelect: (String a) => setState(() => _angle = a)),
              const SizedBox(height: 12),
              _DashedPickButton(
                icon: Icons.add_photo_alternate_outlined,
                label: _uploading
                    ? 'Загрузка · ${_kAngleLabels[_angle]}…'
                    : 'Выбрать фото · ${_kAngleLabels[_angle]}',
                onTap: _uploading ? null : _pick,
              ),
              const SizedBox(height: 8),
              _DashedPickButton(
                icon: Icons.burst_mode_outlined,
                label: _uploading ? 'Загрузка…' : 'Загрузить до 3 фото · спереди · сбоку · сзади',
                onTap: _uploading ? null : _pickMany,
              ),
            ],
          ),
        ),
        if (_error != null) ...<Widget>[
          const SizedBox(height: 12),
          Text(_error!, style: TextStyle(fontSize: 13, color: c.inkMuted)),
        ],
        const SizedBox(height: 16),
        ...photos.when(
          loading: () => <Widget>[
            const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
          ],
          error: (Object e, _) => <Widget>[
            Text('Не удалось загрузить фото', style: TextStyle(color: c.inkMuted)),
          ],
          data: (List<TClientPhoto> list) {
            if (list.isEmpty) {
              return <Widget>[
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Center(
                    child: Text('Фото прогресса пока нет.',
                        textAlign: TextAlign.center, style: TextStyle(color: c.inkMuted)),
                  ),
                ),
              ];
            }
            // Группировка по дате в блоки (зеркало клиентского `_PhotosTab`):
            // заголовок-дата, под ним миниатюры углов этой даты. Список уже
            // отсортирован в провайдере (новые даты сверху, внутри — по ракурсу).
            final Map<String, List<TClientPhoto>> groups = <String, List<TClientPhoto>>{};
            for (final TClientPhoto p in list) {
              groups.putIfAbsent(p.date == null ? '' : _isoDate(p.date!), () => <TClientPhoto>[]).add(p);
            }
            final List<String> keys = groups.keys.toList()..sort((String a, String b) => b.compareTo(a));
            return <Widget>[
              for (int gi = 0; gi < keys.length; gi++) ...<Widget>[
                if (gi > 0) const SizedBox(height: 16),
                _PhotoDateSection(
                    photos: groups[keys[gi]]!, token: token, base: base, clientId: widget.clientId),
              ],
            ];
          },
        ),
      ],
    );
  }
}

/// Блок фото одной даты: заголовок-дата + подпись автора, ниже — сетка миниатюр
/// углов этой даты (зеркало клиентской группировки по дате). Если фото одной
/// даты добавлены разными авторами — автор показывается у каждой миниатюры.
class _PhotoDateSection extends ConsumerWidget {
  const _PhotoDateSection(
      {required this.photos, required this.token, required this.base, required this.clientId});
  final List<TClientPhoto> photos;
  final String? token;
  final String base;
  final String clientId;

  static String _author(bool byClient) => byClient ? 'Клиент' : 'Тренер';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final DateTime? date = photos.first.date;
    final bool mixed = photos.map((TClientPhoto p) => p.createdByClient).toSet().length > 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          children: <Widget>[
            Text(date == null ? 'Без даты' : _fullDate(date),
                style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w600)),
            if (!mixed) ...<Widget>[
              const SizedBox(width: 8),
              Text('· ${_author(photos.first.createdByClient)}',
                  style: TextStyle(fontSize: 12, color: c.inkMutedXl)),
            ],
          ],
        ),
        const SizedBox(height: 8),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3, mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: 0.7),
          itemCount: photos.length,
          itemBuilder: (BuildContext ctx, int i) {
            final TClientPhoto p = photos[i];
            final String angle = _kAngleLabels[p.angle] ?? p.angle;
            return GestureDetector(
              onTap: () async {
                final bool? deleted = await PhotoViewerScreen.show(
                  context,
                  url: '$base/api/files/${p.fileId}',
                  token: token,
                  title: angle,
                  subtitle:
                      '${date == null ? 'Без даты' : _fullDate(date)} · ${_author(p.createdByClient)}',
                  onDelete: () => ref.read(trainerClientCardApiProvider).deletePhoto(clientId, p.id),
                );
                if (deleted == true) {
                  ref.invalidate(clientPhotosCardProvider(clientId));
                }
              },
              child: Stack(
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
                    child: Text(mixed ? '$angle · ${_author(p.createdByClient)}' : angle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
            );
          },
        ),
      ],
    );
  }
}

/// Пунктирная кнопка выбора фото (зеркало клиентского _DashedButton).
class _DashedPickButton extends StatelessWidget {
  const _DashedPickButton({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 13),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: c.line),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Icon(icon, size: 18, color: c.ink),
            const SizedBox(width: 8),
            Flexible(
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.ink)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Силуэтный гид «как встать»: три позы (спереди/сбоку/сзади), активная подсвечена.
/// Зеркало клиентского `_BodyPoseGuide`.
class _BodyPoseGuide extends StatelessWidget {
  const _BodyPoseGuide({required this.value, required this.onSelect});
  final String value;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('В облегающей одежде или белье, телефон на уровне пояса, ровный фон, вся фигура в кадре.',
            style: TextStyle(fontSize: 12, height: 1.3, color: c.inkMuted)),
        const SizedBox(height: 8),
        Row(
          children: <Widget>[
            for (final MapEntry<String, String> e in _kAngleLabels.entries) ...<Widget>[
              Expanded(
                child: GestureDetector(
                  onTap: () => onSelect(e.key),
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: value == e.key ? c.accent.withValues(alpha: 0.10) : c.cardElevated,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: value == e.key ? c.accent : c.line),
                    ),
                    child: Column(
                      children: <Widget>[
                        SizedBox(
                          height: 56,
                          child: CustomPaint(
                            size: const Size(40, 56),
                            painter: _SilhouettePainter(
                              pose: e.key,
                              color: value == e.key ? c.accent : c.inkMutedXl,
                            ),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(e.value,
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: value == e.key ? c.ink : c.inkMuted)),
                      ],
                    ),
                  ),
                ),
              ),
              if (e.key != _kAngleLabels.keys.last) const SizedBox(width: 8),
            ],
          ],
        ),
      ],
    );
  }
}

/// Силуэт-«тушка» для подсказки ракурса (фронт/спина — симметрично, сбоку —
/// профиль). Зеркало клиентского `_SilhouettePainter`.
class _SilhouettePainter extends CustomPainter {
  _SilhouettePainter({required this.pose, required this.color});
  final String pose;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final double sx = size.width / 80;
    final double sy = size.height / 170;
    final Paint paint = Paint()..color = color..style = PaintingStyle.fill;
    Rect r(double x, double y, double w, double h) =>
        Rect.fromLTWH(x * sx, y * sy, w * sx, h * sy);
    void rr(double x, double y, double w, double h, double rad) => canvas.drawRRect(
        RRect.fromRectAndRadius(r(x, y, w, h), Radius.circular(rad * sx)), paint);

    if (pose == 'side') {
      canvas.drawCircle(Offset(33 * sx, 16 * sy), 11 * sx, paint);
      rr(30, 30, 17, 56, 8.5);
      rr(32, 84, 9, 66, 4.5);
      rr(39, 84, 9, 66, 4.5);
    } else {
      canvas.drawCircle(Offset(40 * sx, 15 * sy), 11 * sx, paint);
      rr(25, 32, 30, 52, 9); // торс
      rr(30, 83, 9, 66, 4.5);
      rr(41, 83, 9, 66, 4.5);
    }
  }

  @override
  bool shouldRepaint(_SilhouettePainter old) => old.pose != pose || old.color != color;
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
        // Низ учитывает резерв под глобальное меню навигации.
        padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).padding.bottom + 24),
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
              _DataRow(icon: Icons.phone_outlined, type: 'Телефон', value: c.phone!.trim(), phone: c.phone!.trim()),
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
  const _DataRow({
    required this.icon,
    required this.type,
    required this.value,
    this.copyable = false,
    this.phone,
  });
  final IconData icon;
  final String type;
  final String value;
  final bool copyable;

  /// Если задан — строка становится телефоном: тап звонит (набор номера),
  /// удержание копирует сырой номер. Отображается через [formatPhone].
  final String? phone;

  void _copy(BuildContext context, String text) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Скопировано')));
  }

  Future<void> _dial(BuildContext context) async {
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      await launchUrl(phoneTelUri(phone!), mode: LaunchMode.externalApplication);
    } catch (_) {
      m.showSnackBar(const SnackBar(content: Text('Не удалось открыть набор')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final bool isPhone = phone != null;
    // Активна (accent-цвет значения), если это телефон или copyable.
    final bool active = isPhone || copyable;
    final String display = isPhone ? formatPhone(value) : value;
    return GestureDetector(
      onLongPress: () => _copy(context, isPhone ? phone! : value),
      onTap: isPhone
          ? () => _dial(context)
          : copyable
              ? () => _copy(context, value)
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
              child: Text(display,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: active ? c.accent : c.ink)),
            ),
            if (isPhone) ...<Widget>[const SizedBox(width: 6), Icon(Icons.call, size: 15, color: c.inkMutedXl)],
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
        builder: (_) => IncomeForm(clientId: clientId),
      ),
      icon: const Icon(Icons.add, size: 16),
      label: const Text('Добавить'),
    );
  }
}

class _PackagesBlock extends ConsumerStatefulWidget {
  const _PackagesBlock({required this.clientId});
  final String clientId;
  @override
  ConsumerState<_PackagesBlock> createState() => _PackagesBlockState();
}

class _PackagesBlockState extends ConsumerState<_PackagesBlock> {
  final Set<String> _expanded = <String>{};

  String get clientId => widget.clientId;

  Future<void> _editPackageIncome(TPackage p) async {
    final Income? inc = (ref.read(trainerIncomesProvider).valueOrNull ?? const <Income>[])
        .where((Income e) => e.isPackage && e.id == 'pkg:${p.id}')
        .firstOrNull;
    if (inc == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Платёж пакета не найден')));
      return;
    }
    if (await showIncomeEditSheet(context, inc)) {
      ref.invalidate(trainerIncomesProvider);
      ref.invalidate(clientPackagesProvider(clientId));
    }
  }

  Future<void> _deletePackage(TPackage p) async {
    if (!await confirmDelete(context, title: 'Удалить пакет?')) return;
    await ref.read(trainerClientCardApiProvider).deletePackage(clientId, p.id);
    ref.invalidate(clientPackagesProvider(clientId));
    ref.invalidate(trainerIncomesProvider);
  }

  Future<void> _toggleInstallment(TPackage p, TInstallment it) async {
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    try {
      if (it.isPaid) {
        await ref.read(trainerClientCardApiProvider).unpayInstallment(clientId, p.id, it.id);
      } else {
        await ref.read(trainerClientCardApiProvider).payInstallment(clientId, p.id, it.id);
      }
      ref.invalidate(clientPackagesProvider(clientId));
      ref.invalidate(trainerIncomesProvider);
    } catch (_) {
      m.showSnackBar(SnackBar(content: Text(it.isPaid ? 'Не удалось снять отметку' : 'Не удалось отметить платёж')));
    }
  }

  @override
  Widget build(BuildContext context) {
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
            ...active.map((TPackage p) {
              final bool expanded = _expanded.contains(p.id);
              return Slidable(
                  key: ValueKey<String>('pkg-${p.id}'),
                  endActionPane: ActionPane(
                    motion: const DrawerMotion(),
                    extentRatio: 0.42,
                    children: <Widget>[
                      SlidableAction(
                        onPressed: (_) => _editPackageIncome(p),
                        backgroundColor: c.cardElevated,
                        foregroundColor: c.ink,
                        icon: Icons.edit_outlined,
                        label: 'Изм.',
                      ),
                      SlidableAction(
                        onPressed: (_) => _deletePackage(p),
                        backgroundColor: c.danger,
                        foregroundColor: Colors.white,
                        icon: Icons.delete_outline,
                        label: 'Удал.',
                      ),
                    ],
                  ),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        GestureDetector(
                          onTap: () => setState(() {
                            if (expanded) {
                              _expanded.remove(p.id);
                            } else {
                              _expanded.add(p.id);
                            }
                          }),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            child: Row(
                              children: <Widget>[
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: <Widget>[
                                      Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: <Widget>[
                                          Text(p.workoutType?.isNotEmpty == true ? p.workoutType! : 'Пакет',
                                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink)),
                                          if (p.isInstallment) ...<Widget>[
                                            const SizedBox(width: 8),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                              decoration: BoxDecoration(color: c.chip, borderRadius: BorderRadius.circular(8)),
                                              child: Text('Рассрочка',
                                                  style: AppFonts.mono(size: 10, color: c.inkMuted, weight: FontWeight.w700)),
                                            ),
                                          ],
                                        ],
                                      ),
                                      if (p.isInstallment && p.nextDue != null) ...<Widget>[
                                        const SizedBox(height: 3),
                                        Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: <Widget>[
                                            Icon(Icons.local_fire_department, size: 14, color: c.coral),
                                            const SizedBox(width: 3),
                                            Text('платёж ${_dateIso(p.nextDue!.dueDate)}',
                                                style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                                          ],
                                        ),
                                      ] else if (!p.isInstallment && p.endsAt != null) ...<Widget>[
                                        const SizedBox(height: 3),
                                        Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: <Widget>[
                                            Icon(Icons.local_fire_department, size: 14, color: c.coral),
                                            const SizedBox(width: 3),
                                            Text('сгорает ${_date(DateTime.tryParse(p.endsAt!)?.toLocal())}',
                                                style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
                                          ],
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: <Widget>[
                                    if (p.isInstallment) ...<Widget>[
                                      Text('${p.paidCount}/${p.installments.length}',
                                          style: AppFonts.display(size: 22, color: c.accent)),
                                      Text('оплачено', style: AppFonts.mono(size: 9, color: c.inkMutedXl, weight: FontWeight.w700)),
                                    ] else ...<Widget>[
                                      Text('${p.lessonsPaid}',
                                          style: AppFonts.display(size: 22, color: c.accent)),
                                      Text('занятий', style: AppFonts.mono(size: 9, color: c.inkMutedXl, weight: FontWeight.w700)),
                                    ],
                                  ],
                                ),
                                const SizedBox(width: 8),
                                Icon(expanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                                    size: 18, color: c.inkMutedXl),
                              ],
                            ),
                          ),
                        ),
                        if (expanded) ...<Widget>[
                          Divider(color: c.line, height: 1),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
                            child: p.isInstallment
                                ? _installmentDetails(context, c, p)
                                : Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: <Widget>[
                                      _pkgRow(c, 'Занятий в пакете', '${p.lessonsPaid}'),
                                      if (p.endsAt != null)
                                        _pkgRow(c, 'Сгорает', _date(DateTime.tryParse(p.endsAt!)?.toLocal()),
                                            icon: Icons.local_fire_department, iconColor: c.coral),
                                      _pkgRow(c, 'Статус', p.isActive ? 'Активен' : 'Завершён'),
                                    ],
                                  ),
                          ),
                        ],
                      ],
                    ),
                  ),
                );
            }),
            if (payments.isNotEmpty) ...<Widget>[
              const SizedBox(height: 4),
              Text('ИСТОРИЯ ПЛАТЕЖЕЙ',
                  style: AppFonts.mono(size: 10, color: c.inkMutedXl, weight: FontWeight.w700)),
              const SizedBox(height: 6),
              // Свайп влево на платеже → [Изм.] (та же форма, что в Бухгалтерии)
              // и [Удал.] (пакет-доход сносит пакет, обычный — запись дохода).
              ...payments.take(8).map((Income e) => Slidable(
                    key: ValueKey<String>('pay-${e.id}'),
                    endActionPane: ActionPane(
                      motion: const DrawerMotion(),
                      extentRatio: 0.42,
                      children: <Widget>[
                        SlidableAction(
                          onPressed: (_) async {
                            if (await showIncomeEditSheet(context, e)) {
                              ref.invalidate(trainerIncomesProvider);
                              ref.invalidate(clientPackagesProvider(clientId));
                            }
                          },
                          backgroundColor: c.cardElevated,
                          foregroundColor: c.ink,
                          icon: Icons.edit_outlined,
                          label: 'Изм.',
                        ),
                        SlidableAction(
                          onPressed: (_) async {
                            if (!await confirmDelete(context, title: 'Удалить операцию?')) return;
                            if (e.isPackage && e.clientId != null) {
                              await ref
                                  .read(trainerClientCardApiProvider)
                                  .deletePackage(e.clientId!, e.id.replaceFirst('pkg:', ''));
                            } else {
                              await ref.read(trainerAccountingApiProvider).deleteIncome(e.id);
                            }
                            ref.invalidate(trainerIncomesProvider);
                            ref.invalidate(clientPackagesProvider(clientId));
                          },
                          backgroundColor: c.danger,
                          foregroundColor: Colors.white,
                          icon: Icons.delete_outline,
                          label: 'Удал.',
                        ),
                      ],
                    ),
                    // Высота строки — чтобы при свайпе кнопки [Изм.]/[Удал.]
                    // (иконка + подпись) помещались по высоте и не обрезались.
                    child: Container(
                      height: 54,
                      alignment: Alignment.centerLeft,
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
                    ),
                  )),
            ],
          ],
        );
      },
    );
  }

  /// Детали раскрытого пакета-рассрочки: сводка + список платежей с чекбоксами.
  Widget _installmentDetails(BuildContext context, AppColors c, TPackage p) {
    final List<TInstallment> items = <TInstallment>[...p.installments]
      ..sort((TInstallment a, TInstallment b) => a.dueDate.compareTo(b.dueDate));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          children: <Widget>[
            Text('Внесено ', style: TextStyle(fontSize: 14, color: c.inkMuted)),
            Text(_moneyRu(p.paidSum),
                style: AppFonts.mono(size: 14, color: c.success, weight: FontWeight.w700)),
            const SizedBox(width: 6),
            Text('(осталось ${_moneyRu(p.dueSum)})',
                style: AppFonts.mono(size: 13, color: c.inkMuted, weight: FontWeight.w500)),
          ],
        ),
        const SizedBox(height: 4),
        Text('Оплачено ${p.paidCount} из ${p.installments.length}',
            style: TextStyle(fontSize: 13, color: c.inkMuted)),
        const SizedBox(height: 10),
        for (int i = 0; i < items.length; i++) ...<Widget>[
          if (i > 0) const SizedBox(height: 6),
          _installmentCheckRow(context, c, p, items[i]),
        ],
      ],
    );
  }

  Widget _installmentCheckRow(BuildContext context, AppColors c, TPackage p, TInstallment it) {
    return InkWell(
      onTap: () => _toggleInstallment(p, it),
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          children: <Widget>[
            Icon(it.isPaid ? Icons.check_box : Icons.check_box_outline_blank,
                size: 20, color: it.isPaid ? c.success : c.inkMutedXl),
            const SizedBox(width: 8),
            Text(_dateIso(it.dueDate),
                style: AppFonts.mono(
                    size: 13, color: it.isPaid ? c.inkMuted : c.ink, weight: FontWeight.w600)),
            if (it.isPaid && it.paidAt != null) ...<Widget>[
              const SizedBox(width: 6),
              Text('(опл. ${_dateIso(it.paidAt!)})',
                  style: AppFonts.mono(size: 11, color: c.inkMutedXl, weight: FontWeight.w500)),
            ],
            const Spacer(),
            Text(_moneyRu(it.amount),
                style: AppFonts.mono(
                    size: 13, color: it.isPaid ? c.inkMuted : c.ink, weight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

Widget _pkgRow(AppColors c, String label, String value,
        {Color? valueColor, IconData? icon, Color? iconColor}) =>
    Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: <Widget>[
          if (icon != null) ...<Widget>[
            Icon(icon, size: 16, color: iconColor ?? c.inkMuted),
            const SizedBox(width: 8),
          ],
          Expanded(child: Text(label, style: TextStyle(fontSize: 14, color: c.inkMuted))),
          Text(value, style: AppFonts.mono(size: 14, color: valueColor ?? c.ink, weight: FontWeight.w700)),
        ],
      ),
    );

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
        // Показываем ВСЕ замеры (newest-first), каждый — отдельной карточкой.
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            for (int i = 0; i < all.length; i++) ...<Widget>[
              if (i > 0) const SizedBox(height: 12),
              _measureCard(c, all[i]),
            ],
          ],
        );
      },
    );
  }

  Widget _measureCard(AppColors c, TMeasurement m) {
    final List<String> chips = <String>[
      if (m.weightKg != null) '${m.weightKg} кг',
      if (m.skeletalMuscleKg != null) 'Мышцы ${m.skeletalMuscleKg} кг',
      if (m.bodyFatPct != null) '${m.bodyFatPct}% жира',
      ...m.metrics.entries.map((MapEntry<String, num> e) => '${e.key} ${e.value}'),
    ];
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Text(_date(m.date), style: AppFonts.mono(size: 12, color: c.inkMuted, weight: FontWeight.w500)),
              const SizedBox(width: 8),
              Text('· ${m.createdByClient ? 'Клиент' : 'Тренер'}',
                  style: TextStyle(fontSize: 12, color: c.inkMutedXl)),
            ],
          ),
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
        ],
      ),
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

/// Кнопка «Добавить замер»: открывает шторку с формой замера (зеркало клиентской
/// `_MeasureForm`). После сохранения инвалидирует замеры клиента.
class _AddMeasureButton extends ConsumerWidget {
  const _AddMeasureButton({required this.clientId});
  final String clientId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return TextButton.icon(
      onPressed: () async {
        final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
        final bool? saved = await showModalBottomSheet<bool>(
          context: context,
          backgroundColor: context.colors.bg,
          isScrollControlled: true,
          showDragHandle: true,
          builder: (_) => _MeasureForm(clientId: clientId),
        );
        if (saved == true) {
          ref.invalidate(clientMeasurementsProvider(clientId));
          m.showSnackBar(const SnackBar(content: Text('Замер добавлен')));
        }
      },
      icon: const Icon(Icons.add, size: 16),
      label: const Text('Добавить замер'),
    );
  }
}

// ─── Замеры: описание метрик + форма (зеркало клиентских kMetrics/_MeasureForm) ──

/// Описание метрики замера: ключ поля API, подпись, единица (зеркало клиентского
/// MetricDef — определён локально, т.к. клиентский код не импортируем).
class _MetricDef {
  const _MetricDef(this.key, this.label, this.unit);
  final String key;
  final String label;
  final String unit;
}

/// «Состав тела» (3 колонки) — вес, скелетные мышцы, % жира.
const List<_MetricDef> _kBodyComposition = <_MetricDef>[
  _MetricDef('weightKg', 'Вес', 'кг'),
  _MetricDef('skeletalMuscleKg', 'Скел. мышцы', 'кг'),
  _MetricDef('bodyFatPct', '% жира', '%'),
];

/// «Обхваты» (3 колонки у клиента).
const List<_MetricDef> _kGirths = <_MetricDef>[
  _MetricDef('bicepsCm', 'Бицепс', 'см'),
  _MetricDef('chestCm', 'Грудь', 'см'),
  _MetricDef('underbustCm', 'Под грудью', 'см'),
  _MetricDef('waistCm', 'Талия', 'см'),
  _MetricDef('bellyCm', 'Живот', 'см'),
  _MetricDef('glutesCm', 'Ягодицы', 'см'),
  _MetricDef('thighCm', 'Бедро', 'см'),
  _MetricDef('calfCm', 'Голень', 'см'),
];

/// Все метрики замера (порядок как в клиентском kMetrics).
const List<_MetricDef> _kMetrics = <_MetricDef>[..._kBodyComposition, ..._kGirths];

/// "YYYY-MM-DD" из даты (для тела запроса замера/фото).
String _isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Короткая дата «5 янв» (для чипа даты в форме замера).
String _shortDate(DateTime d) => '${d.day} ${_ruMonths[d.month - 1]}';

/// Полная дата «5 янв 2026» (для строки даты в карточке загрузки фото). Отдельная
/// функция, а не `_date`, т.к. в `_PhotosTabState` поле `_date` затеняет её.
String _fullDate(DateTime d) => '${d.day} ${_ruMonths[d.month - 1]} ${d.year}';

/// Форма добавления замера тела клиента тренером. Зеркало клиентской
/// `_MeasureForm` (только создание): те же поля/раскладка/тексты, отличие —
/// вызов тренерского API (`addMeasurement`) в общий скоуп. Возвращает `true`
/// через Navigator.pop при успешном сохранении.
class _MeasureForm extends ConsumerStatefulWidget {
  const _MeasureForm({required this.clientId});
  final String clientId;
  @override
  ConsumerState<_MeasureForm> createState() => _MeasureFormState();
}

class _MeasureFormState extends ConsumerState<_MeasureForm> {
  late final Map<String, TextEditingController> _ctrls = <String, TextEditingController>{
    for (final _MetricDef m in _kMetrics) m.key: TextEditingController(),
  };
  final TextEditingController _note = TextEditingController();
  DateTime _date = DateTime.now();
  bool _busy = false;

  @override
  void dispose() {
    for (final TextEditingController c in _ctrls.values) {
      c.dispose();
    }
    _note.dispose();
    super.dispose();
  }

  num? _n(String s) => num.tryParse(s.trim().replaceAll(',', '.'));

  Future<void> _save() async {
    if (_busy) return;
    // Только заполненные метрики (пустые не шлём); дату шлём всегда.
    final Map<String, dynamic> body = <String, dynamic>{'date': _isoDate(_date)};
    for (final _MetricDef m in _kMetrics) {
      final String raw = _ctrls[m.key]!.text.trim();
      if (raw.isNotEmpty) {
        final num? v = _n(raw);
        if (v != null) body[m.key] = v;
      }
    }
    final String note = _note.text.trim();
    if (note.isNotEmpty) body['note'] = note;
    if (body.length == 1) return; // только дата — нечего сохранять
    setState(() => _busy = true);
    final NavigatorState nav = Navigator.of(context);
    final ScaffoldMessengerState msg = ScaffoldMessenger.of(context);
    try {
      await ref.read(trainerClientCardApiProvider).addMeasurement(widget.clientId, body);
      if (!mounted) return;
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      msg.showSnackBar(const SnackBar(content: Text('Не удалось сохранить замер')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 4, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Text('Новый замер',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: c.ink)),
              const Spacer(),
              _dateChip(c),
            ],
          ),
          const SizedBox(height: 14),
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  _MeasureSectionLabel('Состав тела'),
                  _fieldsGrid(_kBodyComposition),
                  const SizedBox(height: 14),
                  _MeasureSectionLabel('Обхваты'),
                  _fieldsGrid(_kGirths),
                  const SizedBox(height: 14),
                  _MeasureSectionLabel('Заметка'),
                  TextField(
                    controller: _note,
                    maxLines: 3,
                    decoration: InputDecoration(
                      hintText: 'Например: утро натощак',
                      filled: true,
                      fillColor: c.card,
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _busy ? null : _save,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              child: Text(_busy ? 'Сохранение…' : 'Сохранить'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _dateChip(AppColors c) => GestureDetector(
        onTap: () async {
          final DateTime now = DateTime.now();
          final DateTime? d = await showDatePicker(
              context: context, initialDate: _date, firstDate: DateTime(now.year - 5), lastDate: now);
          if (d != null) setState(() => _date = d);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(10)),
          child: Row(mainAxisSize: MainAxisSize.min, children: <Widget>[
            Icon(Icons.event, size: 15, color: c.inkMuted),
            const SizedBox(width: 6),
            Text(_shortDate(_date), style: TextStyle(fontSize: 13, color: c.ink)),
          ]),
        ),
      );

  Widget _fieldsGrid(List<_MetricDef> fields) => GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 1.5,
        children: <Widget>[
          for (final _MetricDef m in fields)
            _MeasureNumField(label: '${m.label}, ${m.unit}', ctrl: _ctrls[m.key]!),
        ],
      );
}

/// Числовое поле метрики (зеркало клиентского _NumField).
class _MeasureNumField extends StatelessWidget {
  const _MeasureNumField({required this.label, required this.ctrl});
  final String label;
  final TextEditingController ctrl;
  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        Text(label.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppFonts.mono(size: 9, color: c.inkMutedXl, weight: FontWeight.w600)),
        const SizedBox(height: 4),
        SizedBox(
          height: 38,
          child: SelectAllTextField(
            controller: ctrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
            textAlign: TextAlign.center,
            style: AppFonts.mono(size: 15, color: c.ink, weight: FontWeight.w600),
            decoration: InputDecoration(
              isDense: true,
              filled: true,
              fillColor: c.chip,
              hintText: '—',
              contentPadding: const EdgeInsets.symmetric(vertical: 6),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.line)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.line)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.accent)),
            ),
          ),
        ),
      ],
    );
  }
}

/// Мелкая подпись-секция в форме замера (зеркало клиентского _SectionLabel).
class _MeasureSectionLabel extends StatelessWidget {
  const _MeasureSectionLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 8),
        child: Text(text.toUpperCase(),
            style: AppFonts.mono(size: 11, color: context.colors.inkMutedXl, weight: FontWeight.w600, letterSpacing: 0.6)),
      );
}

// Сводные плитки заменены пер-упражнение обзором (ExerciseProgressTab) —
// зеркало веб ExercisesTab. ClientStatsData/StatRecord остались для бейджа хаба.

