export type Decision =
  | 'allow'
  | 'warn'
  | 'redact'
  | 'sanitize'
  | 'block'
  | 'escalate';

export interface ValidateRequest {
  text: string;
  domain?: string;
  domains?: string[];
  locale?: string;
  userRole?: string;
  channel?: string;
  sessionId?: string;
  tenantId?: string;
}

export interface ValidateResponse {
  decision: Decision;
  riskScore: number;
  matchedRules: string[];
  categories: string[];
  normalizedText: string;
  redactedText: string;
  message: string;
  policyVersion: string;
  decisionId: string;
  evaluatedDomains: string[];
  latencyMs: number;
}
