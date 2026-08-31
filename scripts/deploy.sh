#!/usr/bin/env bash
# 배포 박스에서 실행한다. 완성된 이미지를 pull 받아 컨테이너만 교체한다 — 빌드하지 않는다.
#   ./scripts/deploy.sh <image-tag>       (태그 없으면 latest)
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-latest}"
COMPOSE="docker compose -f docker-compose.prod.yaml"
HEALTH='require("http").get("http://localhost:3000/health",r=>process.exit(r.statusCode===200?0:1)).on("error",()=>process.exit(1))'
PREV="$(cat .last_good 2>/dev/null || echo latest)"

export IMAGE_TAG="$TAG"
echo "▶ deploy: $TAG  (직전 정상 태그: $PREV)"
$COMPOSE pull
$COMPOSE up -d

# 헬스 게이트 — 최대 ~30초
for _ in $(seq 1 10); do
  sleep 3
  if $COMPOSE exec -T backend node -e "$HEALTH"; then
    echo "$TAG" > .last_good
    docker image prune -f >/dev/null 2>&1 || true
    echo "✅ deploy ok: $TAG"
    exit 0
  fi
done

echo "❌ health check 실패 — $PREV 로 롤백"
export IMAGE_TAG="$PREV"
$COMPOSE up -d
exit 1
