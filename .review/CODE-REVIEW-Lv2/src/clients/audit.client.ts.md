# src/clients/audit.client.ts — 코드 리뷰

> 리뷰 레벨: 2
> [← INDEX.md](../../INDEX.md)

**파일 요약 / File Summary**
- 역할 / Role: Audit Service `/events` 에 결정 이벤트 적재. 실패는 절대 caller 를 깨뜨리지 않음.
- 진입점에서의 거리 / Distance from entrypoint: 2.
- 라인 수 / LOC: 41.
- 주요 export / Exports: `interface AuditEvent`, `class AuditClient`.
- 의존 모듈 / Depends on (internal): `../config/runtime`.
- 사용된 외부 패키지 / External packages used: `axios`, `@nestjs/common`.
- 부수효과 / Side effects: HTTP POST 아웃바운드, `log.warn`.
- 동시성 모델 / Concurrency model: async, fire-and-may-fail-silently.
- 테스트 커버리지 흔적 / Test coverage signal: 없음.

---

```ts path=src/clients/audit.client.ts lines=1-20
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { Runtime } from '../config/runtime';

export interface AuditEvent {
  decisionId?: string;
  tenantId?: string;
  sessionId?: string;
  domain: string;
  locale: string;
  ioType: 'input' | 'output' | 'both';
  textHash: string;
  decision: string;
  riskScore: number;
  matchedRules: string[];
  categories: string[];
  policyVersion?: string;
  latencyMs?: number;
}
```

**분석 / Analysis (Level 2)**

- **L5-19 `AuditEvent` 인터페이스** — 호출 직전 OrchestratorService 가 작성. `decisionId?` 가 optional 이지만 실 코드에서는 작성하지 않는다(Audit Service 가 부여한 ID 를 응답으로 받음). 미사용 필드라면 제거하거나 “server-assigned” 주석을 다는 게 명확.
- **`decision: string`** — orchestrator/types.ts 의 `Decision` union 과 정합되지 않음(여기선 string). client 가 strongly typed 면 좋다.
- **`ioType: 'input' | 'output' | 'both'`** — `'both'` 가 등장하지만 본 서버 코드에서 `'both'` 를 작성하는 경로 없음(orchestrator 가 `'input' | 'output'` 만 사용). Audit Service 측 요구로 보임.

```ts path=src/clients/audit.client.ts lines=21-41
@Injectable()
export class AuditClient {
  private readonly log = new Logger(AuditClient.name);
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({ baseURL: Runtime.auditServiceUrl, timeout: 2000 });
  }

  async record(event: AuditEvent): Promise<{ decisionId: string } | null> {
    try {
      const { data } = await this.http.post<{ decisionId: string }>('/events', event);
      return data;
    } catch (e) {
      // Audit failure must never break a request — log and drop.
      this.log.warn(`audit drop: ${(e as Error).message}`);
      return null;
    }
  }
}
```

- **L26-28 생성자**: `axios.create` 한 번. 인스턴스 재사용으로 connection keep-alive 이득. timeout 2000ms — 가장 짧다 (policy 3000, detection 5000). audit 가 결정 후 적재이므로 빠르게 포기.
- **L30 `record(event)`** — 단일 entry. caller(`OrchestratorService.validate`) 는 `await` 하지만 실패해도 응답이 `null` 이므로 코드 흐름이 깨지지 않는다. **흔한 실수**: caller 가 `auditResult?.decisionId ?? local-${Date.now()}` 로 폴백 ID 를 만든다(orchestrator.service.ts:126). 이 ID 는 audit 에 존재하지 않으므로 `explain_decision` 호출 시 404 가 난다. 부수효과 문서화 필요.
- **L31-33 try/catch + `return data`** — axios `data` 가 비정상 응답이라도 형태가 `{ decisionId: ... }` 가 아닐 수 있다(타입 단언만). 다운스트림이 갑자기 다른 형태를 반환하면 caller 가 `.decisionId` 접근 시 undefined.
- **L34-37 swallow**: 의도 분명. 다만 *반복 실패* 의 빈도 측정/알람 없음 → SRE 관점에서는 metrics 카운터(Prometheus 등) 필요.

**짚어볼 점 / Watch-outs**
- 폴백 `decisionId` (`local-${ts}`) 가 audit 에 존재하지 않아 `explain_decision` 미스 — 의도/주의가 어디에도 없음.
- 응답 스키마 단언 only — zod parse 권장.
- 재시도 없음. POST `/events` 가 504 면 그대로 drop.
- 비동기 throttle 없음 — burst 시 audit service 가 죽을 수 있음.

---

**파일 수준 평가 / File-Level Verdict**
- 강점 / Strengths: (1) 실패가 caller 를 깨뜨리지 않는다는 정책이 코드와 주석으로 일치. (2) timeout 명시.
- 위험 / Risks: (1) `local-${ts}` 폴백 ID 의 의미 누설 부족. (2) 응답 스키마 미검증. (3) 실패 metric 부재.
- 개선 권고 / Recommendations: (1) zod schema 로 응답 parse (실패 시 null 반환). (2) Prometheus counter (audit_drops_total) 또는 최소한 일정 임계치마다 `log.error`. (3) 재시도(p=2회, exponential) — idempotency 보장 후.
- 재읽기 권고 레벨 / Suggested re-read level: 2.
