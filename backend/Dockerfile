# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
# 接真机时需要 adb：android-tools 提供 adb
RUN apk add --no-cache android-tools || true
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# 运行期数据与资源目录（compose 会挂载卷覆盖）
RUN mkdir -p /app/data /app/assets
EXPOSE 3000
CMD ["node", "dist/main.js"]
