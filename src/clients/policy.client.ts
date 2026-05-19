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
