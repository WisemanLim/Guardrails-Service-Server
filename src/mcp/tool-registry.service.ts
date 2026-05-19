import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { PolicyClient } from '../clients/policy.client';
import { Runtime } from '../config/runtime';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
}

const ValidateInputSchema = z.object({
  text: z.string(),
  domain: z.string().optional(),
  domains: z.array(z.string()).optional(),
  locale: z.string().optional(),
  userRole: z.string().optional(),
  channel: z.string().optional(),
  sessionId: z.string().optional(),
  tenantId: z.string().optional(),
});

const BundleSchema = z.object({
  domain: z.string().optional(),
  domains: z.array(z.string()).optional(),
  locale: z.string(),
  ioType: z.enum(['input', 'output']),
});

const ExplainSchema = z.object({ decisionId: z.string() });

@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, McpTool>();

  constructor(private readonly orchestrator: OrchestratorService, private readonly policy: PolicyClient) {
    this.register({
      name: 'validate_input',
      description: 'Evaluate guardrails on a user-supplied prompt before LLM invocation.',
      inputSchema: ValidateInputSchema.shape as unknown as Record<string, unknown>,
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        return this.orchestrator.validate(parsed, 'input');
      },
    });

    this.register({
      name: 'validate_output',
      description: 'Evaluate guardrails on a model-generated response before delivery.',
      inputSchema: ValidateInputSchema.shape as unknown as Record<string, unknown>,
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        return this.orchestrator.validate(parsed, 'output');
      },
    });

    this.register({
      name: 'sanitize_input',
      description: 'Return a normalized/redacted version of the input without a decision.',
      inputSchema: ValidateInputSchema.shape as unknown as Record<string, unknown>,
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        return this.orchestrator.sanitize(parsed, 'input');
      },
    });

    this.register({
      name: 'redact_output',
      description: 'Return a redacted version of the output text.',
      inputSchema: ValidateInputSchema.shape as unknown as Record<string, unknown>,
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        return this.orchestrator.sanitize(parsed, 'output');
      },
    });

    this.register({
      name: 'classify_privacy',
      description: 'Classify which PII categories appear in the input without enforcing an action.',
      inputSchema: ValidateInputSchema.shape as unknown as Record<string, unknown>,
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        const result = await this.orchestrator.validate(parsed, 'input');
        return { categories: result.categories, riskScore: result.riskScore };
      },
    });

    this.register({
      name: 'get_policy_bundle',
      description: 'Return the compiled policy bundle for a (domains, locale, ioType) triple.',
      inputSchema: BundleSchema.shape as unknown as Record<string, unknown>,
      handler: async (args) => {
        const parsed = BundleSchema.parse(args);
        const domains = parsed.domains ?? (parsed.domain ? [parsed.domain] : Runtime.enabledDomains);
        return this.policy.getBundle(domains, parsed.locale, parsed.ioType);
      },
    });

    this.register({
      name: 'explain_decision',
      description: 'Look up the audit record for a prior decisionId.',
      inputSchema: ExplainSchema.shape as unknown as Record<string, unknown>,
      handler: async (args) => {
        const parsed = ExplainSchema.parse(args);
        // Audit Service exposes /events/:id; we surface its raw row.
        const { default: axios } = await import('axios');
        const res = await axios.get(`${Runtime.auditServiceUrl}/events/${parsed.decisionId}`, { timeout: 2000 });
        return res.data;
      },
    });

    this.register({
      name: 'health_check',
      description: 'Return service health and enabled-domain configuration.',
      inputSchema: {},
      handler: async () => ({
        status: 'ok',
        enabledDomains: Runtime.enabledDomains,
        enabledLocales: Runtime.enabledLocales,
        transport: Runtime.transport,
      }),
    });
  }

  register(tool: McpTool): void {
    this.tools.set(tool.name, tool);
  }

  list(): McpTool[] {
    return [...this.tools.values()];
  }

  get(name: string): McpTool | undefined {
    return this.tools.get(name);
  }
}
