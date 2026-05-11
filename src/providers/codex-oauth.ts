import { CodexOAuthClient, openaiCodexOAuthProvider } from "../auth/codex-oauth.js";
import { OPENAI_CODEX_PROVIDER_ID, apiShapeForProvider } from "../providers.js";
import { throwIfAborted } from "../runtime/abort.js";
import type { ResearchAnalysis } from "../types.js";
import type { ProviderAdapter, StructuredRequest } from "./adapter.js";
import type { IdeaBrief, SearchPlan, CandidateTriage, PdfPaperNote, RelatedWorkAnalysis, NoveltyGapAnalysis, StrictCcfAReview, FeasibilityReview, ResearchStrategy } from "../agents/schemas.js";

export class OpenAICodexOAuthAdapter implements ProviderAdapter {
  readonly id = OPENAI_CODEX_PROVIDER_ID;

  constructor(private readonly clientFactory: (request?: StructuredRequest<unknown>) => CodexOAuthClient = (request) =>
    new CodexOAuthClient({
      model: request?.model,
      reasoningEffort: request?.reasoningEffort,
      signal: request?.signal
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
    throwIfAborted(request.signal);
    const context = request.context as {
      idea?: string;
      requestedDomains?: string[];
      timelineWeeks?: number;
      resources?: string[];
      stack?: "python" | "ts";
    };
    const client = this.clientFactory(request as StructuredRequest<unknown>);
    if (request.schemaName !== "ResearchAnalysis") {
      const result = await runStagedStructured(client, request);
      throwIfAborted(request.signal);
      return result;
    }
    if (!context.idea) throw new Error(`Codex OAuth adapter cannot satisfy structured schema: ${request.schemaName}`);
    const result = await client.analyzeIdea(context.idea, {
      requestedDomains: context.requestedDomains,
      timelineWeeks: context.timelineWeeks,
      resources: context.resources,
      stack: context.stack,
      progress: request.progress
    });
    const parsed = request.validate(result.analysis as ResearchAnalysis);
    throwIfAborted(request.signal);
    return parsed;
  }
}

async function runStagedStructured<T>(client: CodexOAuthClient, request: StructuredRequest<T>): Promise<T> {
  const context = request.context as Record<string, unknown>;
  const idea = String(context.idea ?? "");
  switch (request.schemaName) {
    case "IdeaBrief":
      return request.validate((await client.intakeIdea(idea, context, request.progress)).idea_brief as IdeaBrief);
    case "SearchPlan":
      return request.validate((await client.planLiteratureSearch(idea, context, request.progress)).search_plan as SearchPlan);
    case "CandidateTriage":
      return request.validate((await client.triagePaperCandidates(idea, context.candidates as unknown[] ?? [], request.progress)).triage as CandidateTriage);
    case "PdfPaperNote":
      return request.validate((await client.readPaperPdf(idea, context.paper, context.chunks as unknown[] ?? [], request.progress)).paper_note as PdfPaperNote);
    case "RelatedWorkAnalysis":
      return request.validate((await client.analyzeRelatedWork(idea, context.paper_notes as unknown[] ?? [], request.progress)).related_work as RelatedWorkAnalysis);
    case "NoveltyGapAnalysis":
      return request.validate((await client.analyzeNovelty(idea, context.related_work, request.progress)).novelty as NoveltyGapAnalysis);
    case "StrictCcfAReview":
      return request.validate((await client.scoreCcfA(idea, context.evidence, request.progress)).scorecard as StrictCcfAReview);
    case "FeasibilityReview":
      return request.validate((await client.reviewFeasibility(idea, context.constraints, request.progress)).feasibility as FeasibilityReview);
    case "ResearchStrategy":
      return request.validate((await client.refineIdea(idea, context.review_context, request.progress)).strategy as ResearchStrategy);
    default:
      throw new Error(`Codex OAuth adapter cannot satisfy structured schema: ${request.schemaName}`);
  }
}
