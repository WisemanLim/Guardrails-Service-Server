# src/clients/policy.client.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: Policy Engine `/policies/bundle` 호출 — compiled rule bundle 획득.
- 진입점에서의 거리 / Distance from entrypoint: 2.
- 라인 수 / LOC: 59.
- 주요 export / Exports: `interface Rule`, `interface CompiledBundle`, `class PolicyClient`.
- 의존 모듈 / Depends on (internal): `../config/runtime`.
- 사용된 외부 패키지 / External packages used: `axios`, `@nestjs/common`.
- 부수효과 / Side effects: HTTP GET 아웃바운드.
- 동시성 모델 / Concurrency model: async.
- 테스트 커버리지 흔적 / Test coverage signal: 없음.

---

```ts path=src/clients/policy.client.ts lines=1-29
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { Runtime } from '../config/runtime';

export interface Rule {
  ruleId: string;
  domain: string;
  locale: string;
  ioType: 'input' | 'output' | 'both';
  category: string;
  subCategory?: string;
  description: string;
  patternType: string;
  patterns?: {
    regex?: string[];
    keywords?: string[];
    entities?: string[];
    luhnCheck?: boolean;
    minContextWindow?: number;
    requiresPersonLink?: boolean;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  priority: number;
  action: string;
  messageTemplate: Record<string, string>;
  regulationTags: string[];
  enabled: boolean;
  version: string;
}
```

**분석 / Analysis (Level 2)**

- **L5-29 `Rule` 인터페이스** — Policy Engine 의 `policy_rules` row 와 1:1 매핑. **camelCase** 라는 점이 detection.client.ts 의 snake_case 와 대조적 — Policy Engine 이 응답 시 변환해 보내거나, REST 측 컨벤션이 다르다(검증 필요).
- **`patterns` 의 모든 하위 필드 미사용** — 본 서버는 패턴 매칭을 다운스트림 Detection Engine 에 위임하므로 `regex` 등은 단순 transit. orchestrator 도 `patterns` 를 직접 읽지 않음. `Pick<Rule, 'ruleId'|'subCategory'|'priority'|'action'|'severity'|'messageTemplate'|'description'>` 로 줄여도 동작.
- **`action: string`** — `ACTION_TO_DECISION` (orchestrator.service.ts) 의 키와 매칭해야 한다. union 타입(`'allow' | 'warn' | ...`)으로 좁히면 컴파일 시 오타 차단 가능.
- **`severity: 'low' | 'medium' | 'high' | 'critical'`** — union. `severityRank` 함수가 이 4값 외엔 0 으로 떨어트림.
- **`enabled: boolean`** — Policy Engine 측에서 이미 필터된 결과를 보낸다고 가정한 듯하나, 본 서버 코드는 `enabled` 를 다시 검사하지 않는다. 잠재 버그 가능성.

```ts path=src/clients/policy.client.ts lines=31-59
export interface CompiledBundle {
  domain: string;
  locale: string;
  ioType: 'input' | 'output' | 'both';
  rules: Rule[];
  version: string;
  evaluatedDomains: string[];
  generatedAt: string;
}

@Injectable()
export class PolicyClient {
  private readonly log = new Logger(PolicyClient.name);
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({ baseURL: Runtime.policyEngineUrl, timeout: 3000 });
  }

  async getBundle(domains: string[], locale: string, ioType: 'input' | 'output'): Promise<CompiledBundle> {
    const params = new URLSearchParams();
    params.set('domains', domains.join(','));
    params.set('locale', locale);
    params.set('ioType', ioType);
    const { data } = await this.http.get<CompiledBundle>(`/policies/bundle?${params.toString()}`);
    return data;
  }
}
```

- **L31-39 `CompiledBundle`** — `evaluatedDomains` 는 server 가 실제로 평가한 도메인 목록. orchestrator 가 응답에 그대로 echo (`evaluatedDomains: bundle?.evaluatedDomains ?? domains`).
- **L42 `log`** — 미사용 (detection 과 동일).
- **L46 `timeout: 3000`** — 중간값.
- **L49 `getBundle(domains, locale, ioType)`** — caller(`OrchestratorService.validate`) 가 `domains` 를 배열로 넘김(`Runtime.enabledDomains` 또는 req.domains). `domains.join(',')` 가 CSV 로 인코딩. **흔한 실수**: 도메인 이름에 `,` 가 포함되면 깨지지만, 운영상 도메인 키 컨벤션이 알파벳/하이픈만 사용한다고 가정.
- **L50-52 `URLSearchParams.set`** — `.set` 은 동일 키를 덮어쓴다. `.append` 가 아니라 의도와 일치. URL 인코딩 자동.
- **L53 `get<CompiledBundle>`** — 응답 검증 없음. caller 가 `.catch(() => null)` 로 무력화.

**짚어볼 점 / Watch-outs**
- `enabled === false` 인 룰을 caller 가 다시 거르지 않음.
- `action: string` 의 union 타입 보강 필요.
- `log` 미사용.
- `domains.join(',')` 에 CSV 가정.
- 응답 스키마 검증 없음.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) URL 빌드를 `URLSearchParams` 로 안전하게 처리. (2) 타입 정의가 명확.
- 위험 / Risks: (1) `Rule.patterns` 의 미사용 필드 표면적 과다. (2) `enabled` 재검증 없음.
- 개선 권고 / Recommendations: (1) `Rule.action` 을 union 타입으로 좁히고 `ACTION_TO_DECISION` 의 키 타입과 정합. (2) 응답 zod 검증. (3) `Rule` 인터페이스를 `Pick` 으로 좁히거나, transit 만 한다는 주석 추가.
- 재읽기 권고 레벨 / Suggested re-read level: 1.
