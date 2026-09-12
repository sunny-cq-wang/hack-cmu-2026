FROM node:20-bookworm-slim
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @petplate/shared build && pnpm --filter api build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "api", "start"]
