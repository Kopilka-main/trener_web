import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:video_player/video_player.dart';

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
class CatalogMediaView extends StatefulWidget {
  const CatalogMediaView({super.key, this.imageUrl, this.videoUrl, this.height = 200});
  final String? imageUrl;
  final String? videoUrl;
  final double height;

  @override
  State<CatalogMediaView> createState() => _CatalogMediaViewState();
}

class _CatalogMediaViewState extends State<CatalogMediaView> {
  VideoPlayerController? _controller;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    if (widget.videoUrl != null && widget.videoUrl!.isNotEmpty) _initVideo(widget.videoUrl!);
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

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final double h = widget.height;
    final Color bg = Theme.of(context).colorScheme.surfaceContainerHighest;
    Widget child;
    if (_ready && _controller != null) {
      child = FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(
          width: _controller!.value.size.width,
          height: _controller!.value.size.height,
          child: VideoPlayer(_controller!),
        ),
      );
    } else if (widget.imageUrl != null && widget.imageUrl!.isNotEmpty) {
      child = CachedNetworkImage(
        imageUrl: widget.imageUrl!,
        fit: BoxFit.cover,
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
