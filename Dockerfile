# 로컬 개발용 — ts-node + nodemon 핫리로드.
# 배포 이미지는 Dockerfile.prod 를 사용한다.
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json tsconfig.json nodemon.json ./
RUN npm ci
COPY ./src ./src
CMD ["npm", "run", "dev"]
