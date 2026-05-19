import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PolicyClient, Rule } from '../clients/policy.client';
import { DetectionClient, DetectionMatch } from '../clients/detection.client';
import { AuditClient } from '../clients/audit.client';
import { Runtime } from '../config/runtime';
import { redact } from './redact';
import { Decision, ValidateRequest, ValidateResponse } from './types';

const ACTION_TO_DECISION: Record<string, Decision> = {
  allow: 'allow',
  warn: 'warn',
  add_disclaimer: 'warn',
  sanitize: 'sanitize',
  redact: 'redact',
  block_or_redact: 'block',
  block_or_pseudonymize: 'block',
  block: 'block',
  refuse: 'block',
  aggregate_only: 'redact',
  escalate: 'escalate',
  route: 'redact',
};

const DECISION_RANK: Record<Decision, number> = {
  allow: 0,
  warn: 1,
  sanitize: 2,
  redact: 3,
  block: 4,
  escalate: 5,
};

@Injectable()
export class OrchestratorService {
  private readonly log = new Logger(OrchestratorService.name);

  constructor(
    private readonly policy: PolicyClient,
    private readonly detection: DetectionClient,
    private readonly audit: AuditClient,
  ) {}

  async validate(req: ValidateRequest, ioType: 'input' | 'output'): Promise<ValidateResponse> {
    const start = Date.now();
    const domains = req.domains ?? (req.domain ? [req.domain] : Runtime.enabledDomains);
    const locale = req.locale ?? Runtime.enabledLocales[0] ?? 'ko-KR';
    const text = req.text ?? '';

    const [bundle, detection] = await Promise.all([
      this.policy.getBundle(domains, locale, ioType).catch((e) => {
        this.log.warn(`policy unavailable: ${(e as Error).message}`);
        return null;
      }),
      this.detection.detect(text, domains[domains.length - 1] ?? 'global', locale, ioType).catch((e) => {
        this.log.warn(`detection unavailable: ${(e as Error).message}`);
        return null;
      }),
    ]);

    const matches: DetectionMatch[] = detection?.matches ?? [];
    const normalized = detection?.normalized_text ?? text;
    const rules = bundle?.rules ?? [];

    // Map each detection match to the most-strict applicable rule by sub_category.
    const byCat = indexRulesBySubCategory(rules);
    let decision: Decision = 'allow';
    const matchedRuleIds = new Set<string>();
    const categories = new Set<string>();
    let highestSeverity = 0;
    let messages: string[] = [];

    for (const m of matches) {
      categories.add(`${m.category}.${m.sub_category}`);
      const rule = byCat.get(m.sub_category);
      if (!rule) continue;
      matchedRuleIds.add(rule.ruleId);
      const mapped: Decision = ACTION_TO_DECISION[rule.action] ?? 'warn';
      if (DECISION_RANK[mapped] > DECISION_RANK[decision]) {
        decision = mapped;
        highestSeverity = severityRank(rule.severity);
      }
      const msg = rule.messageTemplate[locale] ?? rule.messageTemplate.en ?? rule.description;
      if (msg) messages.push(msg);
    }

    // No rule binding but raw detection signal present → default to redact for output, warn for input.
    if (decision === 'allow' && matches.length) {
      decision = ioType === 'output' ? 'redact' : 'warn';
    }

    const redactedText = decision === 'block' || decision === 'escalate'
      ? '[BLOCKED]'
      : matches.length
      ? redact(normalized, matches)
      : normalized;

    const latencyMs = Date.now() - start;
    const textHash = createHash('sha256').update(text).digest('hex');
    const auditResult = await this.audit.record({
      tenantId: req.tenantId,
      sessionId: req.sessionId,
      domain: domains[domains.length - 1] ?? 'global',
      locale,
      ioType,
      textHash,
      decision,
      riskScore: detection?.risk_score ?? 0,
      matchedRules: [...matchedRuleIds],
      categories: [...categories],
      policyVersion: bundle?.version,
      latencyMs,
    });

    return {
      decision,
      riskScore: detection?.risk_score ?? 0,
      matchedRules: [...matchedRuleIds],
      categories: [...categories],
      normalizedText: normalized,
      redactedText,
      message:
        messages[0] ??
        (decision === 'allow' ? '' : '입력에 민감정보가 포함되어 있습니다. / Sensitive content detected.'),
      policyVersion: bundle?.version ?? '0.0.0',
      decisionId: auditResult?.decisionId ?? `local-${Date.now()}`,
      evaluatedDomains: bundle?.evaluatedDomains ?? domains,
      latencyMs,
    };
  }

  async sanitize(req: ValidateRequest, ioType: 'input' | 'output'): Promise<{ normalizedText: string; redactedText: string }> {
    const locale = req.locale ?? Runtime.enabledLocales[0] ?? 'ko-KR';
    const domains = req.domains ?? (req.domain ? [req.domain] : Runtime.enabledDomains);
    const detection = await this.detection
      .detect(req.text, domains[domains.length - 1] ?? 'global', locale, ioType)
      .catch(() => null);
    const normalized = detection?.normalized_text ?? req.text;
    const redactedText = detection?.matches?.length ? redact(normalized, detection.matches) : normalized;
    return { normalizedText: normalized, redactedText };
  }
}

function indexRulesBySubCategory(rules: Rule[]): Map<string, Rule> {
  const out = new Map<string, Rule>();
  // Highest priority wins (rules are sorted desc but we re-check defensively).
  for (const r of rules) {
    if (!r.subCategory) continue;
    const cur = out.get(r.subCategory);
    if (!cur || r.priority > cur.priority) out.set(r.subCategory, r);
  }
  return out;
}

function severityRank(s: string): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[s] ?? 0;
}
