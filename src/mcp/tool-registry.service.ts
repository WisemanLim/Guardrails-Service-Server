import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { PolicyClient } from '../clients/policy.client';
import { Runtime } from '../config/runtime';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
}

// ── zod schemas — single source of truth for both runtime parsing and the
//    MCP-facing JSON Schema advertised in tools/list.inputSchema. ───────────
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

const EmptySchema = z.object({});

/**
 * Convert a zod schema to a JSON Schema object suitable for the MCP
 * `tools/list` response. `$refStrategy: 'none'` inlines everything so the
 * client sees a flat, self-contained schema (no `$ref`/`definitions`).
 */
function jsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Cast the call to avoid TS2589 (zod-to-json-schema's generic over the zod
  // type instantiates excessively deep on nested/optional unions).
  const convert = zodToJsonSchema as (s: unknown, opts?: unknown) => Record<string, unknown>;
  const out = convert(schema, { target: 'jsonSchema7', $refStrategy: 'none' });
  delete (out as { $schema?: unknown }).$schema;
  return out;
}

@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, McpTool>();

  constructor(private readonly orchestrator: OrchestratorService, private readonly policy: PolicyClient) {
    this.register({
      name: 'validate_input',
      description: 'Evaluate guardrails on a user-supplied prompt before LLM invocation.',
      inputSchema: jsonSchema(ValidateInputSchema),
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        return this.orchestrator.validate(parsed, 'input');
      },
    });

    this.register({
      name: 'validate_output',
      description: 'Evaluate guardrails on a model-generated response before delivery.',
      inputSchema: jsonSchema(ValidateInputSchema),
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        return this.orchestrator.validate(parsed, 'output');
      },
    });

    this.register({
      name: 'sanitize_input',
      description: 'Return a normalized/redacted version of the input without a decision.',
      inputSchema: jsonSchema(ValidateInputSchema),
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        return this.orchestrator.sanitize(parsed, 'input');
      },
    });

    this.register({
      name: 'redact_output',
      description: 'Return a redacted version of the output text.',
      inputSchema: jsonSchema(ValidateInputSchema),
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        return this.orchestrator.sanitize(parsed, 'output');
      },
    });

    this.register({
      name: 'classify_privacy',
      description: 'Classify which PII categories appear in the input without enforcing an action.',
      inputSchema: jsonSchema(ValidateInputSchema),
      handler: async (args) => {
        const parsed = ValidateInputSchema.parse(args);
        const result = await this.orchestrator.validate(parsed, 'input');
        return { categories: result.categories, riskScore: result.riskScore };
      },
    });

    this.register({
      name: 'get_policy_bundle',
      description: 'Return the compiled policy bundle for a (domains, locale, ioType) triple.',
      inputSchema: jsonSchema(BundleSchema),
      handler: async (args) => {
        const parsed = BundleSchema.parse(args);
        const domains = parsed.domains ?? (parsed.domain ? [parsed.domain] : Runtime.enabledDomains);
        return this.policy.getBundle(domains, parsed.locale, parsed.ioType);
      },
    });

    this.register({
      name: 'explain_decision',
      description: 'Look up the audit record for a prior decisionId.',
      inputSchema: jsonSchema(ExplainSchema),
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
      inputSchema: jsonSchema(EmptySchema),
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
