#!/usr/bin/env bash
# Пересобрать вшитый сид каталога упражнений (assets/exercises.json) из прод-БД.
# Данные — глобальные упражнения (trainer_id IS NULL) в форме ответа /api/exercises.
#
# Использование:
#   tool/gen-exercise-seed.sh root@<vps-host>
#
# Требуется: ssh-доступ к VPS, там контейнер trener-postgres-1 (БД trener).
# Запрос только на чтение. После пересборки — пересобрать APK.
set -euo pipefail
HOST="${1:?укажи ssh-хост, напр. root@1.2.3.4}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$DIR/assets/exercises.json"

cat "$DIR/tool/exercise-seed.sql" \
  | ssh "$HOST" 'docker exec -i trener-postgres-1 psql -U postgres -d trener -tA' \
  | node -e "const fs=require('fs');const d=fs.readFileSync(0,'utf8').trim();const a=JSON.parse(d);if(!Array.isArray(a)||a.length===0)throw new Error('пустой/битый дамп');fs.writeFileSync(process.argv[1],JSON.stringify(a));console.log('сид обновлён:',a.length,'упр.,',fs.statSync(process.argv[1]).size,'байт');" "$OUT"
