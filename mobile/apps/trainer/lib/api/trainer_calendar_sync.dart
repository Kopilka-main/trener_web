import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Ссылка на iCal-фид расписания тренера. На неё подписываются в Google/iPhone
/// календаре — занятия из приложения экспортируются односторонне и авто-обновляются.
/// Бэкенд создаёт секретный токен при первом запросе.
final FutureProvider<String> calendarFeedUrlProvider = FutureProvider<String>((Ref ref) async {
  final Map<String, dynamic> r = await ref.read(apiClientProvider).getJson('/api/calendar/feed');
  return r['url'] as String? ?? '';
});
