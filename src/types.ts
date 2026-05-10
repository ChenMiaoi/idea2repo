import { Type, type Static } from "@sinclair/typebox";
import Ajv from "ajv";

export const ScoreAssessmentSchema = Type.Object(
  {
    total: Type.Integer({ minimum: 0, maximum: 100 }),
    rationale: Type.String({ minLength: 1 }),
    cap_reasons: Type.Optional(Type.Array(Type.String()))
  },
  { additionalProperties: false }
);

export const DomainRouteAnalysisSchema = Type.Object(
  {
    key: Type.String({ minLength: 1 }),
    label: Type.String({ minLength: 1 }),
    candidate_venues: Type.Optional(Type.Array(Type.String())),
    rationale: Type.String({ minLength: 1 })
  },
  { additionalProperties: false }
);

export const PaperClusterSchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    core_problem: Type.String({ minLength: 1 }),
    method_pattern: Type.String({ minLength: 1 }),
    representative_papers: Type.Optional(Type.Array(Type.String())),
    collision_risk: Type.String({ minLength: 1 }),
    verification_queries: Type.Optional(Type.Array(Type.String()))
  },
  { additionalProperties: false }
);

export const ExperimentPlanSchema = Type.Object(
  {
    baselines: Type.Optional(Type.Array(Type.String())),
    datasets: Type.Optional(Type.Array(Type.String())),
    metrics: Type.Optional(Type.Array(Type.String())),
    ablations: Type.Optional(Type.Array(Type.String())),
    failure_cases: Type.Optional(Type.Array(Type.String())),
    reproducibility_checks: Type.Optional(Type.Array(Type.String()))
  },
  { additionalProperties: false }
);

export const RevisedPlanSchema = Type.Object(
  {
    summary: Type.String({ minLength: 1 }),
    key_changes: Type.Optional(Type.Array(Type.String())),
    evidence_required: Type.Optional(Type.Array(Type.String())),
    feasibility: Type.String({ minLength: 1 })
  },
  { additionalProperties: false }
);

export const TimelineItemSchema = Type.Object(
  {
    week: Type.Union([Type.String({ minLength: 1 }), Type.Number()]),
    deliverable: Type.String({ minLength: 1 }),
    exit_criteria: Type.String({ minLength: 1 })
  },
  { additionalProperties: false }
);

export const ResearchAnalysisSchema = Type.Object(
  {
    schema_version: Type.Optional(Type.Integer()),
    idea_summary: Type.String({ minLength: 1 }),
    problem_statement: Type.String({ minLength: 1 }),
    domain_route: DomainRouteAnalysisSchema,
    raw_score: ScoreAssessmentSchema,
    revised_score: ScoreAssessmentSchema,
    feasibility: Type.String({ minLength: 1 }),
    risks: Type.Optional(Type.Array(Type.String())),
    related_work_queries: Type.Optional(Type.Array(Type.String())),
    paper_clusters: Type.Optional(Type.Array(PaperClusterSchema)),
    novelty_gaps: Type.Optional(Type.Array(Type.String())),
    revised_plan: RevisedPlanSchema,
    experiment_plan: ExperimentPlanSchema,
    timeline: Type.Optional(Type.Array(TimelineItemSchema)),
    reviewer_simulation: Type.String({ minLength: 1 }),
    artifact_contents: Type.Optional(Type.Record(Type.String(), Type.String()))
  },
  { additionalProperties: false }
);

export const DerivedResearchConfigSchema = Type.Object(
  {
    timeline_weeks: Type.Optional(Type.Integer()),
    resources: Type.Optional(Type.Array(Type.String())),
    stack: Type.Optional(Type.Union([Type.Literal("python"), Type.Literal("ts")])),
    output_slug: Type.Optional(Type.String({ minLength: 1 })),
    requested_domains: Type.Optional(Type.Array(Type.String()))
  },
  { additionalProperties: false }
);

export const IdeaDiscussionTurnSchema = Type.Object(
  {
    assistant_message: Type.String({ minLength: 1 }),
    ready_to_analyze: Type.Boolean(),
    missing_information: Type.Optional(Type.Array(Type.String())),
    assumptions: Type.Optional(Type.Array(Type.String())),
    derived_config: Type.Optional(DerivedResearchConfigSchema)
  },
  { additionalProperties: false }
);

export const ProjectManifestSchema = Type.Object(
  {
    version: Type.Literal(1),
    project_name: Type.String(),
    stage: Type.String(),
    created_at: Type.String(),
    updated_at: Type.String(),
    request: Type.Object({
      idea: Type.String(),
      requested_domains: Type.Array(Type.String()),
      timeline_weeks: Type.Integer(),
      resources: Type.Array(Type.String()),
      stack: Type.Union([Type.Literal("python"), Type.Literal("ts")])
    }),
    permissions: Type.Record(Type.String(), Type.Boolean()),
    workspace: Type.Record(Type.String(), Type.Unknown()),
    generation: Type.Record(Type.String(), Type.Unknown()),
    artifacts: Type.Array(
      Type.Object({
        path: Type.String(),
        sha256: Type.String(),
        bytes: Type.Integer()
      })
    )
  }
);

export const ProviderConfigSchema = Type.Object({
  mode: Type.String(),
  auth_boundary: Type.String(),
  secret_policy: Type.Record(Type.String(), Type.Unknown())
});

export type ResearchAnalysis = Static<typeof ResearchAnalysisSchema>;
export type IdeaDiscussionTurn = Static<typeof IdeaDiscussionTurnSchema>;
export type DerivedResearchConfig = Static<typeof DerivedResearchConfigSchema>;
export type ProjectManifest = Static<typeof ProjectManifestSchema>;
export type ProviderConfig = Static<typeof ProviderConfigSchema>;

export type ScoreAssessment = Static<typeof ScoreAssessmentSchema>;
export type TimelineItem = Static<typeof TimelineItemSchema>;

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });

export function validateResearchAnalysis(value: unknown): ResearchAnalysis {
  const validate = ajv.compile(ResearchAnalysisSchema);
  if (!validate(value)) {
    const detail = ajv.errorsText(validate.errors, { separator: "; " });
    throw new Error(`Codex output did not match ResearchAnalysis schema: ${detail}`);
  }
  return value as ResearchAnalysis;
}

export function validateIdeaDiscussionTurn(value: unknown): IdeaDiscussionTurn {
  const validate = ajv.compile(IdeaDiscussionTurnSchema);
  if (!validate(value)) {
    const detail = ajv.errorsText(validate.errors, { separator: "; " });
    throw new Error(`Codex output did not match IdeaDiscussionTurn schema: ${detail}`);
  }
  return value as IdeaDiscussionTurn;
}

export function researchAnalysisJsonSchema(): object {
  return ResearchAnalysisSchema;
}

export function discussionJsonSchema(): object {
  return IdeaDiscussionTurnSchema;
}
