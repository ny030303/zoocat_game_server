

```scss
📦 socket-server
┣ 📂 src
┃ ┣ 📂 config           # 환경 설정 및 MongoDB 연결
┃ ┣ 📂 sockets          # WebSocket 핸들러 및 게이트웨이
┃ ┣ 📂 services         # 비즈니스 로직
┃ ┣ 📂 repositories     # MongoDB CRUD 레이어
┃ ┣ 📂 models           # 데이터 모델 (Mongoose Schema)
┃ ┣ 📂 utils            # 공통 유틸리티 함수
┃ ┣ 📂 middlewares      # 미들웨어 (인증, 로깅)
┃ ┣ 📂 events           # Pub/Sub 이벤트 관리
┃ ┣ 📜 index.ts         # 서버 엔트리 포인트
┃ ┣ 📜 app.ts           # Express + WebSocket 설정
┣ 📜 .env               # 환경변수
┣ 📜 package.json       # 패키지 정보
┣ 📜 tsconfig.json      # TypeScript 설정
```