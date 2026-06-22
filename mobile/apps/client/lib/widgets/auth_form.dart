import 'package:core/core.dart';
import 'package:flutter/material.dart';

/// Поле формы авторизации в стиле веба: лейбл сверху (14, ink-muted), инпут
/// rounded-xl на `chip` с рамкой `line` (или `danger` при ошибке), фокус — `accent`.
/// Под полем при ошибке — текст 12px цвета `danger`.
class AuthField extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    final Color borderColor = error != null ? c.danger : c.line;
    OutlineInputBorder border(Color color, double width) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: color, width: width),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.inkMuted)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          obscureText: obscure,
          keyboardType: keyboardType,
          autocorrect: false,
          autofillHints: autofillHints,
          textInputAction: textInputAction,
          onChanged: onChanged,
          onSubmitted: onSubmitted,
          style: TextStyle(fontSize: 15, color: c.ink),
          decoration: InputDecoration(
            isDense: true,
            filled: true,
            fillColor: c.chip,
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            enabledBorder: border(borderColor, 1),
            focusedBorder: border(error != null ? c.danger : c.accent, 1.6),
            border: border(borderColor, 1),
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(error!, style: TextStyle(fontSize: 12, color: c.danger)),
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
