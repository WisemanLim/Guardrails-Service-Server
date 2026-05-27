# src/orchestrator/types.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: `Decision` union + `ValidateRequest` / `ValidateResponse` 인터페이스.
- 진입점에서의 거리 / Distance from entrypoint: 3.
- 라인 수 / LOC: 32.
- 주요 export / Exports: `type Decision`, `interface ValidateRequest`, `interface ValidateResponse`.
- 의존 모듈 / Depends on (internal): 없음.
- 사용된 외부 패키지 / External packages used: 없음.

---

```ts path=src/orchestrator/types.ts lines=1-32
export type Decision =
  | 'allow'
  | 'warn'
  | 'redact'
  | 'sanitize'
  | 'block'
  | 'escalate';

export interface ValidateRequest {
  text: string;
  domain?: string;
  domains?: string[];
  locale?: string;
  userRole?: string;
  channel?: string;
  sessionId?: string;
  tenantId?: string;
}

export interface ValidateResponse {
  decision: Decision;
  riskScore: number;
  matchedRules: string[];
  categories: string[];
  normalizedText: string;
  redactedText: string;
  message: string;
  policyVersion: string;
  decisionId: string;
  evaluatedDomains: string[];
  latencyMs: number;
}
```

**분석 / Analysis (Level 2)**

- **L1-7 `Decision`** — 6 값 union. `'sanitize'` 가 들어있지만 `ACTION_TO_DECISION` 매핑에서 `sanitize` 가 들어오는 룰 action 은 `'sanitize'` 한 가지 → `sanitize → 'sanitize'` 로 가지만, `DECISION_RANK` 에서 sanitize=2 로 redact(3) 보다 낮다. PRD §8.1 의 “block > redact > warn > allow” 와 정합 (sanitize 가 redact 의 약한 형태로 위치).
- **L9-18 `ValidateRequest`** — `text` 필수. 다른 모든 필드 optional. `domains?` 와 `domain?` 둘 다 있음 — 사용성 편의 (한 도메인만 전달할 때 `domain: 'global'` 짧게). orchestrator 가 `domains ?? (domain ? [domain] : Runtime.enabledDomains)` 로 합성.
- **L20-32 `ValidateResponse`** — 11개 필드. 모두 required (optional 없음) — caller 안전.
- **`message: string`** — empty string 가능(allow 일 때). undefined 가 아닌 빈 문자열로 normalize.
- **`policyVersion: string`** — `'0.0.0'` 폴백(bundle 없음 시).
- **`decisionId: string`** — audit 실패 시 `'local-${ts}'` 폴백 (위 audit.client 분석 참조).

**짚어볼 점 / Watch-outs**
- `ValidateResponse.evaluatedDomains` 는 polic engine 응답에서 echo — bundle null 이면 input domains 그대로.
- `Decision` union 이 `'sanitize'` 를 포함하지만 README 의 PRD §8.1 단계는 “block > redact > warn > allow” 만 명시 — sanitize 가 어디 끼는지 문서적 정합성 약함.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) 타입이 한 곳. (2) optional/required 가 명확.
- 위험 / Risks: 없음.
- 개선 권고 / Recommendations: (1) `Decision` 의 README/PRD 매핑 표 추가. (2) zod schema 와 1:1 매핑하면 컴파일 시 일관성 보장.
- 재읽기 권고 레벨 / Suggested re-read level: 1.
