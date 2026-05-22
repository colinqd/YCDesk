# 使用 Node.js 20 LTS
FROM node:20-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY server/package.json server/package-lock.json ./

# 安装生产依赖
RUN npm ci --only=production --ignore-scripts

# 复制服务端代码
COPY server/server.js ./
COPY server-gui/server/server-module.js /app-server-gui/server/

# ==================== 运行阶段 ====================
FROM node:20-alpine

WORKDIR /app

# 从构建阶段复制产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.js ./
COPY --from=builder /app-server-gui /app-server-gui

# 复制证书生成工具
COPY server/generate-cert.js ./generate-cert.js
COPY server/generate-cert.sh ./generate-cert.sh

# 创建数据目录
RUN mkdir -p /data

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 暴露信令服务端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "http.get('http://localhost:' + (process.env.PORT || 3000) + '/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# 启动信令服务器
ENTRYPOINT ["node", "server.js"]
CMD ["--port", "3000"]
