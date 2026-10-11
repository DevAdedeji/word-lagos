FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY packages/game-core/package.json ./packages/game-core/package.json
COPY packages/multiplayer/package.json ./packages/multiplayer/package.json
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "run", "start"]
