import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:core/core.dart';

void main() {
  test('buildAppTheme строит светлую и тёмную темы из токенов', () {
    final ThemeData light = buildAppTheme(AppColors.light);
    final ThemeData dark = buildAppTheme(AppColors.dark);
    expect(light.colorScheme.primary, AppColors.light.accent);
    expect(dark.colorScheme.primary, AppColors.dark.accent);
  });

  test('catalogMediaUrl склеивает base и относительный путь', () {
    expect(catalogMediaUrl('https://app.fitbond.ru', '/api/catalog-media/x.webp'),
        'https://app.fitbond.ru/api/catalog-media/x.webp');
    expect(catalogMediaUrl('https://app.fitbond.ru/', 'api/catalog-media/x.webp'),
        'https://app.fitbond.ru/api/catalog-media/x.webp');
    expect(catalogMediaUrl('https://app.fitbond.ru', 'https://cdn/x.webp'), 'https://cdn/x.webp');
    expect(catalogMediaUrl('https://app.fitbond.ru', null), isNull);
  });
}
