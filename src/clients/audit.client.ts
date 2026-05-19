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
