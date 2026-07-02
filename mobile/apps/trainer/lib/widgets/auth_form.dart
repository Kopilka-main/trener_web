import 'package:core/core.dart';
import 'package:flutter/material.dart';

/// Фирменная шапка экранов авторизации FitFlow: mono-надпись сверху (eyebrow),
/// крупный display-заголовок акцентным цветом и опциональный подзаголовок.
class AuthHeader extends StatelessWidget {
  const AuthHeader({
    super.key,
    required this.eyebrow,
    required this.title,
    this.subtitle,
  });

  final String eyebrow;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(eyebrow,
            style: AppFonts.mono(
                size: 12, color: c.inkMutedXl, weight: FontWeight.w700, letterSpacing: 3)),
        const SizedBox(height: 10),
        Text(title, style: AppFonts.display(size: 40, color: c.accent, letterSpacing: -0.8)),
        if (subtitle != null) ...<Widget>[
          const SizedBox(height: 8),
          Text(subtitle!, style: TextStyle(fontSize: 14, color: c.inkMuted, height: 1.35)),
        ],
      ],
    );
  }
}

/// Поле формы авторизации в стиле веба: лейбл сверху (14, ink-muted), инпут
/// rounded-xl на `chip` с рамкой `line` (или `danger` при ошибке), фокус — `accent`.
/// Под полем при ошибке — текст 12px цвета `danger`.
class AuthField extends StatefulWidget {
  const AuthField({
    super.key,
    required this.controller,
    required this.label,
    this.error,
    this.obscure = false,
    this.keyboardType,
    this.autofillHints,
    this.textInputAction,
    this.onChanged,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final String? error;
  final bool obscure;
  final TextInputType? keyboardType;
  final Iterable<String>? autofillHints;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  State<AuthField> createState() => _AuthFieldState();
}

class _AuthFieldState extends State<AuthField> {
  // Для полей-паролей (obscure): скрыт ли ввод. Кнопка-глазок переключает.
  bool _hidden = true;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final Color borderColor = widget.error != null ? c.danger : c.line;
    OutlineInputBorder border(Color color, double width) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: color, width: width),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(widget.label,
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.inkMuted)),
        const SizedBox(height: 6),
        SelectAllTextField(
          controller: widget.controller,
          obscureText: widget.obscure && _hidden,
          keyboardType: widget.keyboardType,
          autocorrect: false,
          autofillHints: widget.autofillHints,
          textInputAction: widget.textInputAction,
          onChanged: widget.onChanged,
          onSubmitted: widget.onSubmitted,
          style: TextStyle(fontSize: 15, color: c.ink),
          decoration: InputDecoration(
            isDense: true,
            filled: true,
            fillColor: c.chip,
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            enabledBorder: border(borderColor, 1),
            focusedBorder: border(widget.error != null ? c.danger : c.accent, 1.6),
            border: border(borderColor, 1),
            suffixIcon: widget.obscure
                ? IconButton(
                    tooltip: _hidden ? 'Показать пароль' : 'Скрыть пароль',
                    icon: Icon(_hidden ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                        size: 20, color: c.inkMuted),
                    onPressed: () => setState(() => _hidden = !_hidden),
                  )
                : null,
          ),
        ),
        if (widget.error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(widget.error!, style: TextStyle(fontSize: 12, color: c.danger)),
          ),
      ],
    );
  }
}

/// Главная кнопка формы: акцентная заливка, текст `accent-on`, во время отправки —
/// приглушена и показывает [busyLabel].
class AuthPrimaryButton extends StatelessWidget {
  const AuthPrimaryButton({
    super.key,
    required this.label,
    required this.busyLabel,
    required this.busy,
    required this.onPressed,
  });

  final String label;
  final String busyLabel;
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: c.accent,
        foregroundColor: c.accentOn,
        disabledBackgroundColor: c.accent.withValues(alpha: 0.6),
        disabledForegroundColor: c.accentOn.withValues(alpha: 0.9),
        minimumSize: const Size.fromHeight(50),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
      ),
      onPressed: busy ? null : onPressed,
      child: Text(busy ? busyLabel : label),
    );
  }
}

/// Разделитель «или» между основной кнопкой формы и OAuth-кнопками.
class OAuthOrDivider extends StatelessWidget {
  const OAuthOrDivider({super.key});

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Row(
      children: <Widget>[
        Expanded(child: Divider(color: c.line)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text('или', style: TextStyle(fontSize: 13, color: c.inkMuted)),
        ),
        Expanded(child: Divider(color: c.line)),
      ],
    );
  }
}

/// Кнопка OAuth-входа (VK/Яндекс): контурный стиль на `line`, текст `ink`.
/// Совпадает по геометрии с [AuthPrimaryButton] (высота 50, rounded-xl).
class OAuthButton extends StatelessWidget {
  const OAuthButton({super.key, required this.label, required this.onPressed});

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.ink,
        side: BorderSide(color: c.line),
        minimumSize: const Size.fromHeight(50),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
      ),
      onPressed: onPressed,
      child: Text(label),
    );
  }
}
