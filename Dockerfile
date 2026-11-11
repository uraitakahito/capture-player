# capture-player の image。段は 3 つ。
#
# 1. viewer — upstream/ の wabac.js と replayweb.page を Node 24 で build する（上流の engines が node <25）。
#    scripts/build-viewer.sh が、server の配る 6 つ（index.html・ui.js・sw.js・LICENSE・__version・SOURCE.txt）を
#    /out に揃える。replayweb.page の webpack は browser の組だけ（全部だと Apple Container の builder の 2 GB で
#    止まった。2026-11-12 に実測）。
# 2. build — server（src/。replayweb-server から写した node: だけの server）を tsc で dist/ に。
# 3. 実行 — node と dist/ と public/ だけ。node_modules は持たない。
#
# GIT_TAG・GIT_REV は capture-ledger の compose が submodule から渡す（/__version・/SOURCE.txt・About に出る）。
FROM node:24-bookworm-slim AS viewer
WORKDIR /src
RUN npm i -g corepack@0.35.0 && corepack enable
COPY LICENSE ./
COPY scripts/build-viewer.sh ./scripts/
COPY upstream ./upstream
ARG GIT_TAG=
ARG GIT_REV=dev
RUN GIT_TAG="${GIT_TAG}" GIT_REV="${GIT_REV}" bash scripts/build-viewer.sh /out

FROM node:26-bookworm-slim AS build
WORKDIR /app
RUN npm i -g corepack@0.35.0 && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm run build

FROM node:26-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY --from=viewer /out ./public
EXPOSE 8080
ENTRYPOINT ["node", "--enable-source-maps", "dist/main.js"]
