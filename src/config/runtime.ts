function csv(v: string | undefined, fallback: string): string[] {
  return (v ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const Runtime = {
  port: Number(process.env.PORT ?? 8080),
  apiKey: process.env.GUARDRAILS_API_KEY ?? 'dev-key-please-change',
  policyEngineUrl: process.env.POLICY_ENGINE_URL ?? 'http://127.0.0.1:8082',
  detectionEngineUrl: process.env.DETECTION_ENGINE_URL ?? 'http://127.0.0.1:8081',
  auditServiceUrl: process.env.AUDIT_SERVICE_URL ?? 'http://127.0.0.1:8083',
  redactServiceUrl: process.env.REDACT_SERVICE_URL ?? 'http://127.0.0.1:8085',
  enabledDomains: csv(process.env.GUARDRAILS_ENABLED_DOMAINS, 'global'),
  enabledLocales: csv(process.env.GUARDRAILS_LOCALES, 'ko-KR,en'),
  transport: (process.env.MCP_TRANSPORT ?? 'http').toLowerCase(),
};
