import { CodexOAuthClient, openaiCodexOAuthProvider } from "../auth/codex-oauth.js";
import { OPENAI_CODEX_PROVIDER_ID, apiShapeForProvider } from "../providers.js";
import type { ResearchAnalysis } from "../types.js";
import type { ProviderAdapter, StructuredRequest } from "./adapter.js";

export class OpenAICodexOAuthAdapter implements ProviderAdapter {
  readonly id = OPENAI_CODEX_PROVIDER_ID;

  constructor(private readonly clientFactory: (request?: StructuredRequest<unknown>) => CodexOAuthClient = (request) =>
    new CodexOAuthClient({
      model: request?.model,
      reasoningEffort: request?.reasoningEffort
    })
  ) {}

  async available(): Promise<boolean> {
    const status = await openaiCodexOAuthProvider.status();
    return status.loggedIn;
  }

  async status(): Promise<Record<string, unknown>> {
    const status = await openaiCodexOAuthProvider.status();
    return {
      id: this.id,
      available: status.loggedIn,
      logged_in: status.loggedIn,
      account_id: status.accountId,
      endpoint: status.endpoint,
      api_shape: apiShapeForProvider(this.id),
      capabilities: ["structured_research_analysis", "staged_research_agents"],
      auth_boundary: "Use Idea2Repo-managed Codex OAuth credentials under ~/.idea2repo; never read ~/.codex auth files or browser cookies."
    };
  }

  async structured<T>(request: StructuredRequest<T>): Promise<T> {
    const context = request.context as {
      idea?: string;
      requestedDomains?: string[];
      timelineWeeks?: number;
      resources?: string[];
      stack?: "python" | "ts";
    };
    if (request.schemaName !== "ResearchAnalysis" || !context.idea) {
      throw new Error(`Codex OAuth adapter cannot satisfy structured schema: ${request.schemaName}`);
    }
    const client = this.clientFactory(request as StructuredRequest<unknown>);
    const result = await client.analyzeIdea(context.idea, {
      requestedDomains: context.requestedDomains,
      timelineWeeks: context.timelineWeeks,
      resources: context.resources,
      stack: context.stack,
      progress: request.progress
    });
    return request.validate(result.analysis as ResearchAnalysis);
  }
}
