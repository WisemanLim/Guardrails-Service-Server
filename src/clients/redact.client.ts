import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { Runtime } from '../config/runtime';
import type { DetectionMatch } from './detection.client';

/**
 * Calls the Policy Engine's Redact tier (POST /redact, port 8085).
 *
 * Falls back to identity (return original text) on transport failure so that
 * a redact-service outage cannot break the orchestrator pipeline; the higher
 * decision-aggregation layer still chooses block/escalate as needed.
 */
@Injectable()
export class RedactClient {
  private readonly log = new Logger(RedactClient.name);
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({ baseURL: Runtime.redactServiceUrl, timeout: 2000 });
  }

  async redact(text: string, matches: DetectionMatch[]): Promise<string> {
    if (!matches?.length) return text;
    try {
      const { data } = await this.http.post<{ redactedText: string; replacements: number }>(
        '/redact',
        { text, matches },
      );
      return data.redactedText;
    } catch (e) {
      this.log.warn(`redact unavailable: ${(e as Error).message}`);
      return text;
    }
  }
}
