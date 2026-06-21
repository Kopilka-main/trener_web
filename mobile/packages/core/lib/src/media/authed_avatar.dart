import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// Прямоугольная картинка из приватного файла (Bearer-токен) с дисковым кэшем.
/// Для прогресс-фото и других защищённых изображений.
class AuthedImage extends StatelessWidget {
  const AuthedImage({super.key, required this.url, required this.token, this.radius = 12, this.fit = BoxFit.cover});
  final String? url;
  final String? token;
  final double radius;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final Color bg = Theme.of(context).colorScheme.surfaceContainerHighest;
    final Widget ph = Container(color: bg, alignment: Alignment.center, child: Icon(Icons.image_outlined, color: Theme.of(context).colorScheme.onSurfaceVariant));
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: (url == null || url!.isEmpty)
          ? ph
          : CachedNetworkImage(
              imageUrl: url!,
              httpHeaders: token != null ? <String, String>{'Authorization': 'Bearer $token'} : null,
              fit: fit,
              placeholder: (_, _) => ph,
              errorWidget: (_, _, _) => ph,
            ),
    );
  }
}

/// Круглый аватар из приватного файла (GET /api/files/:id, Bearer-токен).
/// Кэшируется на диск. Если URL/токена нет или ошибка — инициалы на нейтральном
/// фоне (не акцентном).
class AuthedAvatar extends StatelessWidget {
  const AuthedAvatar({
    super.key,
    required this.url,
    required this.token,
    required this.initials,
    this.radius = 28,
  });
  final String? url;
  final String? token;
  final String initials;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final ColorScheme cs = Theme.of(context).colorScheme;
    final Widget fallback = CircleAvatar(
      radius: radius,
      backgroundColor: cs.surfaceContainerHighest,
      child: initials.trim().isEmpty
          ? Icon(Icons.person, color: cs.onSurfaceVariant, size: radius * 0.92)
          : Text(initials,
              style: TextStyle(color: cs.onSurfaceVariant, fontSize: radius * 0.72, fontWeight: FontWeight.w800)),
    );
    if (url == null || url!.isEmpty) return fallback;
    return ClipOval(
      child: CachedNetworkImage(
        imageUrl: url!,
        httpHeaders: token != null ? <String, String>{'Authorization': 'Bearer $token'} : null,
        width: radius * 2,
        height: radius * 2,
        fit: BoxFit.cover,
        placeholder: (_, _) => fallback,
        errorWidget: (_, _, _) => fallback,
      ),
    );
  }
}
