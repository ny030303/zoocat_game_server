# Node.js를 위한 기본 이미지 설정
FROM node:16

# 작업 디렉토리 설정
WORKDIR /app

# 패키지 파일 복사 및 설치
COPY package.json tsconfig.json ./
RUN npm install

# 소스 코드 복사 및 타입스크립트 빌드
COPY ./src ./src
RUN npm run build

# 빌드된 코드 실행
CMD ["node", "dist/index.js"]
