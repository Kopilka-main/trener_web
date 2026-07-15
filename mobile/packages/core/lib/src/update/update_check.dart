import 'dart:io';

import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/app_theme.dart';

/// Server-driven принудительное обновление: показывает НЕзакрываемый диалог
/// «Требуется обновление», если номер сборки устройства меньше [minBuild].
/// Кнопка «Обновить» открывает стор (Google Play/App Store) и диалог остаётся
/// открытым — пользователь должен обновиться, чтобы продолжить пользоваться.
///
/// Чистая UI-функция: не делает сетевых запросов сама (данные о minBuild/ссылках
/// приложение получает через свой ApiClient и передаёт сюда), поэтому core не
/// зависит от конкретного API-контракта приложения.
Future<void> maybeForceUpdate(
  BuildContext context, {
  required int minBuild,
  required String androidUrl,
  required String iosUrl,
}) async {
  if (minBuild <= 0) return;
  try {
    final PackageInfo info = await PackageInfo.fromPlatform();
    final int ownBuild = int.tryParse(info.buildNumber) ?? 0;
    if (ownBuild >= minBuild) return;
    if (!context.mounted) return;
    final AppColors c = context.colors;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          backgroundColor: c.card,
          title: Text('Требуется обновление', style: TextStyle(color: c.ink)),
          content: Text(
            'Вышла новая версия приложения. Обновите, чтобы продолжить пользоваться.',
            style: TextStyle(color: c.inkMuted),
          ),
          actions: <Widget>[
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: c.accent, foregroundColor: c.accentOn),
              onPressed: () async {
                try {
                  final String url = Platform.isIOS ? iosUrl : androidUrl;
                  await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
                } catch (_) {
                  // Не удалось открыть стор — диалог остаётся, пользователь может попробовать снова.
                }
              },
              child: const Text('Обновить'),
            ),
          ],
        ),
      ),
    );
  } catch (_) {
    // Сбой проверки обновления (сеть/парсинг/платформенный плагин) не должен
    // блокировать запуск приложения — молча игнорируем.
  }
}
