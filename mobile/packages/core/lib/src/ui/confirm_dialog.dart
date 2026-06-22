import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Всплывающее подтверждение удаления (зеркало веба: модалка с необратимым
/// действием). Возвращает `true`, только если пользователь подтвердил.
///
/// Кнопка подтверждения — на акцентном danger-фоне (реальное разрушающее
/// действие), отмена — нейтральная. Используется всеми кнопками «удалить»,
/// чтобы случайный тап не стирал данные без спроса.
Future<bool> confirmDelete(
  BuildContext context, {
  String title = 'Удалить?',
  String message = 'Действие необратимо.',
  String confirmLabel = 'Удалить',
  String cancelLabel = 'Отмена',
}) async {
  final bool? ok = await showDialog<bool>(
    context: context,
    builder: (BuildContext ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(cancelLabel)),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, true),
          style: FilledButton.styleFrom(backgroundColor: ctx.colors.danger),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return ok == true;
}
