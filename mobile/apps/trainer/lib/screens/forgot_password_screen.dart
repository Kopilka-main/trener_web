import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/trainer_auth.dart';
import '../widgets/auth_form.dart';

/// Восстановление пароля по email — двухэтапный экран.
/// Этап 1: ввод почты + «Отправить код» (POST /api/auth/forgot-password).
/// Этап 2: 6-значный код + новый пароль + «Сбросить пароль»
/// (POST /api/auth/reset-password).
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _code = TextEditingController();
  final TextEditingController _password = TextEditingController();

  // false → этап 1 (запрос кода); true → этап 2 (ввод кода и нового пароля).
  bool _codeSent = false;
  bool _busy = false;
  String? _error;

  // Простой email-regex: непустая локальная часть, домен с точкой.
  static final RegExp _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final String email = _email.text.trim();
    if (!_emailRe.hasMatch(email)) {
      setState(() => _error = 'Введите корректный email.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(trainerApiProvider).forgotPassword(email);
      // Сервер всегда отвечает 200 (не раскрываем, есть ли такой email).
      setState(() => _codeSent = true);
    } catch (e) {
      setState(() =>
          _error = describeApiError(e, fallback: 'Не удалось отправить код. Попробуйте снова.'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reset() async {
    final String email = _email.text.trim();
    final String code = _code.text.trim();
    final String password = _password.text;
    if (code.length != 6) {
      setState(() => _error = 'Код состоит из 6 цифр.');
      return;
    }
    if (password.length < 8) {
      setState(() => _error = 'Пароль должен быть не короче 8 символов.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(trainerApiProvider).resetPassword(email, code, password);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Пароль изменён. Войдите с новым паролем.')),
      );
      Navigator.of(context).pop();
    } catch (e) {
      // Сервер отдаёт 400 при неверном/просроченном коде.
      setState(() => _error = 'Неверный или просроченный код.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Scaffold(
      appBar: AppBar(title: const Text('Восстановление пароля')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
              children: <Widget>[
                const AuthHeader(
                  eyebrow: 'FITFLOW · CRM',
                  title: 'Сброс пароля',
                  subtitle: 'Восстановление доступа к аккаунту',
                ),
                const SizedBox(height: 24),
                AuthField(
                  controller: _email,
                  label: 'Почта',
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const <String>[AutofillHints.email],
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _codeSent ? null : _sendCode(),
                ),
                if (_codeSent) ...<Widget>[
                  const SizedBox(height: 12),
                  // Нейтральная подсказка — НЕ красным.
                  _InfoBanner(
                    text: 'Если email зарегистрирован, мы отправили на него '
                        '6-значный код. Он действует 15 минут.',
                  ),
                  const SizedBox(height: 16),
                  _CodeField(controller: _code),
                  const SizedBox(height: 16),
                  AuthField(
                    controller: _password,
                    label: 'Новый пароль (от 8 символов)',
                    obscure: true,
                    autofillHints: const <String>[AutofillHints.newPassword],
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _reset(),
                  ),
                ],
                if (_error != null) ...<Widget>[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(fontSize: 14, color: c.danger)),
                ],
                const SizedBox(height: 20),
                AuthPrimaryButton(
                  label: _codeSent ? 'Сбросить пароль' : 'Отправить код',
                  busyLabel: _codeSent ? 'Сбрасываем…' : 'Отправляем…',
                  busy: _busy,
                  onPressed: _codeSent ? _reset : _sendCode,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Поле ввода 6-значного кода в стиле [AuthField], но с числовой клавиатурой,
/// ограничением длины и скрытым счётчиком символов.
class _CodeField extends StatelessWidget {
  const _CodeField({required this.controller});
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    OutlineInputBorder border(Color color, double width) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: color, width: width),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('Код из письма',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.inkMuted)),
        const SizedBox(height: 6),
        SelectAllTextField(
          controller: controller,
          keyboardType: TextInputType.number,
          maxLength: 6,
          autocorrect: false,
          inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
          style: TextStyle(fontSize: 15, color: c.ink),
          decoration: InputDecoration(
            isDense: true,
            filled: true,
            fillColor: c.chip,
            counterText: '', // скрыть счётчик символов
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            enabledBorder: border(c.line, 1),
            focusedBorder: border(c.accent, 1.6),
            border: border(c.line, 1),
          ),
        ),
      ],
    );
  }
}

/// Нейтральный информационный баннер (подсказка) — на фоне карточки,
/// нейтральными ink-токенами. Красный в проекте только для иконок опасности.
class _InfoBanner extends StatelessWidget {
  const _InfoBanner({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    final AppColors c = context.colors;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.line),
      ),
      child: Text(text, style: TextStyle(color: c.inkMuted, height: 1.3)),
    );
  }
}
