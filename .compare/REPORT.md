# 비교분석 REPORT: Guardrails-Service-Server

## 1. 개요 (기준 ref → 적용대상, 2026-06-02)

- **기준(ref, 개선/신규):** `/Users/wise/Developer/Web(Node,Script)/DocuGuard-AI-Server`
  - 최근 커밋: `b3aef97 Update README.md`, `b8a5253 Update mcp name`, `ac88205 Add 1st sources`
- **적용대상(current):** `/Users/wise/Developer/Web(Node,Script)/Guardrails-Service-Server`
- 두 프로젝트는 동일 코드베이스(`Add 1st sources`)에서 분기한 NestJS(TypeScript) MCP 서버이며, ref가 더 최신이다.
- 핵심 차이: ref는 (1) **Redact 로직을 로컬 함수에서 원격 서비스 호출(RedactClient)로 분리**하고, (2) stdio transport의 `serverInfo`를 **env 설정 가능**하게 개선했으며, (3) `docuguard-*` 브랜딩으로 리네이밍했다.
- 본 작업은 (1)(2) 기능 개선만 current에 이식하고, **브랜딩(`docuguard-*` ↔ `guardrails-*`)은 current 정체성을 유지**했다.

## 2. 구조 비교 (src 디렉토리/파일 차이)

| 파일 | current(이전) | ref | 비고 |
|---|---|---|---|
| `src/clients/redact.client.ts` | 없음 | **있음 (신규)** | Policy Redact tier(`:8085`) HTTP 호출. 실패 시 identity fallback |
| `src/orchestrator/redact.ts` | 있음(로컬 placeholder 치환) | **제거됨** | RedactClient로 대체 |
| `src/orchestrator/__tests__/redact.spec.ts` | 있음 | **제거됨** | `redact.ts` 대상 테스트 (대상 함수 제거로 동반 제거) |
| `src/clients/clients.module.ts` | Policy/Detection/Audit | **+ RedactClient** | provider/export 추가 |
| `src/config/runtime.ts` | redactServiceUrl 없음 | **+ redactServiceUrl** | `REDACT_SERVICE_URL` 기본 `http://127.0.0.1:8085` |
| `src/orchestrator/orchestrator.service.ts` | 로컬 `redact()` 동기 호출 | **`await redactor.redact()` 비동기** | dead code(`severityRank`/`highestSeverity`) 제거 |
| `src/mcp/stdio.transport.ts` | `serverInfo` 하드코딩 | **env 설정화** | `MCP_SERVER_NAME`/`MCP_SERVER_VERSION` |

그 외 `app.module.ts`, `auth/*`, `clients/{policy,detection,audit}.client.ts`, `health/*`, `main.ts`, `mcp/{mcp.module,tool-registry}.ts`, `orchestrator/{module,types}.ts`, `tsconfig.json`, `Dockerfile`, `.dockerignore`, `nest-cli.json` 은 **내용 동일**(diff 0).

## 3. 의존성 변경 (package.json diff)

- **dependencies / devDependencies: 완전 동일.** 신규 추가/버전 변경 없음. `axios`(^1.6.8)는 양쪽 모두 보유 → RedactClient 이식에 새 의존성 불필요.
- **scripts: 완전 동일.**
- **메타데이터(브랜딩, 적용 안 함):**
  - `name`: current `guardrails-mcp-server` ↔ ref `docuguard-ai-server`
  - `bin`: current `guardrails-mcp` ↔ ref `docuguard-mcp`
  - `description`: ref가 tool 목록을 더 상세 기술 (브랜딩 포함)
  - → 전부 네이밍-only 차이이므로 **current 유지**.

## 4. 개선/추가/수정 항목 (설명 / ref 위치 / 영향도 / QA 리스크)

| # | 항목 | 설명 | ref 위치 | 영향도 | QA 리스크 |
|---|---|---|---|---|---|
| 1 | **RedactClient 신규** | 로컬 placeholder 치환을 Policy Redact 서비스(`:8085`) HTTP 호출로 분리. 마스킹 규칙을 정책 서비스에 중앙화 | `src/clients/redact.client.ts` | 중 | 원격 서비스 미기동 시 마스킹 미수행 → **identity fallback(원문 반환)** 로 완화. 단, block/escalate 결정은 그대로 유지되므로 차단은 정상 동작 |
| 2 | clients.module 등록 | RedactClient를 DI provider/export 추가 | `src/clients/clients.module.ts` | 저 | DI 미등록 시 부팅 실패 → 빌드/부팅으로 검증됨 |
| 3 | runtime.redactServiceUrl | `REDACT_SERVICE_URL` env 매핑(기본 8085) | `src/config/runtime.ts` | 저 | 없음 |
| 4 | orchestrator 비동기화 | `redact()` → `await redactor.redact()` (validate/sanitize 양쪽) | `src/orchestrator/orchestrator.service.ts` | 중 | 네트워크 round-trip 추가 → latency 증가(timeout 2s). 응답 latencyMs에 반영됨 |
| 5 | dead code 제거 | `severityRank()` 및 `highestSeverity`(대입만 되고 미사용) 제거 | `src/orchestrator/orchestrator.service.ts` | 저 | 동작 변화 없음(미사용 변수). 결정 로직 동일 |
| 6 | stdio serverInfo env화 | `serverInfo` 하드코딩 → `MCP_SERVER_NAME`/`MCP_SERVER_VERSION` 폴백. mcp.controller와 일관성 확보 | `src/mcp/stdio.transport.ts` | 저 | 없음. 기본값은 current 정체성(`guardrails-mcp`) 유지 |
| 7 | (브랜딩, 미적용) | `guardrails-*` → `docuguard-*` 리네이밍, README 전면 개편 | controller/stdio/README/package.json | - | current 정체성 유지 위해 의도적 미적용 |

**"Update mcp name" 커밋 판정:** 이 커밋은 두 성격이 섞여 있다. (a) `guardrails-mcp` → `docuguard-mcp` 는 **브랜딩 리네임** → 미적용. (b) stdio `serverInfo`를 하드코딩에서 **env 설정 가능**하게 바꾼 것은 mcp.controller와 동작을 일치시키는 **기능/일관성 개선** → 적용(기본값만 `guardrails-mcp`로 유지).

## 5. 적용 내역 (Applied) (파일별 변경 + 이유)

1. **`src/clients/redact.client.ts` (신규 생성)** — ref RedactClient 이식. 단, 주석의 `DocuGuard-AI-Policy` 브랜딩 문구는 일반 표현("Policy Engine's Redact tier")으로 치환하여 current 정체성 유지. 로직/시그니처/2s timeout/identity fallback은 ref와 동일.
2. **`src/clients/clients.module.ts`** — `RedactClient` import + providers/exports 추가.
3. **`src/config/runtime.ts`** — `redactServiceUrl: process.env.REDACT_SERVICE_URL ?? 'http://127.0.0.1:8085'` 추가.
4. **`src/orchestrator/orchestrator.service.ts`**
   - `import { redact } from './redact'` 제거, `RedactClient` import 추가.
   - 생성자에 `private readonly redactor: RedactClient` 주입.
   - `validate()`/`sanitize()` 내 `redact(...)` → `await this.redactor.redact(...)`.
   - 미사용 dead code(`highestSeverity`, `severityRank()`, 관련 주석) 제거 — ref와 동일. 결정 합성 로직 자체는 불변.
5. **`src/mcp/stdio.transport.ts`** — `serverInfo`를 `{ name: process.env.MCP_SERVER_NAME ?? 'guardrails-mcp', version: process.env.MCP_SERVER_VERSION ?? '0.1.0' }`로 변경. **기본 name은 current 식별자 `guardrails-mcp` 유지**(ref는 `docuguard-mcp`).
6. **`src/orchestrator/redact.ts` (삭제)** — RedactClient로 대체되어 orchestrator가 더 이상 import하지 않는 **고아 코드**. ref와 동일하게 제거.
7. **`src/orchestrator/__tests__/redact.spec.ts` (삭제) + `__tests__` 디렉토리 제거** — 삭제된 `redact.ts`를 대상으로 하던 테스트. 대상 함수 제거로 동반 제거(ref와 동일).
8. **`.env.example`** — `REDACT_SERVICE_URL=http://127.0.0.1:8085` 한 줄 추가. (current의 간결한 env 스타일 유지; ref의 주석/재배열식 전면 개편은 미반영.)

## 6. 미적용/보류 (Deferred) (이유)

- **브랜딩 리네이밍 전체** (`docuguard-*` → 유지 `guardrails-*`): package.json `name`/`bin`/`description`, controller/stdio 기본 name, README 제목·문구. → 과제 지침대로 current 정체성 보존. 네이밍-only 차이.
- **README.md 전면 개편**: ref는 분량을 크게 축소하고 DocuGuard 형제 프로젝트 링크/Redact 분리 메모 위주로 재작성. current README는 Transport/Tool/파이프라인 상세 설명을 더 풍부하게 보유. **정보량 손실 우려 + 브랜딩 결합**으로 전면 교체는 보류. (단, Redact 분리·`REDACT_SERVICE_URL` 추가 등 사실관계는 본 REPORT에 기록.) 필요 시 후속으로 current README에 RedactClient/`REDACT_SERVICE_URL` 항목만 surgical 추가 권장.
- **.env.example 전면 재배열**(NODE_ENV, MCP_HTTP_AUTH 주석 등 ref 스타일): current 스타일 유지하고 기능에 필요한 `REDACT_SERVICE_URL` 한 줄만 추가.

## 7. 검증 결과 (build/typecheck)

- **`npm run build` (nest build): PASS** — 에러/경고 없이 완료.
  ```
  > guardrails-mcp-server@0.1.0 build
  > nest build
  (exit 0, 출력 없음 = 성공)
  ```
- **`npx tsc --noEmit`: PASS (TSC_EXIT=0)** — 타입 에러 없음.
- **dist 산출물 확인:**
  - `dist/clients/redact.client.js` 생성됨.
  - `dist/orchestrator/redact.js` **부재**(고아 파일 정상 제거됨), 잔여 stale 산출물 없음.
- 의존성 추가가 없어 `npm install`/lockfile 갱신 불필요.

## 8. QA 체크리스트 & 회귀테스트 권고

- [ ] **Redact 정상 경로:** `REDACT_SERVICE_URL`(Policy `:8085`) 기동 상태에서 PII 포함 입력 → `validate_output`/`redact_output`이 `redactedText`에 마스킹 반영되는지 (기존 로컬 placeholder와 동등 결과 확인).
- [ ] **Redact 장애 fallback:** Redact 서비스 down 상태에서 호출 → 에러 없이 **원문 그대로 반환**되고 `WARN: redact unavailable` 로그 + 요청은 성공하는지. (가용성 핵심)
- [ ] **block/escalate 우선순위:** 결정이 block/escalate면 Redact 호출과 무관하게 `redactedText === '[BLOCKED]'` 유지되는지.
- [ ] **결정 합성 회귀:** dead code 제거가 결정 결과에 영향 없는지 — 기존 `redact.spec.ts`가 검증하던 시나리오(주민번호/이메일/다중 전화번호 마스킹)를 **RedactClient 통합테스트 또는 Policy Redact 서비스 단위테스트**로 재확보 권장. (현재 마스킹 로직은 Policy 서비스 측에 존재 → 테스트도 그쪽으로 이전 필요.)
- [ ] **latency:** Redact가 동기 로컬→원격 HTTP(2s timeout)로 바뀌어 `latencyMs` 증가 가능. 응답 latencyMs 측정에 포함됨을 확인하고 SLA 영향 점검.
- [ ] **stdio serverInfo:** `MCP_TRANSPORT=stdio`에서 `initialize` 응답의 `serverInfo.name`이 기본 `guardrails-mcp`, `MCP_SERVER_NAME` 지정 시 override 되는지. HTTP transport(mcp.controller)와 일관됨 확인.
- [ ] **env 누락 기본값:** `REDACT_SERVICE_URL` 미지정 시 `http://127.0.0.1:8085`로 동작하는지.
- [ ] **DI 부팅:** RedactClient DI 등록 후 앱 부팅 정상(이미 build로 1차 확인, 런타임 부팅 스모크 권장).

**회귀 핵심:** 마스킹 책임이 서버 로컬에서 Policy 서비스로 이전되었으므로, 마스킹 정확성에 대한 테스트 커버리지가 본 저장소에서 사라졌다(redact.spec 제거). Policy 서비스 측에 동등 테스트가 존재하는지 반드시 확인할 것.
