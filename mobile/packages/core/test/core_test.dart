import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:core/core.dart';

void main() {
  test('buildAppTheme применяет акцент и тёмную тему', () {
    final ThemeData theme = buildAppTheme(AppAccents.trainer);
    expect(theme.brightness, Brightness.dark);
    expect(theme.colorScheme.primary, AppAccents.trainer);
  });
}
