# src/clients/detection.client.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: Detection Engine 호출 — `/detect`(필수), `/normalize`(미사용).
- 진입점에서의 거리 / Distance from entrypoint: 2.
- 라인 수 / LOC: 48.
- 주요 export / Exports: `interface DetectionMatch`, `interface DetectionResult`, `class DetectionClient`.
- 의존 모듈 / Depends on (internal): `../config/runtime`.
- 사용된 외부 패키지 / External packages used: `axios`, `@nestjs/common`.
- 부수효과 / Side effects: HTTP POST 아웃바운드.
- 동시성 모델 / Concurrency model: async.
- 테스트 커버리지 흔적 / Test coverage signal: 없음. (`DetectionMatch` 는 redact.spec.ts 에서 fixture 로 사용)

---

```ts path=src/clients/detection.client.ts lines=1-22
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { Runtime } from '../config/runtime';

export interface DetectionMatch {
  detector_id: string;
  category: string;
  sub_category: string;
  locale: string;
  start: number;
  end: number;
  matched_text: string;
  confidence: number;
  rule_hint?: string;
}

export interface DetectionResult {
  normalized_text: string;
  matches: DetectionMatch[];
  risk_score: number;
  categories: string[];
}
```

**분석 / Analysis (Level 2)**

- **L5-15 `DetectionMatch`** — snake_case 필드. 다운스트림(Python) Detection Engine 의 응답 형태를 그대로 transit. 본 서버 코드는 이 snake_case 를 그대로 redact.ts, orchestrator.service 가 소비한다.
- **`rule_hint?`** — 미사용 (코드 내 참조 없음). 다운스트림이 보내올 가능성을 위해 둠.
- **L17-22 `DetectionResult`** — `risk_score` 와 `categories` 둘 다 transit. `categories` 는 string 배열 (예: `'pii.national_id_kr'`) 이지만 orchestrator 는 `m.category + '.' + m.sub_category` 로 자체 구성하므로 이 필드는 사용되지 않음(orchestrator.service.ts:74). 검증 필요.

```ts path=src/clients/detection.client.ts lines=24-48
@Injectable()
export class DetectionClient {
  private readonly log = new Logger(DetectionClient.name);
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({ baseURL: Runtime.detectionEngineUrl, timeout: 5000 });
  }

  async detect(text: string, domain: string, locale: string, ioType: 'input' | 'output'): Promise<DetectionResult> {
    const { data } = await this.http.post<DetectionResult>('/detect', {
      text,
      domain,
      locale,
      io_type: ioType,
    });
    return data;
  }

  async normalize(text: string, locale: string): Promise<{ normalized_text: string }> {
    const { data } = await this.http.post<{ normalized_text: string }>('/normalize', { text, locale });
    return data;
  }
}
```

- **L26 `private readonly log`** — `log` 가 선언만 되고 사용되지 않음. 향후 디버깅용으로 둔 듯. 린트가 켜져 있다면 `noUnusedLocals` 가 catch 하겠지만 클래스 private 라 무시될 수 있다.
- **L30 `Runtime.detectionEngineUrl`** — 모듈 로드 시 한 번 평가된 값. 런타임 변경 불가.
- **L30 `timeout: 5000`** — 가장 김. 정규식/regex 엔진의 지연을 감안. timeout 초과 시 axios 가 reject 하고 caller(Orchestrator) 가 `.catch(() => null)` 로 무력화.
- **L33-40 `detect()`** — payload 키가 `io_type` (snake) 인데 caller(`orchestrator.service.ts:55`) 는 `'input'/'output'` 을 그대로 넘김. snake 변환은 여기서만.
- **L42-45 `normalize()`** — **미사용**. grep 결과 호출자 없음. 향후 sanitize 경로 분리 또는 dead code.
- 응답 검증 없음 — `as DetectionResult` (사실 타입 파라미터 only) → 다운스트림이 형태를 바꾸면 런타임 폭발.

**짚어볼 점 / Watch-outs**
- `normalize()` dead code 가능성.
- 응답 스키마 미검증.
- `log` 미사용.
- caller 가 `.catch(() => null)` 로 무력화 — 부분 outage 시 결정이 “allow + redact warn 룰만” 으로 약해진다(orchestrator 분기 참조).

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) 타입 인터페이스가 다운스트림 응답과 1:1 매핑. (2) timeout 명시.
- 위험 / Risks: (1) dead method. (2) 응답 schema 단언 only.
- 개선 권고 / Recommendations: (1) zod schema 로 응답 검증. (2) `normalize` 제거 또는 sanitize 경로에 연결. (3) `log` 활용(요청-응답 latency 로그) 또는 제거.
- 재읽기 권고 레벨 / Suggested re-read level: 1.
