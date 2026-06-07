# ── 开发阶段 ──────────────────────────────────────
FROM node:20-ubuntu AS development

# 设置工作目录为 /app，后续命令都在这个目录下执行，相当于 cd /app
WORKDIR /app

COPY website/ ./website/
# 安装依赖并构建
WORKDIR /app/website
RUN npm install 

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

#-- 构建阶段 --
FROM node:20-ubuntu AS builder

# 设置工作目录为 /app，后续命令都在这个目录下执行，相当于 cd /app
WORKDIR /app
COPY website/ ./website/
# 安装依赖并构建
WORKDIR /app/website
RUN npm install && npm run build

# ── 生产阶段 ──────────────────────────────────────
FROM nginx:alpine as production 
WORKDIR /usr/share/nginx/html
COPY --from=builder /app/website/dist/ ./



