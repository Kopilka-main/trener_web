import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// Круглый аватар из приватного файла (GET /api/files/:id, Bearer-токен).
/// Кэшируется на диск. Если URL/токена нет или ошибка — инициалы на фоне акцента.
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
      backgroundColor: cs.primary.withValues(alpha: 0.18),
      child: initials.trim().isEmpty
          ? Icon(Icons.person, color: cs.primary, size: radius * 0.92)
          : Text(initials,
              style: TextStyle(color: cs.primary, fontSize: radius * 0.72, fontWeight: FontWeight.w800)),
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
