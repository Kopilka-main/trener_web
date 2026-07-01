import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/client_auth.dart';
import '../widgets/auth_form.dart';

final RegExp _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

/// Восстановление пароля по email: двухэтапный экран в стиле входа клиента.
/// Этап 1 — запрос 6-значного кода на почту, этап 2 — ввод кода + нового пароля.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _code = TextEditingController();
  final TextEditingController _password = TextEditingController();

  bool _sending = false;
  bool _resetting = false;
  // Этап 2 показываем после успешного запроса кода.
  bool _sent = false;
  // Ошибки валидации показываем только после первой неудачной отправки этапа.
  bool _showSendErrors = false;
  bool _showResetErrors = false;
  String? _serverError;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  String? get _emailError {
    final String v = _email.text.trim();
    if (v.isEmpty) return 'Укажите email';
    if (!_emailRe.hasMatch(v)) return 'Некорректный email';
    return null;
  }

  String? get _codeError {
    final String v = _code.text.trim();
    if (v.length != 6) return 'Код из письма — 6 цифр';
    return null;
  }

  String? get _passwordError =>
      _password.text.length < 8 ? 'Пароль не короче 8 символов' : null;

  Future<void> _send() async {
    if (_emailError != null) {
      setState(() => _showSendErrors = true);
      return;
    }
    setState(() {
      _sending = true;
      _serverError = null;
    });
    try {
      await ref.read(clientApiProvider).forgotPassword(_email.text.trim());
      setState(() => _sent = true);
    } catch (e) {
      setState(() => _serverError =
          describeApiError(e, fallback: 'Не удалось отправить код. Попробуйте позже.'));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _reset() async {
    if (_codeError != null || _passwordError != null) {
      setState(() => _showResetErrors = true);
      return;
    }
    setState(() {
      _resetting = true;
      _serverError = null;
    });
    try {
      await ref.read(clientApiProvider).resetPassword(
            _email.text.trim(),
            _code.text.trim(),
            _password.text,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Пароль изменён. Войдите с новым паролем.')),
      );
      context.go('/login');
    } catch (e) {
      setState(() => _serverError = describeApiError(e, fallback: 'Неверный или просроченный код'));
    } finally {
      if (mounted) setState(() => _resetting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
              children: <Widget>[
                Text('Восстановление',
                    style: AppFonts.display(size: 34, color: c.accent, letterSpacing: -0.7)),
                const SizedBox(height: 24),
                // Этап 1: email + запрос кода.
                AuthField(
                  controller: _email,
                  label: 'Email',
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const <String>[AutofillHints.email],
                  textInputAction: TextInputAction.done,
                  error: _showSendErrors ? _emailError : null,
                  onChanged: (_) {
                    if (_showSendErrors) setState(() {});
                  },
                  onSubmitted: (_) => _send(),
                ),
                const SizedBox(height: 20),
                AuthPrimaryButton(
                  label: _sent ? 'Отправить код повторно' : 'Отправить код',
                  busyLabel: 'Отправляем…',
                  busy: _sending,
                  onPressed: _send,
                ),
                if (_sent) ...<Widget>[
                  const SizedBox(height: 24),
                  // Нейтральная подсказка (не красным): ink-muted токен.
                  Text(
                    'Если такой email зарегистрирован, мы отправили на него '
                    '6-значный код. Он действует 15 минут — введите его ниже '
                    'вместе с новым паролем.',
                    style: TextStyle(fontSize: 14, height: 1.4, color: c.inkMuted),
                  ),
                  const SizedBox(height: 20),
                  // Этап 2: код + новый пароль.
                  Text('Код из письма',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.inkMuted)),
                  const SizedBox(height: 6),
                  _CodeField(
                    controller: _code,
                    error: _showResetErrors ? _codeError : null,
                    onChanged: (_) {
                      if (_showResetErrors) setState(() {});
                    },
                  ),
                  const SizedBox(height: 16),
                  AuthField(
                    controller: _password,
                    label: 'Новый пароль',
                    obscure: true,
                    autofillHints: const <String>[AutofillHints.newPassword],
                    textInputAction: TextInputAction.done,
                    error: _showResetErrors ? _passwordError : null,
                    onChanged: (_) {
                      if (_showResetErrors) setState(() {});
                    },
                    onSubmitted: (_) => _reset(),
                  ),
                  const SizedBox(height: 20),
                  AuthPrimaryButton(
                    label: 'Сбросить пароль',
                    busyLabel: 'Сохраняем…',
                    busy: _resetting,
                    onPressed: _reset,
                  ),
                ],
                if (_serverError != null) ...<Widget>[
                  const SizedBox(height: 12),
                  Text(_serverError!, style: TextStyle(fontSize: 14, color: c.inkMuted)),
                ],
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: <Widget>[
                    Text('Вспомнили пароль? ', style: TextStyle(fontSize: 14, color: c.inkMuted)),
                    GestureDetector(
                      onTap: () => context.go('/login'),
                      child: Text('Войти',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.accent)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Поле ввода 6-значного кода в стиле AuthField (rounded-xl на chip, рамка line/
/// danger, фокус accent). Только цифры, счётчик символов скрыт.
class _CodeField extends StatelessWidget {
  const _CodeField({required this.controller, this.error, this.onChanged});

  final TextEditingController controller;
  final String? error;
  final ValueChanged<String>? onChanged;

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
        SelectAllTextField(
          controller: controller,
          keyboardType: TextInputType.number,
          maxLength: 6,
          inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
          onChanged: onChanged,
          style: TextStyle(fontSize: 15, color: c.ink, letterSpacing: 4),
          decoration: InputDecoration(
            isDense: true,
            filled: true,
            fillColor: c.chip,
            counterText: '',
            hintText: '123456',
            hintStyle: TextStyle(color: c.inkMuted, letterSpacing: 4),
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
