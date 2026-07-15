import 'package:flutter_cache_manager/flutter_cache_manager.dart';

/// Общий дисковый кэш медиа приложения: превью/фото/видео упражнений, аватары,
/// фото прогресса.
///
/// По умолчанию flutter_cache_manager хранит лишь ~200 файлов — для каталога на
/// 1000+ упражнений этого мало (просмотренное быстро вытесняется, офлайн почти
/// ничего не остаётся). Поднимаем лимит до 2000 объектов, чтобы больше медиа
/// оставалось доступно офлайн. Все виджеты медиа передают этот менеджер в
/// [cacheManager], поэтому лимит общий для обоих приложений (тренер + клиент).
final CacheManager mediaCache = CacheManager(
  Config(
    'fitbond_media',
    maxNrOfCacheObjects: 2000,
    stalePeriod: const Duration(days: 60),
  ),
);
