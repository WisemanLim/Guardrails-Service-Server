# src/config/runtime.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: 모든 환경 변수를 한 곳에서 파싱해 `Runtime` 상수로 노출.
- 진입점에서의 거리 / Distance from entrypoint: 2 (대부분 모듈에서 import).
- 라인 수 / LOC: 18.
- 주요 export / Exports: `Runtime` (frozen-by-convention object), `csv()`(internal).
- 의존 모듈 / Depends on (internal): 없음.
- 사용된 외부 패키지 / External packages used: 없음.
- 부수효과 / Side effects: 모듈 로드 시 1회 `process.env` 평가.
- 동시성 모델 / Concurrency model: n/a.
- 테스트 커버리지 흔적 / Test coverage signal: 없음.

---

```ts path=src/config/runtime.ts lines=1-18
function csv(v: string | undefined, fallback: string): string[] {
  return (v ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const Runtime = {
  port: Number(process.env.PORT ?? 8080),
  apiKey: process.env.GUARDRAILS_API_KEY ?? 'dev-key-please-change',
  policyEngineUrl: process.env.POLICY_ENGINE_URL ?? 'http://127.0.0.1:8082',
  detectionEngineUrl: process.env.DETECTION_ENGINE_URL ?? 'http://127.0.0.1:8081',
  auditServiceUrl: process.env.AUDIT_SERVICE_URL ?? 'http://127.0.0.1:8083',
  enabledDomains: csv(process.env.GUARDRAILS_ENABLED_DOMAINS, 'global'),
  enabledLocales: csv(process.env.GUARDRAILS_LOCALES, 'ko-KR,en'),
  transport: (process.env.MCP_TRANSPORT ?? 'http').toLowerCase(),
};
```

**분석 / Analysis (Level 2)**

- **L1-6 `csv()`** — `undefined` 면 fallback 적용. `''` 빈 문자열은 fallback 으로 가지 *않고* `split(',')` → `['']` → trim → `''` → `filter(Boolean)` 으로 빈 배열 반환. 즉 `GUARDRAILS_ENABLED_DOMAINS=` 이면 `[]`. **흔한 실수**: 이로 인해 `OrchestratorService.validate` 의 `domains[domains.length - 1] ?? 'global'` 같은 폴백이 작동한다(빈 배열일 때 last index 가 undefined). 이런 의도된 chain 은 문서화가 안 되어 있어, 6개월 후 “왜 빈 ENV 가 죽지 않지?” 추적 비용 발생.
- **L8-17 `Runtime`** — 평범한 객체. `Object.freeze` 안 되어 있어 누군가 런타임에 `Runtime.apiKey = 'x'` 로 덮어쓸 수 있다(타입은 readonly 도 아님). 핵심 시크릿이라 readonly + freeze 권장.
- **L9 `port: Number(... ?? 8080)`** — `main.ts:19` 와 중복. `runtime.ts` 에 있는데 `main.ts` 가 또 `process.env.PORT` 를 직접 읽음 → 두 곳이 갈라질 수 있다.
- **L10 default `'dev-key-please-change'`** — prod 부팅 시 fatal 가드 없음. 위험.
- **L11-13 다운스트림 URL default** — `127.0.0.1` 은 컨테이너 안에서 다른 컨테이너에 닿을 수 없음. compose 환경에서 ENV 를 반드시 주입해야 함. 본 default 는 개발 편의용.
- **L16 `csv(..., 'ko-KR,en')`** — fallback 자체에 `,` 가 들어 있어 정상적으로 두 원소가 된다. 동일 함수 호출 모양으로 동작.
- **L17 `.toLowerCase()`** — `MCP_TRANSPORT=STDIO` 도 허용. `main.ts` 도 같은 정규화를 하므로 일관됨.

**짚어볼 점 / Watch-outs**
- **보안**: `apiKey` 가 default 면 부팅 시 fatal 또는 stderr 경고 → 실수 차단.
- **불변성**: `as const` 또는 `Object.freeze(Runtime)` 권장.
- **명세화**: ENV 값 검증을 `zod` 로 일원화(현재는 zod 가 tool input 에만 사용됨).
- **평가 타이밍**: 이 파일을 *import* 하는 즉시 evaluated. `ConfigModule.forRoot` 가 `dotenv.config()` 를 호출하기 전에 evaluated 되면 `.env` 값 미반영. 실제 동작은 import 그래프에 달려 있어 검증 필요.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) ENV 의존이 한 곳. (2) default 값으로 로컬 개발이 즉시 동작.
- 위험 / Risks: (1) prod 가드 부재 (default API key). (2) 평가 타이밍 의존성. (3) freeze 부재.
- 개선 권고 / Recommendations: (1) zod 로 schema 검증 + parse 실패 시 throw. (2) `Object.freeze` + `as const`. (3) NestJS `ConfigService` 또는 `registerAs` 패턴으로 전환.
- 재읽기 권고 레벨 / Suggested re-read level: 2 — 보안 관련.
