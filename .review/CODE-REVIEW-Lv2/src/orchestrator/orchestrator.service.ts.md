# src/orchestrator/orchestrator.service.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: validate/sanitize 파이프라인 — Policy + Detection 병렬 호출 → 룰 인덱싱 → 결정 합성 → redact → audit.
- 진입점에서의 거리 / Distance from entrypoint: 3 (tool handler 가 호출).
- 라인 수 / LOC: 158.
- 주요 export / Exports: `class OrchestratorService`.
- 의존 모듈 / Depends on (internal): `../clients/policy.client`, `../clients/detection.client`, `../clients/audit.client`, `../config/runtime`, `./redact`, `./types`.
- 사용된 외부 패키지 / External packages used: `@nestjs/common`, Node `crypto`.
- 부수효과 / Side effects: 외부 HTTP 호출 (policy/detection/audit), Logger 출력, sha256 계산.
- 동시성 모델 / Concurrency model: `Promise.all` 로 병렬 외부 호출 1단계.
- 테스트 커버리지 흔적 / Test coverage signal: 없음 (redact 만 테스트됨).

---

```ts path=src/orchestrator/orchestrator.service.ts lines=1-9
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PolicyClient, Rule } from '../clients/policy.client';
import { DetectionClient, DetectionMatch } from '../clients/detection.client';
import { AuditClient } from '../clients/audit.client';
import { Runtime } from '../config/runtime';
import { redact } from './redact';
import { Decision, ValidateRequest, ValidateResponse } from './types';
```

**분석 / Analysis (Level 2)**

- imports 가 도메인 의존성을 모두 보여준다. `crypto` 만 Node 빌트인.

```ts path=src/orchestrator/orchestrator.service.ts lines=10-32
const ACTION_TO_DECISION: Record<string, Decision> = {
  allow: 'allow',
  warn: 'warn',
  add_disclaimer: 'warn',
  sanitize: 'sanitize',
  redact: 'redact',
  block_or_redact: 'block',
  block_or_pseudonymize: 'block',
  block: 'block',
  refuse: 'block',
  aggregate_only: 'redact',
  escalate: 'escalate',
  route: 'redact',
};

const DECISION_RANK: Record<Decision, number> = {
  allow: 0,
  warn: 1,
  sanitize: 2,
  redact: 3,
  block: 4,
  escalate: 5,
};
```

- **L10-23 `ACTION_TO_DECISION`** — Policy Engine 룰의 `action` 문자열을 6 값 `Decision` 으로 매핑. **흔한 실수 회피**: union 타입을 키로 안 쓰고 `Record<string, ...>` 라 새 action 이 추가되어도 컴파일 에러 없이 fallback (`?? 'warn'` L78). 안전한 default 지만 가시성 떨어짐.
- `block_or_redact` 와 `block_or_pseudonymize` 둘 다 `'block'` 으로 떨어짐 — PRD 에서 “block 우선, pseudonymize/redact 는 fallback” 의도라면 ioType/severity 기반 분기가 필요할 수 있다. 본 구현은 단순화.
- `aggregate_only` → `'redact'`, `route` → `'redact'` — 모호한 매핑. 도메인 추가 시 재검토 필요.
- **L25-32 `DECISION_RANK`** — 결정 강도. 'escalate'(5) 가 'block'(4) 보다 강함 — 사람 개입 필요 케이스. PRD 와 일치.

```ts path=src/orchestrator/orchestrator.service.ts lines=34-48
@Injectable()
export class OrchestratorService {
  private readonly log = new Logger(OrchestratorService.name);

  constructor(
    private readonly policy: PolicyClient,
    private readonly detection: DetectionClient,
    private readonly audit: AuditClient,
  ) {}

  async validate(req: ValidateRequest, ioType: 'input' | 'output'): Promise<ValidateResponse> {
    const start = Date.now();
    const domains = req.domains ?? (req.domain ? [req.domain] : Runtime.enabledDomains);
    const locale = req.locale ?? Runtime.enabledLocales[0] ?? 'ko-KR';
    const text = req.text ?? '';
```

- **L44 `start = Date.now()`** — 후행 latencyMs 계산.
- **L46 domain fallback chain** — `req.domains` (배열) → `[req.domain]` (단일) → `Runtime.enabledDomains`. **흔한 실수**: `req.domains` 가 `[]` 빈 배열이면 nullish coalescing 가 truthy 로 통과 → `domains = []` → 뒤에서 `domains[domains.length - 1]` 가 `undefined` → 두번째 `??` 폴백(`'global'`). 동작은 하지만 명시적 길이 검사 권장.
- **L47 locale fallback** — `req.locale` → `Runtime.enabledLocales[0]` → `'ko-KR'`. `enabledLocales` 가 `[]` 이면 두 단계로 폴백.
- **L48 `text = req.text ?? ''`** — zod 에서 string 보장하지만 ‘defensive’ 패턴. `''` 빈 문자열은 의미 있는 입력일 수도, 비정상일 수도. 결정에 영향 없음(detection 도 빈 결과).

```ts path=src/orchestrator/orchestrator.service.ts lines=50-63
    const [bundle, detection] = await Promise.all([
      this.policy.getBundle(domains, locale, ioType).catch((e) => {
        this.log.warn(`policy unavailable: ${(e as Error).message}`);
        return null;
      }),
      this.detection.detect(text, domains[domains.length - 1] ?? 'global', locale, ioType).catch((e) => {
        this.log.warn(`detection unavailable: ${(e as Error).message}`);
        return null;
      }),
    ]);

    const matches: DetectionMatch[] = detection?.matches ?? [];
    const normalized = detection?.normalized_text ?? text;
    const rules = bundle?.rules ?? [];
```

- **L50-59 `Promise.all`** — 두 다운스트림을 동시에 호출. 각각 catch 로 null fallback. **흔한 실수**: 둘 다 null 이면 `matches=[]`, `rules=[]` 이라 `decision='allow'` 가 그대로 반환 → 가드가 사실상 무력화. **Fail-open 정책**. PRD 가 명시했다면 OK, 아니면 보수적으로 fail-closed 권장.
- **L55 `domains[domains.length - 1] ?? 'global'`** — Detection 은 단일 도메인을 받는다(클라이언트 인터페이스가 string). 다중 도메인의 *마지막* 을 선택 — “더 specific 한 도메인을 끝에” 라는 컨벤션 가정. 명시 문서 필요.
- **L61-63 fallback** — null safe access.

```ts path=src/orchestrator/orchestrator.service.ts lines=65-86
    // Map each detection match to the most-strict applicable rule by sub_category.
    const byCat = indexRulesBySubCategory(rules);
    let decision: Decision = 'allow';
    const matchedRuleIds = new Set<string>();
    const categories = new Set<string>();
    let highestSeverity = 0;
    let messages: string[] = [];

    for (const m of matches) {
      categories.add(`${m.category}.${m.sub_category}`);
      const rule = byCat.get(m.sub_category);
      if (!rule) continue;
      matchedRuleIds.add(rule.ruleId);
      const mapped: Decision = ACTION_TO_DECISION[rule.action] ?? 'warn';
      if (DECISION_RANK[mapped] > DECISION_RANK[decision]) {
        decision = mapped;
        highestSeverity = severityRank(rule.severity);
      }
      const msg = rule.messageTemplate[locale] ?? rule.messageTemplate.en ?? rule.description;
      if (msg) messages.push(msg);
    }
```

- **L66 indexing** — `indexRulesBySubCategory` (L144) 가 sub_category 마다 priority 최고 룰 1개를 보관.
- **L70 `highestSeverity`** — 변수 할당되지만 이후 응답에 포함되지 않고 사용처도 없음(L82 에서 갱신만 함). **죽은 코드** → 응답에 추가하거나 제거.
- **L71 `messages: string[]`** — 한 매치당 1메시지. 응답에는 `messages[0]` 만 사용(L123). 다중 메시지가 필요하다면 응답 변경 필요.
- **L73-85 for-of 루프** — 각 매치를 룰에 매핑.
  - L74 `categories.add(`${m.category}.${m.sub_category}`)` — DetectionResult.categories 와 별도로 직접 합성.
  - L77 `matchedRuleIds.add(rule.ruleId)` — Set 으로 dedup.
  - L78 `ACTION_TO_DECISION[rule.action] ?? 'warn'` — 미매핑 액션 일 때 warn 으로 안전 fallback.
  - L79 비교 후 더 엄격한 결정 채택.
  - L83 `messageTemplate[locale] ?? messageTemplate.en ?? rule.description` — 다국어 fallback.

```ts path=src/orchestrator/orchestrator.service.ts lines=87-97
    // No rule binding but raw detection signal present → default to redact for output, warn for input.
    if (decision === 'allow' && matches.length) {
      decision = ioType === 'output' ? 'redact' : 'warn';
    }

    const redactedText = decision === 'block' || decision === 'escalate'
      ? '[BLOCKED]'
      : matches.length
      ? redact(normalized, matches)
      : normalized;
```

- **L88-90 raw signal 가드** — 매치는 있는데 룰이 비어 있는 경우(룰 카탈로그가 detector 와 정합되지 않음). input 은 경고, output 은 마스킹. PRD §8.1.6 “매치 없는데 detection 만 있으면” 항목과 일치.
- **L92-96 redactedText 분기** — block/escalate 면 본문 통째로 `[BLOCKED]`. 매치 있으면 redact, 없으면 normalized 그대로.
- **흔한 실수**: `'[BLOCKED]'` 가 사용자에게 그대로 전달되면 i18n 결여. message 필드를 사용자에게 보이고 redactedText 는 디버그/저장용으로 쓰는 것이 일반적이지만, README 의 system prompt 예시("If decision == "block": stop and show message") 는 message 사용을 권하므로 `redactedText` 가 노출되진 않을 듯. 그럼에도 명시 주석 권장.

```ts path=src/orchestrator/orchestrator.service.ts lines=98-130
    const latencyMs = Date.now() - start;
    const textHash = createHash('sha256').update(text).digest('hex');
    const auditResult = await this.audit.record({
      tenantId: req.tenantId,
      sessionId: req.sessionId,
      domain: domains[domains.length - 1] ?? 'global',
      locale,
      ioType,
      textHash,
      decision,
      riskScore: detection?.risk_score ?? 0,
      matchedRules: [...matchedRuleIds],
      categories: [...categories],
      policyVersion: bundle?.version,
      latencyMs,
    });

    return {
      decision,
      riskScore: detection?.risk_score ?? 0,
      matchedRules: [...matchedRuleIds],
      categories: [...categories],
      normalizedText: normalized,
      redactedText,
      message:
        messages[0] ??
        (decision === 'allow' ? '' : '입력에 민감정보가 포함되어 있습니다. / Sensitive content detected.'),
      policyVersion: bundle?.version ?? '0.0.0',
      decisionId: auditResult?.decisionId ?? `local-${Date.now()}`,
      evaluatedDomains: bundle?.evaluatedDomains ?? domains,
      latencyMs,
    };
  }
```

- **L98 latency 측정**: redact + audit 전 후 분기 시점 — audit 호출이 await 인데 latency 는 audit *전* 에 측정. **흔한 실수**: latency 가 “audit 미포함 응답 합성까지” 라 audit POST 시간이 제외. 의도일 수도 있지만 audit 의 latency 도 알고 싶다면 위치 이동.
  - 정확히는 L98 가 audit *전* 인데 audit 응답을 받은 후 응답 객체에 latencyMs 를 포함. 즉 응답의 latencyMs 는 audit POST 전까지의 시간.
- **L99 sha256(text)** — 원문 해시. audit 에 평문 저장 회피. text 가 빈 문자열일 때 해시는 deterministic (`e3b0c44...`).
- **L100-115 `audit.record`** — `await` 하지만 실패해도 null 반환. 그러나 정상 path 도 *response 전에 await* 하므로 audit 가 느리면 응답이 늦어진다. PRD “비동기 적재”와 충돌 — fire-and-forget 패턴(`.catch`) 으로 바꾸는 게 정합.
- **L117-129 response** — `messages[0] ??` 의 nullish coalescing — `messages[0]` 가 빈 문자열 `''` 이면 첫 메시지를 사용(빈 문자열은 nullish 아님). 그러나 `messages.push(msg)` 가 `if (msg)` 가드로 들어가서 빈 문자열은 push 되지 않음 → OK.
- **L126 `decisionId: ... ?? 'local-${Date.now()}'`** — 위 audit 분석 참조.
- **L127 `evaluatedDomains: bundle?.evaluatedDomains ?? domains`** — bundle null 이면 요청 domains 그대로.

```ts path=src/orchestrator/orchestrator.service.ts lines=132-142
  async sanitize(req: ValidateRequest, ioType: 'input' | 'output'): Promise<{ normalizedText: string; redactedText: string }> {
    const locale = req.locale ?? Runtime.enabledLocales[0] ?? 'ko-KR';
    const domains = req.domains ?? (req.domain ? [req.domain] : Runtime.enabledDomains);
    const detection = await this.detection
      .detect(req.text, domains[domains.length - 1] ?? 'global', locale, ioType)
      .catch(() => null);
    const normalized = detection?.normalized_text ?? req.text;
    const redactedText = detection?.matches?.length ? redact(normalized, detection.matches) : normalized;
    return { normalizedText: normalized, redactedText };
  }
```

- **L132-141 `sanitize`** — Policy 조회 없이 Detection 만. 결정/룰 합성/audit 없음. 따라서 응답이 가볍다.
- 정상 동작. detection 실패 시 원문 통과.

```ts path=src/orchestrator/orchestrator.service.ts lines=144-157
function indexRulesBySubCategory(rules: Rule[]): Map<string, Rule> {
  const out = new Map<string, Rule>();
  // Highest priority wins (rules are sorted desc but we re-check defensively).
  for (const r of rules) {
    if (!r.subCategory) continue;
    const cur = out.get(r.subCategory);
    if (!cur || r.priority > cur.priority) out.set(r.subCategory, r);
  }
  return out;
}

function severityRank(s: string): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[s] ?? 0;
}
```

- **L144-153 `indexRulesBySubCategory`** — `subCategory` 없는 룰은 skip. priority 최고 1개만 유지. **흔한 실수**: 동일 priority 의 룰 두 개가 있을 때 *첫번째* 가 채택(`>` 비교라 동순위 교체 안 됨). PRD 가 "동순위 시 결정자" 를 정의했는지 확인 필요.
- **L155-157 `severityRank`** — string 키 lookup. `s` 가 enum 외 값이면 0. Object 리터럴을 매번 생성 — 최적화 차원에서 모듈 상수로 추출 가능(미미).

**짚어볼 점 / Watch-outs**
- **`highestSeverity`** 죽은 변수.
- **Audit 가 `await`** — PRD 의 “비동기” 와 표현 충돌.
- **Fail-open**: Policy + Detection 둘 다 죽으면 allow.
- **Duplicate priority tie-breaker 없음**.
- **`[BLOCKED]` 상수 placeholder** — i18n/메시지 정책 합의 필요.
- **`messages` 가 다중인데 응답은 `[0]` 만** — 인터페이스 의도와 불일치(축소 OK 면 명시).
- **`Promise.all` reject path** — 각 catch 가 있지만 `Promise.all` 자체는 throw 안 됨.
- **No 룰의 enabled 필터** — Policy Engine 이 거른다고 신뢰.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) 다운스트림 병렬 호출 + 각자 null fallback. (2) PRD §8.1 단계 1:1 매핑이 코드만 봐도 읽힘. (3) i18n 메시지 폴백 체인이 명료.
- 위험 / Risks: (1) Fail-open 정책 명시 부족. (2) audit 동기 await. (3) 죽은 변수 + tie-breaker 미정의 + 결정 폴백 누락 가능성.
- 개선 권고 / Recommendations: (1) `void this.audit.record(...).catch(...)` 로 fire-and-forget, 응답에 `decisionId` 는 sync 생성(예: ULID) 후 audit 가 보강. (2) `ACTION_TO_DECISION` 의 `'warn'` 폴백을 stderr warn 으로 추적. (3) 동순위 tie-breaker (`createdAt desc`/`ruleId asc`) 명시. (4) Fail-closed 옵션 ENV 추가. (5) 단위 테스트 작성(mock Policy/Detection/Audit).
- 재읽기 권고 레벨 / Suggested re-read level: 4 — 핵심 비즈니스 로직, 테스트 추가 전까지 반복 검토.
