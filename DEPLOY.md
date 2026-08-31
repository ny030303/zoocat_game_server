# 배포 (CI/CD)

## 구조

```
push master
  └─ CI (.github/workflows/ci.yml)      : tsc --noEmit + 소켓 스모크 테스트
  └─ Deploy (.github/workflows/deploy.yml)
        build : Dockerfile.prod 멀티스테이지 이미지 → GHCR push (태그: <sha>, latest)
        deploy: SSH → 박스에서 git pull → scripts/deploy.sh <sha>
                (pull → up -d → /health 게이트 → 실패 시 직전 태그로 자동 롤백)
```

**원칙: 박스는 절대 빌드하지 않는다.** 모든 컴파일은 GitHub Actions에서. 박스는 이미지 pull + 컨테이너 교체만.

## 환경별 DB

| 환경 | MongoDB | 연결 |
|---|---|---|
| 로컬 | `docker compose up` 의 mongo 컨테이너 | compose가 `MONGO_URI` 주입 |
| 로컬(호스트 실행) | 위 컨테이너 | `src/config/db.ts` 의 localhost fallback |
| 배포 | MongoDB Atlas | 박스 `~/zoocat/.env` 의 `MONGO_URI` |

## 최초 1회 세팅

### 1. MongoDB Atlas
- M0(무료) 클러스터 생성 — **리전은 배포 박스와 동일하게** (예: `ap-northeast-2`)
- Database Access: DB 유저/비밀번호 생성
- Network Access: **배포 박스 IP만 허용** (`0.0.0.0/0` 금지)
- Connect → Drivers → 연결 문자열 복사

### 2. GitHub 저장소 Secrets (Settings → Secrets and variables → Actions)
| Secret | 값 |
|---|---|
| `SSH_HOST` | 배포 박스 IP/호스트 |
| `SSH_USER` | 배포 유저 (docker 그룹 소속) |
| `SSH_KEY` | 개인키 (공개키는 박스 `~/.ssh/authorized_keys` 에) |

이미지 push는 내장 `GITHUB_TOKEN` 사용 → 별도 secret 불필요.

### 3. 배포 박스
```bash
# swap (25GB 디스크에 2GB) — RAM 스파이크 안전망
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl -w vm.swappiness=10

# docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"          # 재로그인

# 저장소 클론 (compose 파일 + deploy.sh 동기화용)
git clone https://github.com/ny030303/zoocat_game_server.git ~/zoocat
cd ~/zoocat
chmod +x scripts/deploy.sh

# 시크릿
cp .env.example .env
#   .env 편집: MONGO_URI 를 Atlas 문자열로
chmod 600 .env

# GHCR 로그인 (패키지가 private 이면) — PAT 는 read:packages 권한
echo "$GHCR_PAT" | docker login ghcr.io -u ny030303 --password-stdin

# 최초 기동
export IMAGE_TAG=latest
docker compose -f docker-compose.prod.yaml up -d
curl -sf localhost:3000/health          # {"ok":true}
```

### 4. (선택) TLS + wss:// — 리버스 프록시
브라우저/앱이 `wss://` 로 붙으려면 앞단에 Caddy 등:
```
# /etc/caddy/Caddyfile
game.example.com {
    reverse_proxy 127.0.0.1:3000
}
```
컨테이너 포트는 `docker-compose.prod.yaml` 에서 `127.0.0.1:3000` 으로만 바인딩됨.

## 일상 배포

`master` 에 머지 → 끝. Actions가 빌드·push·SSH 배포·헬스체크까지 자동.

## 롤백

- 자동: `/health` 실패 시 `deploy.sh` 가 `.last_good` 태그로 재배포
- 수동:
  ```bash
  cd ~/zoocat
  export IMAGE_TAG=<이전-sha>
  docker compose -f docker-compose.prod.yaml up -d
  ```

## 리소스 예산 (1 vCPU / 1 GB 박스)

| | 비고 |
|---|---|
| OS + dockerd | ~200 MB |
| backend (Node) | `--max-old-space-size=384` 로 상한 |
| MongoDB | **박스 밖 (Atlas)** |
| swap 2 GB | 스파이크 흡수 |

> 대역폭이 월 총량 제한(예: 0.06 GB)이면 이미지 pull 모델이 안 맞음 — 전송량 있는 요금제로 옮기거나 박스 빌드로 전환 검토.

## 참고

- `yarn.lock` 은 사용 안 함 (npm/`package-lock.json` 기준). 혼동 방지로 삭제 권장.
- `Dockerfile` = 로컬 개발용, `Dockerfile.prod` = 배포용.
