# Node.js를 위한 기본 이미지
FROM node:16

# 작업 디렉토리 설정
WORKDIR /app

# 패키지 파일 복사 및 설치
COPY package.json tsconfig.json ./
RUN npm install

# 소스 코드 복사
COPY ./src ./src

# 개발 환경에서는 빌드하지 않고, 바로 실행 (파일 변경 감지)
CMD ["npm", "run", "dev"]
