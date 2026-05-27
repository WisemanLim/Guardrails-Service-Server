# src/orchestrator/redact.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: sub_category → placeholder 매핑으로 문자열의 매치 구간을 치환.
- 진입점에서의 거리 / Distance from entrypoint: 3.
- 라인 수 / LOC: 32.
- 주요 export / Exports: `function redact(text, matches): string`.
- 의존 모듈 / Depends on (internal): `../clients/detection.client` (type only).
- 사용된 외부 패키지 / External packages used: 없음.
- 부수효과 / Side effects: 없음 (pure function).
- 동시성 모델 / Concurrency model: 동기.
- 테스트 커버리지 흔적 / Test coverage signal: `__tests__/redact.spec.ts` 3 case.

---

```ts path=src/orchestrator/redact.ts lines=1-32
import { DetectionMatch } from '../clients/detection.client';

const PLACEHOLDER: Record<string, string> = {
  national_id_kr: '******-*******',
  ssn_us: '***-**-****',
  mynumber_jp: '****-****-****',
  passport: '[PASSPORT]',
  card_number: '[CARD]',
  iban: '[IBAN]',
  email: '[EMAIL]',
  phone_kr: '[PHONE]',
  phone_us: '[PHONE]',
  business_reg_kr: '[BRN]',
  driver_license_kr: '[DL]',
  ip_address: '[IP]',
  api_key: '[SECRET]',
};

/**
 * Replace each match with its category-aware placeholder. Walk right-to-left
 * so we don't have to fix up offsets after each replacement.
 */
export function redact(text: string, matches: DetectionMatch[]): string {
  if (!matches.length) return text;
  const sorted = [...matches].sort((a, b) => b.start - a.start);
  let out = text;
  for (const m of sorted) {
    const ph = PLACEHOLDER[m.sub_category] ?? '[REDACTED]';
    out = out.slice(0, m.start) + ph + out.slice(m.end);
  }
  return out;
}
```

**분석 / Analysis (Level 2)**

- **L3-17 `PLACEHOLDER` 맵** — sub_category → 치환 문자열. KR/JP/US 의 ID 형태는 마스킹 패턴(`*` + `-`) 그대로, 나머지는 `[CATEGORY]` 토큰. **흔한 실수**: 다국가 도메인이 추가될 때 이 맵을 깜박 — fallback `'[REDACTED]'` 로 떨어져 동작은 하지만 정보 손실. 향후 새 sub_category 추가 시 컴파일 시점 차단(`as const` + sub_category union type) 가능.
- **L24 `if (!matches.length) return text`** — 빠른 경로.
- **L25 `[...matches].sort((a, b) => b.start - a.start)`** — copy + 내림차순 정렬. **흔한 실수 회피 성공**: 원본 mutate 안 함, 그리고 오른쪽부터 치환해야 offset 보정 불필요. comment 와 코드 일치.
- **L26-29 for 루프** — `text.slice(0, start) + ph + text.slice(end)` 패턴. half-open interval `[start, end)` 가정 — DetectionMatch 의 정의와 일치하는지 검증 필요(spec.ts 에서 `end - start === matched_text.length` 라 일치).
- **L28 `PLACEHOLDER[m.sub_category] ?? '[REDACTED]'`** — `null`/`undefined` 둘 다 fallback. `''` 빈 문자열은 그대로 사용(맵에 빈 문자열을 넣지 않으면 무관).
- **엣지 케이스**:
  - 겹치는 매치(`a.start < b.start && a.end > b.start`): 정렬 후 오른쪽이 먼저 치환되지만 왼쪽 치환 시 이미 변형된 `out` 의 인덱스를 쓰지 않고 `text` 의 원래 인덱스를 쓴다(`out.slice(0, m.start)`) — **L29 의 `out.slice(0, m.start)` 가 `out` 을 쓰지만 인덱스는 원본 `text` 기준**. 오른쪽부터 치환 + 치환된 길이만큼 *오른쪽 인덱스*는 더이상 사용되지 않음 → 정렬 + 비겹침이라면 올바르지만 **겹치는 매치는 깨진다**. 현재 spec 은 겹침 미커버.
  - 빈 매치(start === end): `out.slice(0, s) + ph + out.slice(s)` 로 ph 삽입.
  - start < 0 또는 end > text.length: slice 가 clamp 처리.

**짚어볼 점 / Watch-outs**
- **겹치는 매치 미정의 동작** — Detection Engine 이 dedup 한다는 가정. 명시 주석 필요.
- **PLACEHOLDER 추가 시 컴파일 가드 없음**.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) pure function. (2) R→L 정렬로 offset 안정. (3) 테스트 존재.
- 위험 / Risks: (1) 겹침 미정의. (2) `[REDACTED]` 폴백이 새 카테고리에서 silently 발생.
- 개선 권고 / Recommendations: (1) 정렬 후 `start ≤ prev.end` (정렬은 desc 이므로 `m.end <= prev.start`) 검사로 겹침 경고. (2) sub_category 를 union 타입으로 좁히고 exhaustive switch.
- 재읽기 권고 레벨 / Suggested re-read level: 1.
