import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:video_player/video_player.dart';

import '../theme/app_theme.dart';

/// Собрать абсолютный URL медиа каталога из base (например https://app.fitbond.ru)
/// и относительного пути (/api/catalog-media/...). Возвращает null, если пути нет.
String? catalogMediaUrl(String base, String? raw) {
  if (raw == null || raw.isEmpty) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  final String b = base.endsWith('/') ? base.substring(0, base.length - 1) : base;
  final String r = raw.startsWith('/') ? raw : '/$raw';
  return '$b$r';
}

/// Превью упражнения с офлайн-кэшем (cached_network_image). Если URL нет или
/// картинка не грузится — иконка-гантель.
class CatalogThumb extends StatelessWidget {
  const CatalogThumb({super.key, required this.url, this.size = 48, this.radius = 10});
  final String? url;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final Color bg = Theme.of(context).colorScheme.surfaceContainerHighest;
    final Widget placeholder = Container(
      width: size,
      height: size,
      color: bg,
      alignment: Alignment.center,
      child: Icon(Icons.fitness_center, size: size * 0.42, color: Theme.of(context).colorScheme.onSurfaceVariant),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: (url == null || url!.isEmpty)
          ? placeholder
          : CachedNetworkImage(
              imageUrl: url!,
              width: size,
              height: size,
              fit: BoxFit.cover,
              placeholder: (_, _) => placeholder,
              errorWidget: (_, _, _) => placeholder,
            ),
    );
  }
}

/// Демонстрация упражнения: зацикленное видео (из дискового кэша) или картинка.
/// Видео скачивается один раз и далее доступно офлайн.
///
/// Два режима работы:
/// - `showToggle = false` (по умолчанию): авто-воспроизведение видео, если оно
///   есть; иначе картинка. Так ведут себя карточки активной тренировки.
/// - `showToggle = true`: как в вебе (ExerciseDetails) — заголовок «Демонстрация»
///   с переключателем 📷/🎥. По умолчанию показывается ФОТО; видео грузится и
///   проигрывается только после переключения. Переключатель виден, лишь когда
///   есть и фото, и видео.
class CatalogMediaView extends StatefulWidget {
  const CatalogMediaView({
    super.key,
    this.imageUrl,
    this.videoUrl,
    this.height = 200,
    this.showToggle = false,
    this.title = 'ДЕМОНСТРАЦИЯ',
  });
  final String? imageUrl;
  final String? videoUrl;
  final double height;
  final bool showToggle;
  // Подпись над медиа в режиме showToggle. Пусто → подписи нет (только переключатель).
  final String title;

  @override
  State<CatalogMediaView> createState() => _CatalogMediaViewState();
}

class _CatalogMediaViewState extends State<CatalogMediaView> {
  VideoPlayerController? _controller;
  bool _ready = false;
  // Текущий режим в showToggle: false = фото, true = видео.
  bool _videoMode = false;

  bool get _hasImage => widget.imageUrl != null && widget.imageUrl!.isNotEmpty;
  bool get _hasVideo => widget.videoUrl != null && widget.videoUrl!.isNotEmpty;

  @override
  void initState() {
    super.initState();
    if (widget.showToggle) {
      // Дефолт = фото, если оно есть; иначе сразу видео (зеркало веба).
      _videoMode = !_hasImage && _hasVideo;
      if (_videoMode && _hasVideo) _initVideo(widget.videoUrl!);
    } else if (_hasVideo) {
      // Старое поведение: авто-видео при наличии.
      _initVideo(widget.videoUrl!);
    }
  }

  Future<void> _initVideo(String url) async {
    try {
      final File file = await DefaultCacheManager().getSingleFile(url);
      if (!mounted) return;
      final VideoPlayerController c = VideoPlayerController.file(file);
      await c.initialize();
      await c.setLooping(true);
      await c.setVolume(0);
      await c.play();
      if (!mounted) {
        await c.dispose();
        return;
      }
      setState(() {
        _controller = c;
        _ready = true;
      });
    } catch (_) {
      // видео не доступно — останется картинка/заглушка
    }
  }

  void _selectMode(bool video) {
    if (_videoMode == video) return;
    setState(() => _videoMode = video);
    // Видео монтируется лениво — только при первом переключении на него.
    if (video && _controller == null && _hasVideo) _initVideo(widget.videoUrl!);
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.showToggle) {
      final AppColors c = context.colors;
      final bool showSwitch = _hasImage && _hasVideo;
      final bool showHeader = widget.title.isNotEmpty || showSwitch;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (showHeader) ...<Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: widget.title.isEmpty
                      ? const SizedBox.shrink()
                      : Text(
                          widget.title,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.5,
                            color: c.inkMutedXl,
                          ),
                        ),
                ),
                if (showSwitch) _MediaToggle(videoMode: _videoMode, onChange: _selectMode),
              ],
            ),
            const SizedBox(height: 8),
          ],
          _frame(context, video: _videoMode),
        ],
      );
    }
    // Старое поведение (без переключателя): авто-видео или картинка.
    return _frame(context, video: true);
  }

  /// Кадр демонстрации. [video] = true — показать видео (если готово), иначе фото.
  Widget _frame(BuildContext context, {required bool video}) {
    final double h = widget.height;
    final Color bg = Theme.of(context).colorScheme.surfaceContainerHighest;
    Widget child;
    if (video && _ready && _controller != null) {
      // contain — показываем медиа целиком (без авто-увеличения по ширине/обрезки).
      child = FittedBox(
        fit: BoxFit.contain,
        child: SizedBox(
          width: _controller!.value.size.width,
          height: _controller!.value.size.height,
          child: VideoPlayer(_controller!),
        ),
      );
    } else if (!video && _hasImage) {
      child = CachedNetworkImage(
        imageUrl: widget.imageUrl!,
        fit: BoxFit.contain,
        placeholder: (_, _) => Container(color: bg),
        errorWidget: (_, _, _) => Container(color: bg),
      );
    } else if (_hasImage) {
      // video=true, но видео ещё не готово/недоступно — показываем фото.
      child = CachedNetworkImage(
        imageUrl: widget.imageUrl!,
        fit: BoxFit.contain,
        placeholder: (_, _) => Container(color: bg),
        errorWidget: (_, _, _) => Container(color: bg),
      );
    } else {
      child = Container(
        color: bg,
        alignment: Alignment.center,
        child: Icon(Icons.fitness_center, size: 40, color: Theme.of(context).colorScheme.onSurfaceVariant),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(width: double.infinity, height: h, child: child),
    );
  }
}

/// Переключатель 📷 фото / 🎥 видео (зеркало веб MediaToggle), пилюля с двумя
/// круглыми кнопками. Активная — на акцентном фоне.
class _MediaToggle extends StatelessWidget {
  const _MediaToggle({required this.videoMode, required this.onChange});
  final bool videoMode;
  final ValueChanged<bool> onChange;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: c.chip,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          _btn(context, icon: Icons.photo_outlined, active: !videoMode, onTap: () => onChange(false), tooltip: 'Фото'),
          _btn(context, icon: Icons.videocam_outlined, active: videoMode, onTap: () => onChange(true), tooltip: 'Видео'),
        ],
      ),
    );
  }

  Widget _btn(BuildContext context, {required IconData icon, required bool active, required VoidCallback onTap, required String tooltip}) {
    final AppColors c = context.colors;
    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 30,
          height: 28,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? c.accent : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Icon(icon, size: 16, color: active ? c.accentOn : c.inkMuted),
        ),
      ),
    );
  }
}

/// Тёплый прогрев кэша превью (фоновая загрузка миниатюр для офлайна).
Future<void> prefetchThumbs(Iterable<String> urls) async {
  final BaseCacheManager cm = DefaultCacheManager();
  for (final String u in urls) {
    if (u.isEmpty) continue;
    try {
      await cm.downloadFile(u);
    } catch (_) {
      // молча пропускаем недоступные
    }
  }
}
