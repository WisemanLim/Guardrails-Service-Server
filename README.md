# Guardrails-Service-Server (MCP Server)

LLM/RAG 가드레일 시스템의 **MCP(Model Context Protocol) 진입점**. Claude Desktop, Gemini CLI, Cursor 등 MCP 클라이언트가 표준 JSON-RPC로 호출하는 tool 인터페이스를 노출하고, 내부 Policy / Detection / Audit 서비스를 오케스트레이션한다.

## 컴포넌트 책임

PRD §3.2 ①. 핵심 4가지:

1. **MCP 표준 프로토콜 핸들러** — stdio + HTTP + SSE + JSON-RPC 듀얼 transport
2. **8개 Tool 노출** — `validate_input`, `sanitize_input`, `validate_output`, `redact_output`, `classify_privacy`, `get_policy_bundle`, `explain_decision`, `health_check`
3. **인증/테넌트 컨텍스트** — API Key + (예정) OAuth, `tenantId` × `domains[]` × `locale` 결정
4. **다운스트림 오케스트레이션** — Policy bundle 조회 + Detection 호출 + 결정 합성 + Audit 적재

## 스택

- Node 20 + TypeScript 5.4
- NestJS 10 (DI/Module/Guard)
- axios (다운스트림 HTTP 클라이언트)
- zod (tool input schema 검증)
- Express adapter (HTTP/SSE transport)

## 디렉토리 구조

```
src/
├── main.ts                       # bootstrap, stdio vs http 분기
├── app.module.ts
├── config/runtime.ts             # ENV → 상수 (Runtime)
├── auth/
│   ├── auth.module.ts
│   └── api-key.guard.ts          # x-api-key 헤더 검증
├── clients/                      # 다운스트림 HTTP 클라이언트
│   ├── policy.client.ts          # → Policy Engine
│   ├── detection.client.ts       # → Detection Engine
│   └── audit.client.ts           # → Audit Service
├── orchestrator/
│   ├── orchestrator.service.ts   # 핵심 파이프라인 (PRD §8.1)
│   ├── redact.ts                 # sub_category별 placeholder 치환
│   ├── types.ts                  # Decision/Validate{Request,Response}
│   └── __tests__/redact.spec.ts
├── mcp/
│   ├── mcp.module.ts
│   ├── tool-registry.service.ts  # 8개 tool 등록 + dispatcher
│   ├── mcp.controller.ts         # HTTP/SSE/JSON-RPC endpoint
│   └── stdio.transport.ts        # stdin/stdout JSON-RPC 루프
└── health/health.controller.ts
```

## Transport 모드

### `MCP_TRANSPORT=http` (기본)

- `POST /mcp` — **JSON-RPC 2.0 (Streamable HTTP)**. `mcp-remote`가 연결하는 표준 엔드포인트.
  `initialize` / `notifications/initialized` / `ping` / `tools/list` / `tools/call` 처리 (stateless).
- `GET  /mcp` — 405 (서버→클라 GET 스트림 미사용; stateless POST만).
- `POST /mcp/tools/:name` — flat REST (curl/테스트용)
- `GET  /mcp/tools` — tool 카탈로그 (name/description/inputSchema)
- `GET  /mcp/sse` — 레거시 SSE heartbeat (구버전 브리지 호환용)
- `GET  /health`

인증은 `MCP_HTTP_AUTH`로 제어:
- `optional` (기본) — 헤더 없이 허용. `mcp-remote http://<host>:<port>/mcp` 바로 연결 (LAN/게이트웨이 뒤 배포 가정).
- `required` — `x-api-key: $GUARDRAILS_API_KEY` 또는 `Authorization: Bearer $GUARDRAILS_API_KEY` 필수. 미제공 시 `401 invalid_api_key`. 외부 노출 시 TLS와 함께 사용.

### `MCP_TRANSPORT=stdio`

데스크톱 클라이언트(Claude Desktop, Gemini CLI)용. stdin/stdout으로 JSON-RPC 2.0 line-delimited 프레임만 주고받는다. stdout은 JSON-RPC 전용으로 유지하고 모든 로그는 stderr로 보낸다.

지원 method:
- `initialize` → protocolVersion + capabilities
- `tools/list` → 8개 tool 메타데이터
- `tools/call` → `{ name, arguments }` 처리, `content[0].text`로 JSON 반환

## Tool 인터페이스 요약

| Tool | 입력 핵심 필드 | 출력 핵심 필드 |
| :-- | :-- | :-- |
| `validate_input` | `text`, `domain`/`domains[]`, `locale`, `userRole?`, `sessionId?` | `decision`, `riskScore`, `matchedRules`, `redactedText`, `decisionId` |
| `validate_output` | 동일 | 동일 (output 정책만 평가) |
| `sanitize_input` | 동일 | `normalizedText`, `redactedText` (결정 없음) |
| `redact_output` | 동일 | 동일 |
| `classify_privacy` | 동일 | `categories[]`, `riskScore` |
| `get_policy_bundle` | `domains[]`, `locale`, `ioType` | compiled bundle (rules[] 포함) |
| `explain_decision` | `decisionId` | Audit 원본 행 |
| `health_check` | (없음) | 활성 도메인/locale/transport |

PRD §6.1 응답 스키마 그대로.

## 처리 파이프라인 (PRD §8.1)

```
1. API Key 검증 + tenant 결정
2. domains/locale/ioType 파라미터 파싱 (기본값: ENV)
3. Policy Engine.bundle(domains, locale, ioType)  ─┐
   Detection Engine.detect(text, ...)              ├── 병렬
                                                   ─┘
4. 매치된 detector의 sub_category로 rule 인덱싱
5. action 합성 — 가장 엄격한 결정 채택 (block > redact > warn > allow)
6. 매치 없는데 detection만 있으면: output→redact, input→warn
7. sha256(원문) + 메타데이터 → Audit Service 비동기 적재
8. ValidateResponse 반환
```

Audit 실패는 절대 요청을 깨뜨리지 않음 (로그만 남김).

## 환경 변수

| 변수 | 기본 | 설명 |
| :-- | :-- | :-- |
| `PORT` | `8080` | HTTP transport 포트 |
| `MCP_TRANSPORT` | `http` | `http` \| `stdio` |
| `GUARDRAILS_API_KEY` | `dev-key-please-change` | HTTP 요청 인증 |
| `GUARDRAILS_ENABLED_DOMAINS` | `global` | CSV (`global,manufacturing-food`) |
| `GUARDRAILS_LOCALES` | `ko-KR,en` | CSV |
| `POLICY_ENGINE_URL` | `http://127.0.0.1:8082` | |
| `DETECTION_ENGINE_URL` | `http://127.0.0.1:8081` | |
| `AUDIT_SERVICE_URL` | `http://127.0.0.1:8083` | |
| `LOG_LEVEL` | `info` | |

## 로컬 개발

```bash
npm install
cp .env.example .env

# HTTP transport (개발)
npm run start:dev

# stdio transport (Claude Desktop 연동 시뮬레이션)
npm run build && npm run start:stdio
```

## 테스트

```bash
npm test
```

현재 포함:
- `orchestrator/__tests__/redact.spec.ts` — sub_category placeholder, 다중 매치 R→L 치환

## MCP Client 연동

두 가지 등록 방식. Docker로 띄운 원격 서버는 **A (HTTP)**, 클라이언트가 로컬 프로세스를 직접 띄우면 **B (stdio)**.

| Transport | 용도 | Endpoint |
|---|---|---|
| **HTTP** (Streamable HTTP) | Docker/원격 배포된 서버를 client에 등록 | `POST http://<host>:8080/mcp` |
| **stdio** | client가 로컬 바이너리를 직접 spawn | `node dist/main.js` (`MCP_TRANSPORT=stdio`) |

### A. HTTP 서버를 client에 등록 (`mcp-remote`)

`MCP-type-Guardrails-Service`에서 `make up-p1-p2-admin-web`(또는 `up-p1`) 등으로 Docker 기동 시
Server는 `http://<host>:8080/mcp`에 MCP Streamable HTTP를 노출. Claude Desktop 등 stdio-only
client는 [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) 브리지로 연결.

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "guardrails": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://<서버-IP>:8080/mcp"]
    }
  }
}
```

- **포트 `8080`** — `MCP_EXPOSED_PORT` 변경 시 맞춰 수정. 경로는 항상 `/mcp`.
- **인증** — 서버 기본값 `MCP_HTTP_AUTH=optional`이면 위처럼 헤더 없이 연결됨.
  서버가 `MCP_HTTP_AUTH=required`이면 헤더 추가:
  ```json
  "args": ["-y", "mcp-remote", "http://<서버-IP>:8080/mcp",
           "--header", "x-api-key:dev-key-please-change"]
  ```
  > `mcp-remote`는 `key:value`를 첫 `:`에서 분리 → 콜론 뒤 **공백 없이**. `Authorization: Bearer <key>`도 허용.
- 로컬 단독 실행 시 `http://127.0.0.1:8080/mcp`.

검증 (curl):
```bash
# initialize 핸드셰이크 (MCP_HTTP_AUTH=required면 -H 'x-api-key: <key>' 추가)
curl -s http://<서버-IP>:8080/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
# → {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{...}}}

# 도구 목록
curl -s http://<서버-IP>:8080/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

### B. stdio (client가 로컬 프로세스 spawn)

Docker 없이 client가 직접 바이너리 실행. 다운스트림 URL을 env로 주입. `npm run build` 선행.

```json
{
  "mcpServers": {
    "guardrails": {
      "command": "node",
      "args": ["/abs/path/to/Guardrails-Service-Server/dist/main.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "POLICY_ENGINE_URL": "http://127.0.0.1:8082",
        "DETECTION_ENGINE_URL": "http://127.0.0.1:8081",
        "AUDIT_SERVICE_URL": "http://127.0.0.1:8083",
        "GUARDRAILS_ENABLED_DOMAINS": "global",
        "GUARDRAILS_LOCALES": "ko-KR,en"
      }
    }
  }
}
```

stdio는 `ApiKeyGuard`를 우회 (OS 권한으로 채널 격리).

## 권장 시스템 프롬프트

```
You MUST call `guardrails.validate_input` on every user prompt
and `guardrails.validate_output` on every model response.

If decision == "block": stop and show message.
If decision == "redact" or "sanitize": use redactedText only.
If decision == "escalate": deliver only a generic acknowledgement.
```

## 도메인 확장

1차에서는 `global` 단일. 신규 phase 추가 시 클라이언트는 ENV만 변경:

```jsonc
"GUARDRAILS_ENABLED_DOMAINS": "global,manufacturing-food"
```

Server는 변경 불필요 — 다운스트림(Policy/Detection)이 도메인 키를 인식하면 즉시 반영.

## Docker

```bash
docker build -t guardrails-mcp-server .
docker run --rm -p 8080:8080 \
  -e POLICY_ENGINE_URL=http://host.docker.internal:8082 \
  -e DETECTION_ENGINE_URL=http://host.docker.internal:8081 \
  -e AUDIT_SERVICE_URL=http://host.docker.internal:8083 \
  guardrails-mcp-server
```

통합 배포는 형제 `MCP-type-Guardrails-Service/docker-compose.yml` 참고.

## 향후 작업 (M2+)

- OAuth 2.0 Client Credentials
- RBAC (tenant × tool scope × allowed_domains)
- 정책 reload subscriber (Redis pub/sub)
- OpenTelemetry trace 전파
- 입력 캐시 (sha256 → 결정, TTL 60s)
- 정식 MCP SDK(`@modelcontextprotocol/sdk`) 통합
