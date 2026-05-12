import { researchStages, type ResearchStageId } from "../pipeline/stages.js";

export type WorkflowStepId = ResearchStageId | "route" | "provider";

export type WorkflowStepStatus = "pending" | "active" | "done";

export type TuiWorkflowStep = {
  id: WorkflowStepId;
  label: string;
  detail: string;
  status: WorkflowStepStatus;
};

export type TuiActivity = {
  title: string;
  detail?: string;
  stage: WorkflowStepId;
  tone?: "info" | "success" | "warning";
  count?: number;
};

const workflowBase: Array<Omit<TuiWorkflowStep, "status">> = [
  ...researchStages.map((stage) => ({
    id: stage.id,
    label: researchStageShortLabel(stage.id),
    detail: stage.artifactPaths.length ? `Writes ${stage.artifactPaths[0]}.` : "Runtime research stage."
  }))
];

export function createWorkflowSteps(active: WorkflowStepId = "idea_intake"): TuiWorkflowStep[] {
  return activateWorkflowStep(
    workflowBase.map((step) => ({ ...step, status: "pending" })),
    active
  );
}

export function activateWorkflowStep(steps: TuiWorkflowStep[], active: WorkflowStepId): TuiWorkflowStep[] {
  const normalized = visibleWorkflowStep(active);
  const activeIndex = workflowBase.findIndex((step) => step.id === normalized);
  return steps.map((step, index) => ({
    ...step,
    status: index < activeIndex ? "done" : step.id === normalized ? "active" : "pending"
  }));
}

export function completeWorkflowSteps(steps: TuiWorkflowStep[]): TuiWorkflowStep[] {
  return steps.map((step) => ({ ...step, status: "done" }));
}

export function presentProgressMessage(raw: string): TuiActivity {
  const message = raw.trim();
  const provider = message.match(/^Provider:\s*(.+)$/i)?.[1]?.trim();
  if (provider) {
    return {
      title: "Provider selected",
      detail: provider,
      stage: "provider"
    };
  }
  if (/network proxy enabled/i.test(message)) {
    return {
      title: "Network route prepared",
      detail: "Using the configured local proxy for Codex network traffic.",
      stage: "provider"
    };
  }
  if (/refreshing expired credentials/i.test(message)) {
    return {
      title: "Codex session refreshed",
      detail: "OAuth credentials were renewed before retrying the request.",
      stage: "provider"
    };
  }
  if (/building structured research-analysis request/i.test(message)) {
    return {
      title: "Structured brief prepared",
      detail: "Packaging the idea, constraints, and JSON schema for Codex.",
      stage: "idea_intake"
    };
  }
  if (/thinking about clarifying questions/i.test(message)) {
    return {
      title: "Missing context checked",
      detail: "Codex is deciding whether the idea needs clarification first.",
      stage: "clarification_dialogue"
    };
  }
  if (/thinking about project name/i.test(message)) {
    return {
      title: "Project name proposal",
      detail: "Codex is deriving a short repository name from the idea.",
      stage: "search_planning"
    };
  }
  if (/receiving structured analysis/i.test(message)) {
    return {
      title: "Structured analysis streaming",
      detail: "Reading scores, risks, evidence needs, and revision guidance.",
      stage: "ccf_a_strict_scoring"
    };
  }
  if (/offline deterministic fallback/i.test(message)) {
    return {
      title: "Offline analysis route",
      detail: "Using deterministic scoring and scaffold planning without network calls.",
      stage: "ccf_a_strict_scoring",
      tone: "warning"
    };
  }
  if (/provider fallback selected/i.test(message)) {
    return {
      title: "Fallback route selected",
      detail: "Provider analysis was unavailable, so deterministic planning will continue.",
      stage: "ccf_a_strict_scoring",
      tone: "warning"
    };
  }
  if (/writing repository scaffold/i.test(message)) {
    return {
      title: "Writing artifact scaffold",
      detail: "Creating reports, plans, references, experiment folders, and project files.",
      stage: "artifact_writing"
    };
  }
  if (/manifest and status written/i.test(message)) {
    return {
      title: "Manifest recorded",
      detail: "Status and resume metadata are ready.",
      stage: "venue_template_packaging",
      tone: "success"
    };
  }
  return {
    title: "Working",
    detail: "Advancing the current generation step.",
    stage: "idea_intake"
  };
}

export function mergeActivity(current: TuiActivity[], next: TuiActivity, limit = 12): TuiActivity[] {
  const last = current.at(-1);
  if (last && last.title === next.title && last.detail === next.detail && last.stage === next.stage) {
    return [...current.slice(0, -1), { ...last, count: (last.count ?? 1) + 1 }].slice(-limit);
  }
  return [...current, { ...next, count: next.count ?? 1 }].slice(-limit);
}

function visibleWorkflowStep(step: WorkflowStepId): ResearchStageId {
  if (step === "route" || step === "provider") return "search_planning";
  return step;
}

function researchStageShortLabel(stage: ResearchStageId): string {
  const labels: Record<ResearchStageId, string> = {
    idea_intake: "Intake",
    search_planning: "Search",
    literature_search: "Papers",
    candidate_triage: "Papers",
    pdf_acquisition: "PDF",
    pdf_reading: "Notes",
    related_work_analysis: "Survey",
    novelty_analysis: "Novelty",
    ccf_a_strict_scoring: "Score",
    clarification_dialogue: "Questions",
    feasibility_review: "Feasibility",
    better_idea_synthesis: "Idea",
    artifact_writing: "Reports",
    venue_template_packaging: "Reports"
  };
  return labels[stage];
}
