-- Дамп глобального каталога упражнений (trainer_id IS NULL) в форме ответа
-- /api/exercises (массив ExerciseResponse). Используется для пересборки вшитого
-- сида assets/exercises.json (см. gen-exercise-seed.sh).
SELECT json_agg(json_build_object(
  'id', id,
  'isGlobal', trainer_id IS NULL,
  'name', name,
  'category', category,
  'subgroup', subgroup,
  'description', description,
  'defaultReps', default_reps,
  'defaultWeightKg', default_weight_kg,
  'defaultTimeSec', default_time_sec,
  'restSec', rest_sec,
  'note', note,
  'imageUrl', image_url,
  'thumbUrl', thumb_url,
  'videoUrl', video_url,
  'equipment', equipment,
  'primaryMuscles', primary_muscles,
  'secondaryMuscles', secondary_muscles
) ORDER BY name)
FROM exercises
WHERE trainer_id IS NULL;
