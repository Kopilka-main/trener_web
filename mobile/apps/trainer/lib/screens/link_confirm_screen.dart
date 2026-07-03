import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/trainer_clients.dart';

/// Превью аккаунта по коду из QR (кэшируется по коду, чтобы «Повторить»
/// перезагружало через invalidate).
final FutureProviderFamily<LinkPreview, String> _linkPreviewProvider =
    FutureProvider.family<LinkPreview, String>(
  (ref, String code) => ref.read(trainerClientsApiProvider).linkPreview(code),
);

/// Экран привязки клиента по QR (deep-link `/link/<accountId>`): тренер сканирует
/// QR клиента родной камерой → сюда. Показываем, кто это, и предлагаем создать
/// клиента (привязать аккаунт). Кнопки внизу — one-handed.
class LinkConfirmScreen extends ConsumerStatefulWidget {
  const LinkConfirmScreen({super.key, required this.code});

  final String code;

  @override
  ConsumerState<LinkConfirmScreen> createState() => _LinkConfirmScreenState();
}

class _LinkConfirmScreenState extends ConsumerState<LinkConfirmScreen> {
  bool _busy = false; // идёт claim (создание клиента)

  Future<void> _createAndOpen() async {
    setState(() => _busy = true);
    try {
      final ({Client client, bool alreadyExisted}) res =
          await ref.read(trainerClientsApiProvider).claim(widget.code);
      if (!mounted) return;
      ref.invalidate(trainerClientsProvider);
      _openClient(res.client, added: !res.alreadyExisted);
    } on ClientAccountNotFound {
      if (!mounted) return;
      setState(() => _busy = false);
      _snack('Аккаунт не найден');
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _snack(describeApiError(e, fallback: 'Не удалось добавить клиента.'));
    }
  }

  /// Открыть карточку уже привязанного клиента: подтягиваем его через claim
  /// (вернёт alreadyExisted=true с актуальным Client).
  Future<void> _openExisting() async {
    setState(() => _busy = true);
    try {
      final ({Client client, bool alreadyExisted}) res =
          await ref.read(trainerClientsApiProvider).claim(widget.code);
      if (!mounted) return;
      _openClient(res.client, added: false);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _snack(describeApiError(e, fallback: 'Не удалось открыть клиента.'));
    }
  }

  void _openClient(Client client, {required bool added}) {
    context.go('/home');
    context.push('/client/${client.id}', extra: client);
    if (added) _snack('Клиент добавлен');
  }

  void _snack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<LinkPreview> preview = ref.watch(_linkPreviewProvider(widget.code));
    return Scaffold(
      appBar: AppBar(title: const Text('Привязка клиента')),
      body: SafeArea(
        child: preview.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (Object e, _) => _ErrorState(
            message: describeApiError(e, fallback: 'Не удалось загрузить данные аккаунта.'),
            onRetry: () => ref.invalidate(_linkPreviewProvider(widget.code)),
          ),
          data: (LinkPreview p) => _body(context, p),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, LinkPreview p) {
    if (!p.exists) return _NotFoundState(onClose: () => context.go('/home'));
    if (p.linkedClientId != null) {
      return _AlreadyLinkedState(
        name: (p.linkedClientName ?? '').trim().isNotEmpty
            ? p.linkedClientName!.trim()
            : p.fullName,
        busy: _busy,
        onOpen: _openExisting,
        onClose: () => context.go('/home'),
      );
    }
    return _CreateState(
      code: widget.code,
      preview: p,
      busy: _busy,
      onYes: _createAndOpen,
      onNo: () => context.go('/home'),
    );
  }
}

/// Ошибка сети: сообщение (нейтральное) + «Повторить».
class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Text(message, textAlign: TextAlign.center, style: TextStyle(fontSize: 15, color: c.inkMuted)),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: onRetry,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            child: const Text('Повторить'),
          ),
        ],
      ),
    );
  }
}

/// Аккаунт по коду не найден.
class _NotFoundState extends StatelessWidget {
  const _NotFoundState({required this.onClose});
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Column(
      children: <Widget>[
        Expanded(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Icon(Icons.person_off_outlined, size: 56, color: c.inkMutedXl),
                  const SizedBox(height: 16),
                  Text('Аккаунт не найден',
                      textAlign: TextAlign.center, style: AppFonts.display(size: 24, color: c.ink)),
                  const SizedBox(height: 8),
                  Text('Проверьте QR-код клиента и попробуйте ещё раз.',
                      textAlign: TextAlign.center, style: TextStyle(fontSize: 15, color: c.inkMuted)),
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
          child: FilledButton(
            onPressed: onClose,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            child: const Text('Закрыть'),
          ),
        ),
      ],
    );
  }
}

/// Аккаунт уже привязан к клиенту тренера.
class _AlreadyLinkedState extends StatelessWidget {
  const _AlreadyLinkedState({
    required this.name,
    required this.busy,
    required this.onOpen,
    required this.onClose,
  });
  final String name;
  final bool busy;
  final VoidCallback onOpen;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Column(
      children: <Widget>[
        Expanded(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Icon(Icons.link, size: 56, color: c.accent),
                  const SizedBox(height: 16),
                  Text('Уже ваш клиент',
                      textAlign: TextAlign.center, style: TextStyle(fontSize: 15, color: c.inkMuted)),
                  const SizedBox(height: 8),
                  Text(name.isNotEmpty ? name : 'Клиент',
                      textAlign: TextAlign.center, style: AppFonts.display(size: 28, color: c.ink)),
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
          child: Column(
            children: <Widget>[
              FilledButton(
                onPressed: busy ? null : onOpen,
                style: FilledButton.styleFrom(
                  backgroundColor: c.accent,
                  foregroundColor: c.accentOn,
                  minimumSize: const Size.fromHeight(50),
                ),
                child: busy
                    ? const SizedBox(
                        width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Открыть'),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: busy ? null : onClose,
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                child: const Text('Закрыть'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Можно создать клиента: аватар/инициалы, ФИО, «Создать клиента?» и кнопки Да/Нет.
class _CreateState extends ConsumerWidget {
  const _CreateState({
    required this.code,
    required this.preview,
    required this.busy,
    required this.onYes,
    required this.onNo,
  });
  final String code;
  final LinkPreview preview;
  final bool busy;
  final VoidCallback onYes;
  final VoidCallback onNo;

  String get _initials {
    final List<String> parts = preview.fullName
        .split(RegExp(r'\s+'))
        .where((String s) => s.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    return parts.take(2).map((String w) => w[0]).join().toUpperCase();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppColors c = context.colors;
    final String base = ref.read(baseUrlProvider).replaceAll(RegExp(r'/$'), '');
    // Аватар аккаунта грузим авторизованно (тот же Bearer-токен тренера), как
    // и приватные файлы клиента — через AuthedAvatar с httpHeaders.
    final String? avatarUrl = preview.hasAvatar
        ? '$base/api/clients/account-avatar?accountId=${Uri.encodeComponent(code)}'
        : null;
    final String name = preview.fullName.isNotEmpty ? preview.fullName : 'Клиент';

    return Column(
      children: <Widget>[
        Expanded(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  AuthedAvatar(
                    url: avatarUrl,
                    token: ref.watch(sessionProvider).token,
                    initials: _initials,
                    radius: 56,
                  ),
                  const SizedBox(height: 24),
                  Text(name,
                      textAlign: TextAlign.center, style: AppFonts.display(size: 30, color: c.ink)),
                  const SizedBox(height: 10),
                  Text('Создать клиента?',
                      textAlign: TextAlign.center, style: TextStyle(fontSize: 16, color: c.inkMuted)),
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
          child: Column(
            children: <Widget>[
              FilledButton(
                onPressed: busy ? null : onYes,
                style: FilledButton.styleFrom(
                  backgroundColor: c.accent,
                  foregroundColor: c.accentOn,
                  minimumSize: const Size.fromHeight(50),
                ),
                child: busy
                    ? const SizedBox(
                        width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Да'),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: busy ? null : onNo,
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                child: const Text('Нет'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
