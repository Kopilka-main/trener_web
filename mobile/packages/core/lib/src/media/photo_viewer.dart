import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// Полноэкранный просмотр приватного фото (Bearer-токен) с зумом и опциональным
/// удалением. Открывается тапом по миниатюре (например, прогресс-фото). Общий
/// компонент для тренерского и клиентского приложений.
class PhotoViewerScreen extends StatefulWidget {
  const PhotoViewerScreen({
    super.key,
    required this.url,
    required this.token,
    this.title,
    this.subtitle,
    this.onDelete,
  });

  final String url;
  final String? token;

  /// Заголовок (например, ракурс «Спереди»).
  final String? title;

  /// Подзаголовок (например, «9 июля 2026 · Клиент»).
  final String? subtitle;

  /// Если задан — показывается кнопка удаления. Колбэк выполняет удаление и
  /// бросает исключение при ошибке. После успеха экран закрывается с `true`.
  final Future<void> Function()? onDelete;

  /// Открыть просмотрщик. Возвращает `true`, если фото удалили.
  static Future<bool?> show(
    BuildContext context, {
    required String url,
    required String? token,
    String? title,
    String? subtitle,
    Future<void> Function()? onDelete,
  }) {
    return Navigator.of(context).push<bool>(MaterialPageRoute<bool>(
      fullscreenDialog: true,
      builder: (_) => PhotoViewerScreen(
        url: url,
        token: token,
        title: title,
        subtitle: subtitle,
        onDelete: onDelete,
      ),
    ));
  }

  @override
  State<PhotoViewerScreen> createState() => _PhotoViewerScreenState();
}

class _PhotoViewerScreenState extends State<PhotoViewerScreen> {
  bool _busy = false;

  Future<void> _confirmDelete() async {
    if (_busy) return;
    final bool ok = await showDialog<bool>(
          context: context,
          builder: (BuildContext ctx) => AlertDialog(
            title: const Text('Удалить фото?'),
            content: const Text('Фотография будет удалена без возможности восстановления.'),
            actions: <Widget>[
              TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Отмена')),
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: Text('Удалить', style: TextStyle(color: Theme.of(ctx).colorScheme.error)),
              ),
            ],
          ),
        ) ??
        false;
    if (!ok || !mounted) return;
    final NavigatorState nav = Navigator.of(context);
    final ScaffoldMessengerState m = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await widget.onDelete!();
      nav.pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      m.showSnackBar(const SnackBar(content: Text('Не удалось удалить фото')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: <Widget>[
            // Картинка с зумом/панорамой.
            Positioned.fill(
              child: InteractiveViewer(
                minScale: 1,
                maxScale: 4,
                child: Center(
                  child: CachedNetworkImage(
                    imageUrl: widget.url,
                    httpHeaders:
                        widget.token != null ? <String, String>{'Authorization': 'Bearer ${widget.token}'} : null,
                    fit: BoxFit.contain,
                    placeholder: (_, _) => const Center(child: CircularProgressIndicator()),
                    errorWidget: (_, _, _) =>
                        const Center(child: Icon(Icons.broken_image_outlined, color: Colors.white54, size: 48)),
                  ),
                ),
              ),
            ),
            // Верхняя панель: закрыть · заголовок · удалить.
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: <Color>[Colors.black.withValues(alpha: 0.55), Colors.transparent],
                  ),
                ),
                child: Row(
                  children: <Widget>[
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white),
                      onPressed: _busy ? null : () => Navigator.of(context).pop(),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          if (widget.title != null)
                            Text(widget.title!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700)),
                          if (widget.subtitle != null)
                            Text(widget.subtitle!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Colors.white70, fontSize: 12)),
                        ],
                      ),
                    ),
                    if (widget.onDelete != null)
                      _busy
                          ? const Padding(
                              padding: EdgeInsets.all(12),
                              child: SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
                            )
                          : IconButton(
                              icon: const Icon(Icons.delete_outline, color: Colors.white),
                              tooltip: 'Удалить',
                              onPressed: _confirmDelete,
                            ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
