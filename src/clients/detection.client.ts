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
