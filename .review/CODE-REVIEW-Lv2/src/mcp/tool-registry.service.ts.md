# src/mcp/tool-registry.service.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: 8개 MCP tool 을 등록하고 호출자(컨트롤러/stdio dispatch)에 단일 인터페이스 제공.
- 진입점에서의 거리 / Distance from entrypoint: 2.
- 라인 수 / LOC: 139.
- 주요 export / Exports: `interface McpTool`, `class ToolRegistryService`.
- 의존 모듈 / Depends on (internal): `../orchestrator/orchestrator.service`, `../clients/policy.client`, `../config/runtime`.
- 사용된 외부 패키지 / External packages used: `@nestjs/common`, `zod`, `axios` (동적 import).
- 부수효과 / Side effects: ctor 에서 8개 tool 등록(Map mutation), `explain_decision` 핸들러가 외부 HTTP GET.
- 동시성 모델 / Concurrency model: async handler, 컨테이너 lifecycle 1회 초기화.
- 테스트 커버리지 흔적 / Test coverage signal: 없음.

---

```ts path=src/mcp/tool-registry.service.ts lines=1-13
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { PolicyClient } from '../clients/policy.client';
import { Runtime } from '../config/runtime';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
}
```

**분석 / Analysis (Level 2)**

- **L7-12 `McpTool`** — `inputSchema: Record<string, unknown>` 라 어떤 형태든 받음. 실제로는 ZodObject.shape 가 들어옴(아래 L42 참조). MCP 표준은 JSON Schema 객체.

```ts path=src/mcp/tool-registry.service.ts lines=14-33
const ValidateInputSchema = z.object({
  text: z.string(),
  domain: z.string().optional(),
  domains: z.array(z.string()).optional(),
  locale: z.string().optional(),
  userRole: z.string().optional(),
  channel: z.string().optional(),
  sessionId: z.string().optional(),
  tenantId: z.string().optional(),
});

const BundleSchema = z.object({
  domain: z.string().optional(),
  domains: z.array(z.string()).optional(),
  locale: z.string(),
  ioType: z.enum(['input', 'output']),
});

const ExplainSchema = z.object({ decisionId: z.string() });
```

- **L14-23 `ValidateInputSchema`** — `text` 필수, 나머지 optional. 6개 메타 필드(userRole/channel/sessionId/tenantId 등) 가 transit. `orchestrator.service.ts` 가 `req.text ?? ''` 로 fallback 하므로 실제로는 `text` 빈 문자열도 지나갈 수 있지만 zod 가 `z.string()` 으로 막음(빈 문자열은 통과).
- **L25-30 `BundleSchema`** — `ioType` 이 `'input' | 'output'` (no `'both'`) — Policy Engine 의 `'both'` 응답과는 다른 의미(여기서는 “요청 시 어떤 stream 인지”).
- **L32 `ExplainSchema`** — decisionId 만.

```ts path=src/mcp/tool-registry.service.ts lines=34-60
@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, McpTool>();

  constructor(private readonly orchestrator: OrchestratorService, private readonly policy: PolicyClient) {
    this.register({
      name: 'validate_input',
      description: 'Evaluate guardrails on a user-supplied prompt before LLM invocation.',
      inputSchema: ValidateInputSchema.shape as unknown as Record<string, unknown>,
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        return this.orchestrator.validate(parsed, 'input');
      },
    });

    this.register({
      name: 'validate_output',
      description: 'Evaluate guardrails on a model-generated response before delivery.',
      inputSchema: ValidateInputSchema.shape as unknown as Record<string, unknown>,
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        return this.orchestrator.validate(parsed, 'output');
      },
    });
```

- **L36 `tools = new Map`** — ctor 에서 채워지고 mutate 만 (no delete). thread-safety: Node 단일 스레드라 무관.
- **L38 ctor params** — DI 로 두 의존성. `OrchestratorService` 자체가 Policy/Detection/Audit client 를 inject 받음.
- **L42 `ValidateInputSchema.shape as unknown as Record<string, unknown>`** — **흔한 실수 + 코드 스멜**: zod `.shape` 는 `{ field: ZodType, ... }` 형태로 JSON Schema 가 아니다. 두 단 단언(`as unknown as`) 으로 강제. 클라이언트가 introspection 시 직렬화하면 zod 메서드/내부가 그대로 노출되거나 lose function references → JSON.stringify 가 빈 객체로 떨어짐. 결과적으로 MCP 클라는 “field 가 뭔지 모름”. → `zod-to-json-schema` 필요.
- **L43-47 handler** — args → zod parse → orchestrator. parse 실패 시 ZodError throw, controller try/catch 가 400 으로 변환.

```ts path=src/mcp/tool-registry.service.ts lines=59-88
    this.register({
      name: 'sanitize_input',
      description: 'Return a normalized/redacted version of the input without a decision.',
      inputSchema: ValidateInputSchema.shape as unknown as Record<string, unknown>,
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        return this.orchestrator.sanitize(parsed, 'input');
      },
    });

    this.register({
      name: 'redact_output',
      description: 'Return a redacted version of the output text.',
      inputSchema: ValidateInputSchema.shape as unknown as Record<string, unknown>,
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        return this.orchestrator.sanitize(parsed, 'output');
      },
    });

    this.register({
      name: 'classify_privacy',
      description: 'Classify which PII categories appear in the input without enforcing an action.',
      inputSchema: ValidateInputSchema.shape as unknown as Record<string, unknown>,
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        const result = await this.orchestrator.validate(parsed, 'input');
        return { categories: result.categories, riskScore: result.riskScore };
      },
    });
```

- **L59-67 sanitize_input / L69-77 redact_output** — 둘 다 `orchestrator.sanitize` 호출, `ioType` 만 다름. 이름이 일관되지 않음(sanitize 는 input, redact 는 output) — 외부 인터페이스 의미가 다르더라도 내부는 동일 함수라는 점 이해 필요.
- **L79-88 classify_privacy** — `validate` 를 호출한 뒤 결과 일부만 발췌. 즉, Policy + Detection 둘 다 호출하고 audit 까지 기록한 다음 categories/riskScore 만 떨굼. **흔한 실수**: 이름이 “classify only” 라 부수효과 없을 거라 기대하는데 audit 기록이 발생한다. 비용도 동일. 별도 경량 경로(detection 만 호출 + audit 생략) 가 자연스럽다.

```ts path=src/mcp/tool-registry.service.ts lines=90-112
    this.register({
      name: 'get_policy_bundle',
      description: 'Return the compiled policy bundle for a (domains, locale, ioType) triple.',
      inputSchema: BundleSchema.shape as unknown as Record<string, unknown>,
      handler: async (args) => {
        const parsed = BundleSchema.parse(args);
        const domains = parsed.domains ?? (parsed.domain ? [parsed.domain] : Runtime.enabledDomains);
        return this.policy.getBundle(domains, parsed.locale, parsed.ioType);
      },
    });

    this.register({
      name: 'explain_decision',
      description: 'Look up the audit record for a prior decisionId.',
      inputSchema: ExplainSchema.shape as unknown as Record<string, unknown>,
      handler: async (args) => {
        const parsed = ExplainSchema.parse(args);
        // Audit Service exposes /events/:id; we surface its raw row.
        const { default: axios } = await import('axios');
        const res = await axios.get(`${Runtime.auditServiceUrl}/events/${parsed.decisionId}`, { timeout: 2000 });
        return res.data;
      },
    });
```

- **L96 domains fallback chain** — `parsed.domains ?? parsed.domain ? [parsed.domain] : Runtime.enabledDomains`. orchestrator 의 동일 로직과 1:1.
- **L101-110 explain_decision** — **계층 위반**: client 디렉토리 우회. 동적 import (`await import('axios')`) 사용 이유 불명(이미 다른 파일에서 정적 import 됨, tree-shake 의미 없음). `AuditClient.getEvent(id)` 메서드를 추가하면 일관.
- **L108 path concat** — `parsed.decisionId` 가 사용자 입력. `..` 또는 `?query=` 가 포함되면 URL 인젝션 가능: `decisionId=../events?dump=true` 같은 입력으로 다른 endpoint 호출 시도. axios 가 `?` 이후를 자동 인코딩하지 않음. `encodeURIComponent(parsed.decisionId)` 권장.

```ts path=src/mcp/tool-registry.service.ts lines=114-138
    this.register({
      name: 'health_check',
      description: 'Return service health and enabled-domain configuration.',
      inputSchema: {},
      handler: async () => ({
        status: 'ok',
        enabledDomains: Runtime.enabledDomains,
        enabledLocales: Runtime.enabledLocales,
        transport: Runtime.transport,
      }),
    });
  }

  register(tool: McpTool): void {
    this.tools.set(tool.name, tool);
  }

  list(): McpTool[] {
    return [...this.tools.values()];
  }

  get(name: string): McpTool | undefined {
    return this.tools.get(name);
  }
}
```

- **L114-124 health_check** — `/health` HTTP 응답의 부분집합. tool 인터페이스로도 노출 — MCP 클라가 별도 채널 없이 상태 확인 가능. 좋은 디자인.
- **L127-129 `register`** — 중복 이름 덮어쓰기 검사 없음. 같은 이름으로 register 가 두 번 호출되면 silent overwrite.
- **L131-133 `list`** — Map iteration 은 insertion order 보장 → 8개가 등록 순서대로 나온다.
- **L135-137 `get`** — undefined 가능. caller 가 처리.

**짚어볼 점 / Watch-outs**
- **inputSchema 가 JSON Schema 아님** (반복).
- **classify_privacy 의 audit 부수효과** — 의도와 이름의 괴리.
- **explain_decision URL 인젝션 잠재** — `encodeURIComponent` 필요.
- **explain_decision 동적 axios import** + client 계층 우회.
- **register 중복 이름 검사 없음**.
- **`as unknown as Record<string, unknown>`** 이중 단언 6회 — 디자인 결함의 결과물.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) zod 로 input 검증 일관. (2) tool 정의가 한 파일에 모여 인지 부하 낮음. (3) DI 친화적.
- 위험 / Risks: (1) inputSchema 표준 미달. (2) URL 인젝션 잠재. (3) 이름과 동작의 괴리(classify_privacy).
- 개선 권고 / Recommendations: (1) `zod-to-json-schema` 도입. (2) `explain_decision` 을 `AuditClient.getEvent(encodeURIComponent(id))` 로 이동. (3) `classify_privacy` 를 별도 경량 경로로 분리 또는 docstring 으로 부수효과 명시. (4) `register()` 중복 검사 + throw.
- 재읽기 권고 레벨 / Suggested re-read level: 3 — tool 인터페이스가 외부 클라와의 계약.
