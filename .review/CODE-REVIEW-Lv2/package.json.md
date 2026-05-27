# package.json — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](./INDEX.md)

**파일 요약 / File Summary**
- 역할: npm 매니페스트 — 의존성, scripts, Jest 설정.
- 진입점에서의 거리: 빌드/실행 매니페스트.
- 라인 수: 48
- 주요 export: scripts (`build`, `start`, `start:dev`, `start:stdio`, `lint`, `test`), deps, jest config
- 의존 모듈 (internal): n/a
- 사용된 외부 패키지: §2.4 (INDEX.md) 인벤토리 참조
- 부수효과: `npm install` 시 deps 설치
- 동시성 모델: n/a
- 테스트 커버리지 흔적: jest config 존재 (`testRegex: .*\.spec\.ts$`)

## 라인별 분석 / Line-by-Line

```json path=package.json lines=1-16
{
  "name": "guardrails-mcp-server",
  "version": "0.1.0",
  "description": "MCP Server exposing guardrails tools (validate_input, validate_output, etc.) over stdio + HTTP/SSE.",
  "private": true,
  "main": "dist/main.js",
  "bin": { "guardrails-mcp": "dist/main.js" },
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main.js",
    "start:stdio": "MCP_TRANSPORT=stdio node dist/main.js",
    "lint": "eslint \"src/**/*.ts\"",
    "test": "jest"
  },
```

**분석 / Analysis (Level 2)**
- 5: `private: true` — npm publish 차단. 의도 (내부 배포).
- 6-7: `main` + `bin` — `guardrails-mcp` CLI 로 글로벌 설치 시 stdio 진입 가능. 그러나 `bin` 은 `dist/main.js` 만 가리켜 stdio 모드는 ENV 설정 필요. (`#!/usr/bin/env node` shebang 이 빌드 산출물에 없을 수 있음 — 확인 필요. nest build 가 자동 추가하지 않음. → `bin` 호출이 실패할 위험.)
- 11: `start:dev` 는 `nest start --watch` — TS 컴파일 + 재시작. tsx/ts-node 미사용.
- 13: `start:stdio` 가 ENV 분기. `main.ts:7-9` 와 연결.
- 14: `lint` 명령은 있는데 `eslint` 가 devDeps 에 **없다** — `npm run lint` 가 ENOENT 로 실패한다. 즉 lint 가 사실상 미설정.

```json path=package.json lines=17-40
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@nestjs/common": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/platform-express": "^10.3.0",
    "axios": "^1.6.8",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.0",
    "@nestjs/schematics": "^10.1.0",
    "@nestjs/testing": "^10.3.0",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.0",
    "jest": "^29.7.0",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.0"
  },
```

**분석 / Analysis (Level 2)**
- 18 `@modelcontextprotocol/sdk`: dependencies 에 선언되었지만 코드 grep 결과 import 없음 (INDEX.md §2.4). 향후 SSE/공식 transport 구현 시 사용 예정. 현재는 미사용 의존.
- 25 `rxjs`: NestJS peer dep. 직접 import 없음. 선언 자체는 호환성을 위해 유지.
- 26 `zod`: `tool-registry.service.ts` 에서 input schema 검증.
- 31 `@nestjs/testing` / 36 `supertest`: 테스트 파일이 NestJS DI 컨테이너를 부르지 않음 (`redact.spec.ts` 는 순수 함수만). → 사용 없음. 향후 e2e 시 보존.
- 38 `ts-node`: nest CLI 가 직접 의존하지만 명시도 OK.
- **`eslint` 누락**: scripts 의 `lint` 와 모순.

```json path=package.json lines=41-48
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

**분석 / Analysis (Level 2)**
- 43 `rootDir: src` — `__tests__` 디렉토리도 안에 있어 매칭됨. OK.
- 44 testRegex — `*.spec.ts` 만. e2e 분리 시 별도 jest config 필요.
- 45 transform — ts-jest 글로벌 적용.
- coverage threshold 미설정 — 단일 spec 만으로 충분히 통과하므로 명시적 게이트 없음.

**짚어볼 점 / Watch-outs**
- **`eslint` 미설치인데 `lint` script 존재** — `npm run lint` 실패. CI 가 lint 게이트 갖고 있다면 항상 깨짐.
- **lockfile 누락** — 디렉토리에 `package-lock.json` 없음. `npm install` 마다 deps 변동 가능. (INDEX.md §1.4, §4.6 항목 6)
- **`@modelcontextprotocol/sdk` 미사용** — dependencies 에 선언만. 이미지/설치 사이즈에 영향.
- **`bin` shebang**: `dist/main.js` 는 nest build 산출물. `bin` 으로 노출하려면 `#!/usr/bin/env node` shebang 이 필요한데 nest build 가 자동 추가하지 않음 → `guardrails-mcp` 글로벌 호출 실패 가능.
- **`engines` 미선언** — Node 20 가정인데 `"engines": { "node": ">=20" }` 부재. nvm/n-version-manager 사용자가 혼동.
- **`type` 미선언** — CommonJS 인지 ESM 인지 명시 없음. tsconfig 의 `module: commonjs` 와 함께 사용되어 동작은 하지만 명시 권장.

**파일 수준 평가 / File-Level Verdict**
- 강점:
  1. scripts 가 stdio/http 두 모드를 명확히 분리.
  2. NestJS 10 + zod + axios — 최소 의존성.
  3. jest config 가 매니페스트 내부에 있어 일원화.
- 위험:
  1. `lint` script 가 deps 없이 선언 — 항상 실패.
  2. lockfile 부재 — 재현 빌드 불가.
  3. 미사용 의존(`@modelcontextprotocol/sdk`, `rxjs` 직접 미사용, `supertest`/`@nestjs/testing` 미사용) 가 매니페스트에 누적.
- 개선 권고 (impact 순):
  1. `lockfile` 커밋 + `eslint` 추가 또는 `lint` script 제거.
  2. `engines.node` 명시.
  3. 미사용 의존 정리 (또는 README 에 “M2+ 예정” 명시).
- 재읽기 권고 레벨: Level 1 (의존성 추가/변경 시점에 재방문)
