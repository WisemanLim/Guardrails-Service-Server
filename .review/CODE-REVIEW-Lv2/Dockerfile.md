# Dockerfile — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](./INDEX.md)

**파일 요약 / File Summary**
- 역할: 2-stage 컨테이너 이미지 정의. builder 에서 빌드, runtime 에서 실행.
- 진입점에서의 거리: 0 (배포 진입점)
- 라인 수: 15
- 주요 export: 컨테이너 이미지 (runtime stage)
- 의존 모듈 (internal): `package.json`, `tsconfig.json`, `nest-cli.json`, `src/`
- 사용된 외부 패키지: `node:20-alpine` (base image)
- 부수효과: `npm install`, `npm run build`, 8080 포트 노출
- 동시성 모델: 단일 Node 프로세스 (CMD)
- 테스트 커버리지 흔적: 없음 (컨테이너 빌드 검증 없음)

## 라인별 분석 / Line-by-Line

```dockerfile path=Dockerfile lines=1-7
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json nest-cli.json ./
RUN npm install --no-fund --no-audit
COPY src ./src
RUN npm run build
```

**분석 / Analysis (Level 2)**
- 1: `node:20-alpine` — Alpine + musl libc. NestJS/axios 는 문제 없지만 native addon 이 들어오면 빌드 실패할 수 있다. multi-stage 패턴은 적합.
- 3: `package-lock.json` 을 COPY 안 한다. lockfile 부재라 어차피 의미 없지만, lockfile 을 만들고 나면 `npm ci` 로 전환 필요 (재현 가능 빌드).
- 4: `npm install` (not `npm ci`) — lockfile 무시. 운영 빌드마다 마이너 버전 흘러갈 수 있음.
- 5: `COPY src ./src` — `.env*`, 테스트, README 등은 의도적으로 제외. `.dockerignore` 와 일치 확인 필요.
- 6: `nest build` — `tsc --build` 호출, `dist/` 생성.

```dockerfile path=Dockerfile lines=8-15
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/main.js"]
```

**분석 / Analysis (Level 2)**
- 8-10: 별도 runtime stage. `NODE_ENV=production` 설정으로 NestJS 로깅/Express 모드 변경.
- 12: `node_modules` 전체 복사 — devDeps 포함. `NODE_ENV=production` 으로 `npm install` 하지 않은 채 복사하므로 devDeps 도 같이 들어간다. 이미지 사이즈 증가 (alpine + nest deps + dev deps 합쳐 ~250MB 추정).
- 14: `EXPOSE 8080` — `Runtime.port` 의 default 와 일치. 단 ENV `PORT` 변경 시 EXPOSE 와 어긋날 수 있음 (선언적일 뿐 강제는 아님).
- 15: `node dist/main.js` 직접 실행. PID 1 — SIGTERM/SIGINT 핸들러 부재. K8s `terminationGracePeriodSeconds` 만료 후 강제 kill.

**짚어볼 점 / Watch-outs**
- **lockfile 부재**: `npm install` → 빌드마다 다른 결과 가능. 보안/재현성 양쪽으로 문제. (INDEX.md §4.6 항목 6과 일치)
- **devDeps 포함**: builder 에서 그대로 복사 → 이미지 비대. `npm prune --production` 한 단계가 빠짐.
- **non-root user 부재**: 컨테이너가 root 로 실행. `USER node` (alpine 기본 node 사용자) 추가 권장.
- **HEALTHCHECK 부재**: `GET /health` 가 있는데 Dockerfile `HEALTHCHECK` 미선언. K8s liveness probe 에 위임한다면 의도적이라고 명시 권장.
- **signal handling 부재**: `node ...` 가 PID 1. SIGTERM 받아 graceful close 하려면 [`tini`](https://github.com/krallin/tini) 또는 `node --enable-source-maps` + 명시적 핸들러 필요. `app.module.ts:bootstrap` 에 SIGTERM 핸들러 없음.
- **stdio transport 누락**: `MCP_TRANSPORT=stdio` 모드용 별도 이미지/CMD 가 없음. 데스크탑 클라이언트 통합 시 다른 entrypoint 필요. README 의도와 일치하는지 확인.

**파일 수준 평가 / File-Level Verdict**
- 강점:
  1. 2-stage 구조로 builder artifacts 분리.
  2. `NODE_ENV=production` 명시.
  3. alpine 기반으로 베이스 이미지 자체는 작음.
- 위험:
  1. lockfile 부재 + `npm install` 사용 → 재현 빌드 불가능.
  2. devDeps 가 runtime 이미지에 포함됨.
  3. root 사용자, signal handler 부재 → K8s graceful shutdown 미보장.
- 개선 권고 (impact 순):
  1. `package-lock.json` 커밋 + `npm ci --omit=dev` (또는 builder 에서 `npm prune --production` 후 복사).
  2. `USER node` 또는 명시적 비-root user 추가.
  3. `HEALTHCHECK` 또는 K8s probe 정책 README 에 명시.
- 재읽기 권고 레벨: Level 1 (전반 구조 확인 후 lockfile 도입 시점에 재점검)
