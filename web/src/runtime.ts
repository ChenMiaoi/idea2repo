import type {
  RuntimeApproval,
  RuntimeArtifact,
  RuntimeDecision,
  RuntimeEvidence,
  RuntimeEvent,
  RuntimePaper,
  RuntimeQuestion,
  RuntimeRunSummary,
  RuntimeScoreSnapshot,
  RuntimeViewState
} from "./types";

const MAX_EVENTS = 200;

export function createRuntimeView(run: { run_id: string; output_root: string; status: RuntimeRunSummary["status"] }): RuntimeViewState {
  return {
    runId: run.run_id,
    outputRoot: run.output_root,
    status: run.status,
    connected: true,
    events: [],
    plan: [],
    artifacts: [],
    decisions: [],
    approvals: [],
    papers: [],
    evidence: [],
    questions: [],
    scores: []
  };
}

export function applyRuntimeEvent(state: RuntimeViewState, event: RuntimeEvent): RuntimeViewState {
  if (event.run_id !== state.runId) return state;
  return {
    ...state,
    events: [...state.events, event].slice(-MAX_EVENTS),
    status: statusForEvent(state.status, event),
    error: event.type === "run.failed" ? event.error : state.error,
    plan: planForEvent(state.plan, event),
    artifacts: artifactsForEvent(state.artifacts, event),
    decisions: decisionsForEvent(state.decisions, event),
    approvals: approvalsForEvent(state.approvals, event),
    papers: papersForEvent(state.papers, event),
    evidence: evidenceForEvent(state.evidence, event),
    questions: questionsForEvent(state.questions, event),
    scores: scoresForEvent(state.scores, event)
  };
}

export function disconnectRuntimeView(state: RuntimeViewState, error?: string): RuntimeViewState {
  return { ...state, connected: false, error: error ?? state.error };
}

function statusForEvent(current: RuntimeRunSummary["status"], event: RuntimeEvent): RuntimeRunSummary["status"] {
  if (event.type === "run.started") return "running";
  if (event.type === "run.completed") return "completed";
  if (event.type === "run.failed") return "failed";
  if (event.type === "run.cancelled") return "cancelled";
  if (event.type === "stage.blocked") return "blocked";
  if (event.type === "stage.started" && current === "blocked") return "running";
  return current;
}

function planForEvent(plan: RuntimeViewState["plan"], event: RuntimeEvent): RuntimeViewState["plan"] {
  if (event.type === "plan.updated") return event.plan.map((item) => ({ ...item }));
  return plan;
}

function artifactsForEvent(artifacts: RuntimeArtifact[], event: RuntimeEvent): RuntimeArtifact[] {
  if (event.type !== "artifact.written") return artifacts;
  const next = { path: event.path, bytes: event.bytes, text: isTextArtifact(event.path) };
  return [...artifacts.filter((artifact) => artifact.path !== next.path), next].sort((left, right) => left.path.localeCompare(right.path));
}

function decisionsForEvent(decisions: RuntimeDecision[], event: RuntimeEvent): RuntimeDecision[] {
  if (event.type !== "decision.recorded") return decisions;
  const next = {
    id: event.decision_id,
    title: event.title,
    stage_id: event.stage_id,
    timestamp: event.timestamp
  };
  return [...decisions.filter((decision) => decision.id !== next.id), next];
}

function approvalsForEvent(approvals: RuntimeApproval[], event: RuntimeEvent): RuntimeApproval[] {
  if (event.type === "approval.requested") {
    const next = {
      id: event.approval_id,
      action: event.action,
      risk: event.risk,
      stage_id: event.stage_id,
      timestamp: event.timestamp
    };
    return [...approvals.filter((approval) => approval.id !== next.id), next];
  }
  if (event.type !== "approval.resolved") return approvals;
  const existing = approvals.find((approval) => approval.id === event.approval_id);
  const next = {
    id: event.approval_id,
    action: existing?.action ?? event.approval_id,
    risk: existing?.risk,
    decision: event.decision,
    timestamp: event.timestamp
  };
  return [...approvals.filter((approval) => approval.id !== next.id), next];
}

function papersForEvent(papers: RuntimePaper[], event: RuntimeEvent): RuntimePaper[] {
  if (event.type === "paper.found") {
    const next: RuntimePaper = {
      id: event.paper_id,
      title: event.title,
      venue: event.venue,
      year: event.year,
      pdf_status: event.pdf_status,
      novelty_risk: event.novelty_risk,
      reason: event.reason,
      timestamp: event.timestamp
    };
    return [...papers.filter((paper) => paper.id !== next.id), next];
  }
  if (event.type !== "pdf.downloaded") return papers;
  const existing = papers.find((paper) => paper.id === event.paper_id);
  const next: RuntimePaper = {
    id: event.paper_id,
    title: existing?.title ?? event.paper_id,
    venue: existing?.venue,
    year: existing?.year,
    pdf_status: "downloaded",
    novelty_risk: existing?.novelty_risk,
    reason: existing?.reason,
    timestamp: event.timestamp
  };
  return [...papers.filter((paper) => paper.id !== next.id), next];
}

function evidenceForEvent(evidence: RuntimeEvidence[], event: RuntimeEvent): RuntimeEvidence[] {
  if (event.type !== "evidence.extracted") return evidence;
  const next: RuntimeEvidence = {
    id: event.evidence_id,
    paper_id: event.paper_id,
    claim: event.claim,
    claim_type: event.claim_type,
    page: event.page,
    quote: event.quote,
    chunk_id: event.chunk_id,
    confidence: event.confidence,
    timestamp: event.timestamp
  };
  return [...evidence.filter((item) => item.id !== next.id), next];
}

function questionsForEvent(questions: RuntimeQuestion[], event: RuntimeEvent): RuntimeQuestion[] {
  if (event.type !== "question.asked") return questions;
  const next: RuntimeQuestion = {
    id: event.question_id,
    question: event.question,
    why_it_matters: event.why_it_matters,
    related_score_dimensions: [...event.related_score_dimensions],
    evidence_refs: [...event.evidence_refs],
    options: event.options ? [...event.options] : undefined,
    required: event.required,
    timestamp: event.timestamp
  };
  return [...questions.filter((question) => question.id !== next.id), next];
}

function scoresForEvent(scores: RuntimeScoreSnapshot[], event: RuntimeEvent): RuntimeScoreSnapshot[] {
  if (event.type !== "score.updated") return scores;
  return [
    ...scores,
    {
      score: event.score,
      max_score: event.max_score,
      confidence: event.confidence,
      hard_blockers: [...event.hard_blockers],
      stage_id: event.stage_id,
      timestamp: event.timestamp
    }
  ].slice(-20);
}

function isTextArtifact(path: string): boolean {
  return /\.(?:csv|json|jsonl|md|py|ts|tsx|txt|ya?ml)$/i.test(path);
}
