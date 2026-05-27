# src/orchestrator/__tests__/redact.spec.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: `redact()` 단위 테스트 3 case (basic, prefix/suffix, multiple non-overlapping).
- 진입점에서의 거리 / Distance from entrypoint: n/a (테스트).
- 라인 수 / LOC: 63.
- 주요 export / Exports: 없음 (Jest spec).
- 의존 모듈 / Depends on (internal): `../redact`.
- 사용된 외부 패키지 / External packages used: jest (`describe`, `it`, `expect`).
- 부수효과 / Side effects: 없음.
- 동시성 모델 / Concurrency model: 동기.
- 테스트 커버리지 흔적 / Test coverage signal: 본인이 테스트.

---

```ts path=src/orchestrator/__tests__/redact.spec.ts lines=1-21
import { redact } from '../redact';

describe('redact', () => {
  it('replaces by sub_category placeholder', () => {
    const text = '제 주민등록번호는 900101-1234567 입니다.';
    const out = redact(text, [
      {
        detector_id: 'pii.id.rrn.kr',
        category: 'pii',
        sub_category: 'national_id_kr',
        locale: 'ko-KR',
        start: 11,
        end: 25,
        matched_text: '900101-1234567',
        confidence: 0.98,
      },
    ]);
    expect(out).toContain('******-*******');
    expect(out).not.toContain('900101-1234567');
  });
```

**분석 / Analysis (Level 2)**

- **L1 `import { redact }`** — pure function 직접 테스트. Nest DI 우회.
- **L4-20 case 1** — KO 문장에서 RRN 패턴 redact. `start=11, end=25` 가 `900101-1234567`(14 char) 와 정합한지 확인: `'제 주민등록번호는 '`. JS 의 .length 는 UTF-16 code unit 기준. `'제'` 1, `' '` 0(없음), 실제로 보면 `'제 주민등록번호는 '` — '제' + ' ' + '주민등록번호' + '는' + ' ' = 1+1+6+1+1 = 10. 그래서 11 부터는 RRN 시작 한 글자 어긋남(원본 fixture 가 11 이지만 실제 검증은 `toContain` 라 위치 정확성 미검증). **흔한 실수 노출**: 한국어 문자열 offset 계산 시 emoji/surrogate-pair 가 있으면 .length 와 grapheme 카운트가 어긋남. 본 fixture 는 BMP 한자만이라 안전하지만, Detection Engine 측 offset 정의 명세 필요.
- L18-19 `toContain` / `not.toContain` — 위치 미검증, 내용만. 약한 assertion.

```ts path=src/orchestrator/__tests__/redact.spec.ts lines=22-37
  it('preserves non-match prefix/suffix', () => {
    const out = redact('Email: user@example.com please', [
      {
        detector_id: 'pii.contact.email',
        category: 'pii',
        sub_category: 'email',
        locale: 'en',
        start: 7,
        end: 23,
        matched_text: 'user@example.com',
        confidence: 0.95,
      },
    ]);
    expect(out).toBe('Email: [EMAIL] please');
  });
```

- **L22-36 case 2** — 영어 문장. offset 0-based ASCII 라 정확히 검증 가능. `start=7, end=23` 가 `'user@example.com'` (16 chars) 와 정합: `Email: ` (7 chars) + `user@example.com` (16) → 7..23. OK.
- L36 `expect(out).toBe(...)` — strict equality. 강한 assertion.

```ts path=src/orchestrator/__tests__/redact.spec.ts lines=38-63
  it('handles overlapping-free right-to-left order', () => {
    const out = redact('a 010-1234-5678 and 010-2222-3333 done', [
      {
        detector_id: 'pii.contact.phone.kr',
        category: 'pii',
        sub_category: 'phone_kr',
        locale: 'ko-KR',
        start: 2,
        end: 15,
        matched_text: '010-1234-5678',
        confidence: 0.95,
      },
      {
        detector_id: 'pii.contact.phone.kr',
        category: 'pii',
        sub_category: 'phone_kr',
        locale: 'ko-KR',
        start: 20,
        end: 33,
        matched_text: '010-2222-3333',
        confidence: 0.95,
      },
    ]);
    expect(out).toBe('a [PHONE] and [PHONE] done');
  });
});
```

- **L38-62 case 3** — 2개 매치 비겹침. 입력에서 fixture 가 *오름차순* (start 2, 20) 으로 들어옴. `redact` 가 내림차순 정렬해 오른쪽부터 치환. 결과는 두 phone 모두 `[PHONE]` 토큰으로 — 두 매치가 모두 동일 sub_category 라 같은 placeholder. PHONE 토큰이 reverse 후에도 두 곳 다 표시되는지가 핵심 verification.
- **누락된 케이스**:
  - 빈 matches → 원본 그대로.
  - 알 수 없는 sub_category → `[REDACTED]` 폴백.
  - 겹치는 매치 (a.end > b.start) — 동작 미정의지만 fixture 로 명문화하면 회귀 방지.
  - 매치가 start === end (zero-width) — placeholder 삽입.
  - 매치가 end > text.length — slice clamp 동작.

**짚어볼 점 / Watch-outs**
- **`toContain` 만 사용한 case 1** — 정확한 결과 비교가 아니라 약한 assertion.
- **fallback 케이스 미검증**.
- **multi-byte/surrogate** offset 검증 없음.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) 핵심 시나리오(단일/연속) 커버. (2) `toBe` 로 강한 assertion 1개 이상.
- 위험 / Risks: (1) 엣지 케이스 부재. (2) `[REDACTED]` 폴백 미테스트.
- 개선 권고 / Recommendations: (1) `it.each` 로 단일 sub_category 별 expectation 표 추가. (2) 겹침 fixture 추가(현 동작 명시 또는 throw). (3) 0 매치 / 0-width / end-out-of-range case 추가.
- 재읽기 권고 레벨 / Suggested re-read level: 1.
