import React from "react";
import { Box, Text } from "ink";
import type { Idea2RepoEvent } from "../runtime/events.js";
import { TracePanel } from "./TracePanel.js";
import type { TuiRuntimeResearchSummary, TuiRuntimeSnapshot } from "./runtime-view.js";

export const INSPECTOR_TABS = ["idea_score", "literature", "paper_notes", "reviewers", "plan", "solution", "files", "debug"] as const;
export type InspectorTab = (typeof INSPECTOR_TABS)[number];

const colors = {
  accent: "#38bdf8",
  success: "#86efac",
  warning: "#fbbf24",
  danger: "#f87171",
  text: "#e5e7eb",
  muted: "#94a3b8",
  dim: "#64748b",
  panel: "#334155"
} as const;

type CockpitSummary = { completed: number; active: number; blocked: number; skipped: number; total: number };

export function nextInspectorTab(current: InspectorTab, direction: -1 | 1): InspectorTab {
  const index = INSPECTOR_TABS.indexOf(current);
  const next = (index + direction + INSPECTOR_TABS.length) % INSPECTOR_TABS.length;
  return INSPECTOR_TABS[next] ?? "idea_score";
}

export function ResearchCockpit({
  snapshot,
  height,
  width,
  activeInspectorTab = "idea_score",
  authStatus = "unknown",
  model = "unknown",
  mode = "Research"
}: {
  snapshot: TuiRuntimeSnapshot;
  height: number;
  width: number;
  compact?: boolean;
  activeInspectorTab?: InspectorTab;
  authStatus?: string;
  model?: string;
  mode?: string;
}): React.ReactElement {
  if (height < 3) {
    return (
      <Box height={height} flexShrink={0}>
        <Text color={statusColor(snapshot.status)}>{compactText(`Research cockpit ${snapshot.status}: ${snapshot.runId}`, width)}</Text>
      </Box>
    );
  }

  const tabRows = tabBarLines(activeInspectorTab, width);
  const headerRows = 1;
  const actionRows = 1;
  const ribbonRows = height >= 9 ? 2 : 1;
  const composerRows = 1;
  const fixedRows = headerRows + actionRows + tabRows.length + ribbonRows + composerRows;
  const focusRows = Math.max(3, height - fixedRows);

  return (
    <Box height={height} flexShrink={0} flexDirection="column">
      <HeaderLine snapshot={snapshot} width={width} authStatus={authStatus} model={model} mode={mode} />
      <NowNextNeedsBar snapshot={snapshot} width={width} />
      {tabRows}
      <FocusPanel snapshot={snapshot} height={focusRows} width={width} activeTab={activeInspectorTab} />
      <StageRibbon snapshot={snapshot} height={ribbonRows} width={width} />
      <ComposerLine snapshot={snapshot} activeTab={activeInspectorTab} width={width} />
    </Box>
  );
}

function HeaderLine({ snapshot, width, authStatus, model, mode }: { snapshot: TuiRuntimeSnapshot; width: number; authStatus: string; model: string; mode: string }): React.ReactElement {
  const auth = compactAuth(authStatus);
  const outputWidth = Math.max(10, width - auth.length - model.length - mode.length - 37);
  return (
    <Text>
      <Text bold color={colors.text}>Idea2Repo</Text>
      <Text color={colors.dim}>  </Text>
      <Text color={auth === "Codex logged in" ? colors.success : colors.warning}>Auth: {auth}</Text>
      <Text color={colors.dim}>  Model: </Text>
      <Text color={colors.text}>{compactText(model, 18)}</Text>
      <Text color={colors.dim}>  Mode: </Text>
      <Text color={statusColor(snapshot.status)}>{mode}</Text>
      <Text color={colors.dim}>  Output: </Text>
      <Text color={colors.muted}>{compactText(snapshot.outputRoot, outputWidth)}</Text>
    </Text>
  );
}

function NowNextNeedsBar({ snapshot, width }: { snapshot: TuiRuntimeSnapshot; width: number }): React.ReactElement {
  const now = currentStageLabel(snapshot);
  const next = snapshot.researchSummary.nextUserAction;
  const needs = needsText(snapshot);
  return (
    <Text>
      <Text color={colors.success}>Now: </Text>
      <Text>{compactText(now, Math.max(8, Math.floor(width * 0.26)))}</Text>
      <Text color={colors.dim}> | </Text>
      <Text color={colors.accent}>Next: </Text>
      <Text>{compactText(next, Math.max(10, Math.floor(width * 0.38)))}</Text>
      <Text color={colors.dim}> | </Text>
      <Text color={needs === "none" ? colors.success : colors.warning}>Needs: </Text>
      <Text>{compactText(needs, Math.max(8, width - Math.floor(width * 0.64) - 22))}</Text>
    </Text>
  );
}

function FocusPanel({
  snapshot,
  height,
  width,
  activeTab
}: {
  snapshot: TuiRuntimeSnapshot;
  height: number;
  width: number;
  activeTab: InspectorTab;
}): React.ReactElement {
  const innerRows = Math.max(0, height - 2);
  const action = cockpitActionLine(snapshot, activeTab);
  const contentRows = Math.max(0, innerRows - 2);
  const lines = activeTab === "debug" ? [] : focusLines(snapshot, activeTab, contentRows);
  return (
    <Box height={height} flexShrink={0} borderStyle="round" borderColor={activeTab === "debug" ? colors.warning : colors.accent} paddingX={1} flexDirection="column">
      <Title label={tabLabel(activeTab)} />
      <Text color={colors.accent}>{compactText(action, Math.max(8, width - 4))}</Text>
      {activeTab === "debug" ? <TracePanel events={snapshot.events} limit={contentRows} title="Runtime trace" width={width - 4} /> : null}
      {activeTab !== "debug"
        ? lines.map((line, index) => (
            <Text key={`${activeTab}-${index}`} color={line.color}>
              {compactText(line.text, Math.max(8, width - 4))}
            </Text>
          ))
        : null}
    </Box>
  );
}

function StageRibbon({ snapshot, height, width }: { snapshot: TuiRuntimeSnapshot; height: number; width: number }): React.ReactElement {
  const summary = planSummary(snapshot);
  const marks = snapshot.plan.items.map((item) => `${mark(item.status)} ${shortStage(item.step)}`);
  const ribbon = marks.join("  ");
  if (height <= 1) {
    return <Text color={colors.muted}>{compactText(`Stages ${summary.completed}/${summary.total} ${ribbon}`, width)}</Text>;
  }
  return (
    <Box height={height} flexShrink={0} flexDirection="column">
      <Text color={colors.muted}>
        Stages {summary.completed}/{summary.total} done  active {summary.active}  blocked {summary.blocked}  skipped {summary.skipped}
      </Text>
      <Text>{compactText(ribbon || "No stage plan loaded.", width)}</Text>
    </Box>
  );
}

function ComposerLine({ snapshot, activeTab, width }: { snapshot: TuiRuntimeSnapshot; activeTab: InspectorTab; width: number }): React.ReactElement {
  return (
    <Text>
      <Text color={colors.dim}>Composer </Text>
      <Text>{compactText(`${tabLabel(activeTab)}: ${cockpitActionLine(snapshot, activeTab)}`, Math.max(8, width - 9))}</Text>
    </Text>
  );
}

function Title({ label }: { label: string }): React.ReactElement {
  return (
    <Text>
      <Text color={colors.accent}>[</Text>
      <Text bold color={colors.text}>{label}</Text>
      <Text color={colors.accent}>]</Text>
    </Text>
  );
}

export function cockpitActionLine(snapshot: TuiRuntimeSnapshot, tab: InspectorTab): string {
  const pending = snapshot.approvals.find((approval) => !approval.decision);
  const activeStage = snapshot.plan.items.find((item) => item.status === "blocked" || item.status === "in_progress");
  if (pending) return `Action: approve/deny ${pending.action}${pending.stage_id ? ` at ${pending.stage_id}` : ""}`;
  if (activeStage?.status === "blocked") return `Action: retry/skip ${activeStage.stage_id}`;
  if (tab === "files") {
    const artifact = [...snapshot.artifacts].reverse().find((item) => isUserFacingArtifact(item.path));
    if (artifact) return `Action: open ${artifact.path}`;
  }
  if (tab === "idea_score") return snapshot.researchSummary.nextUserAction;
  if (tab === "literature") return snapshot.researchSummary.surveyStats ? "Action: inspect related-work survey" : "Action: inspect candidate set";
  if (tab === "paper_notes") return snapshot.researchSummary.noteStats.total ? "Action: open latest paper note" : "Action: wait for paper notes";
  if (tab === "reviewers") return snapshot.researchSummary.reviewerStats.openTasks ? "Action: resolve reviewer rebuttal tasks" : "Action: inspect reviewer panel";
  if (tab === "plan") return activeStage ? `Action: inspect ${activeStage.stage_id ?? activeStage.id}` : "Action: inspect current plan";
  if (tab === "solution") return snapshot.researchSummary.solutionStats.artifacts.length ? "Action: open strict proposal artifacts" : "Action: wait for solution artifacts";
  if (tab === "debug") return "Action: inspect runtime event trace";
  return snapshot.researchSummary.nextUserAction;
}

function tabBarLines(active: InspectorTab, width: number): React.ReactElement[] {
  const labels = INSPECTOR_TABS.map((tab, index) => {
    const label = `${index + 1}:${tabLabel(tab)}`;
    return tab === active ? `[${label}]` : label;
  });
  if (width < 92) {
    return [
      <Text key="tabs-a" color={colors.muted}>{labels.slice(0, 4).join("  ")}</Text>,
      <Text key="tabs-b" color={colors.muted}>{labels.slice(4).join("  ")}</Text>
    ];
  }
  return [<Text key="tabs" color={colors.muted}>{labels.join("  ")}</Text>];
}

function focusLines(snapshot: TuiRuntimeSnapshot, tab: Exclude<InspectorTab, "debug">, limit: number): Array<{ text: string; color: string }> {
  if (limit <= 0) return [];
  if (tab === "idea_score") return ideaScoreLines(snapshot, limit);
  if (tab === "literature") return literatureLines(snapshot, limit);
  if (tab === "paper_notes") return paperNoteLines(snapshot, limit);
  if (tab === "reviewers") return reviewerLines(snapshot, limit);
  if (tab === "plan") return planLines(snapshot, limit);
  if (tab === "solution") return solutionLines(snapshot, limit);
  if (tab === "files") return fileLines(snapshot, limit);
  return [];
}

function ideaScoreLines(snapshot: TuiRuntimeSnapshot, limit: number): Array<{ text: string; color: string }> {
  const score = snapshot.researchSummary.currentScore;
  const questions = snapshot.events.filter((event): event is Extract<Idea2RepoEvent, { type: "question.asked" }> => event.type === "question.asked");
  const lines: Array<{ text: string; color: string }> = [
    { text: `Idea: ${snapshot.researchSummary.ideaSummary ?? "pending"}`, color: colors.muted },
    { text: `Strict score: ${score ? `${score.score}/${score.maxScore} ${score.scoreType ?? "type pending"} confidence ${score.confidence}` : "pending"}`, color: score ? colors.accent : colors.dim },
    { text: `Active caps: ${score?.activeCaps.length ? score.activeCaps.map((cap) => `${cap.reason}: cap ${cap.cap}`).slice(0, 3).join("; ") : "none recorded"}`, color: score?.activeCaps.length ? colors.warning : colors.success },
    { text: `Top action: ${score?.topAction ?? snapshot.researchSummary.nextUserAction}`, color: score?.topAction ? colors.warning : colors.muted },
    ...questions.slice(-Math.max(0, limit - 3)).map((event) => ({ text: `Question: ${event.question} | ${event.why_it_matters}`, color: colors.warning }))
  ];
  return lines.slice(0, limit);
}

function literatureLines(snapshot: TuiRuntimeSnapshot, limit: number): Array<{ text: string; color: string }> {
  const stats = snapshot.researchSummary.paperStats;
  const survey = snapshot.researchSummary.surveyStats;
  const papers = snapshot.events.filter((event): event is Extract<Idea2RepoEvent, { type: "paper.found" }> => event.type === "paper.found");
  const lines: Array<{ text: string; color: string }> = [
    { text: `Papers found: ${stats.found} | CCF-A candidates: ${stats.ccfA} | main/full eligible: ${stats.mainTrack}/8`, color: colors.muted },
    { text: `PDF available: ${stats.pdfAvailable} | pending approval: ${stats.pendingApproval} | downloaded: ${stats.downloaded}`, color: stats.pendingApproval ? colors.warning : colors.muted },
    { text: `Verified evidence papers: ${stats.verifiedEvidence}`, color: stats.verifiedEvidence ? colors.success : colors.warning },
    {
      text: survey
        ? `Survey ${survey.verifiedPapers} verified papers | clusters ${survey.clusters} | B/D/M ${survey.baselines}/${survey.datasets}/${survey.metrics}`
        : "Survey pending.",
      color: survey?.verifiedPapers ? colors.success : colors.warning
    },
    ...papers.slice(-Math.max(0, limit - 3)).map((event) => ({
      text: `${event.title}${event.venue ? ` (${event.venue}${event.year ? ` ${event.year}` : ""})` : ""} | ${event.ccf_rank ?? "unknown"} | ${event.track_status ?? "unknown"} | ${event.pdf_status ?? "unknown"}`,
      color: colors.text
    }))
  ];
  return lines.slice(0, limit);
}

function paperNoteLines(snapshot: TuiRuntimeSnapshot, limit: number): Array<{ text: string; color: string }> {
  const stats = snapshot.researchSummary.noteStats;
  const notes = snapshot.events.filter((event): event is Extract<Idea2RepoEvent, { type: "paper.note.written" }> => event.type === "paper.note.written");
  const evidence = snapshot.events.filter((event): event is Extract<Idea2RepoEvent, { type: "evidence.extracted" }> => event.type === "evidence.extracted");
  const lines: Array<{ text: string; color: string }> = [
    { text: `Paper notes: ${stats.total} total | verified ${stats.verified} | metadata-only ${stats.metadataOnly}`, color: stats.verified ? colors.success : colors.warning },
    { text: `Extraction quality: ok ${stats.ok} | weak ${stats.weak} | empty ${stats.empty}`, color: stats.weak || stats.empty ? colors.warning : colors.muted },
    ...notes.slice(-Math.max(0, Math.min(3, limit - 1))).map((event) => ({
      text: `${event.paper_id} ${event.status} (${event.evidence_rows} evidence rows) -> ${event.path}`,
      color: event.status === "verified" ? colors.success : colors.warning
    })),
    ...evidence.slice(-Math.max(0, limit - Math.min(4, notes.length + 1))).map((event) => ({
      text: `${event.claim_type} ${event.paper_id} p.${event.page}: ${event.claim}`,
      color: colors.text
    }))
  ];
  if (lines.length === 1 && stats.total === 0) lines.push({ text: "No paper notes have been written yet.", color: colors.dim });
  return lines.slice(0, limit);
}

function reviewerLines(snapshot: TuiRuntimeSnapshot, limit: number): Array<{ text: string; color: string }> {
  const stats = snapshot.researchSummary.reviewerStats;
  const reviewerEvents = snapshot.events.filter((event): event is Extract<Idea2RepoEvent, { type: "reviewer.reported" }> => event.type === "reviewer.reported");
  const taskEvents = snapshot.events.filter((event): event is Extract<Idea2RepoEvent, { type: "rebuttal.task.created" }> => event.type === "rebuttal.task.created");
  const reviewerArtifacts = snapshot.artifacts
    .filter((artifact) => /docs\/diagnosis\/reviewer_[123]\.md$/i.test(artifact.path.replace(/\\/g, "/")))
    .map((artifact) => artifact.path);
  const lines: Array<{ text: string; color: string }> = [
    { text: `Reviewers ${stats.reviewers}/3 | open tasks ${stats.openTasks} | resolved ${stats.resolvedTasks}`, color: colors.muted },
    ...reviewerEvents.map((event) => ({ text: `${event.reviewer_id} ${event.verdict}: ${event.role} (${event.open_tasks} open)`, color: event.verdict === "Weak accept" ? colors.success : colors.warning })),
    ...taskEvents.slice(-Math.max(0, limit - reviewerEvents.length - 1)).map((event) => ({ text: `${event.task_id}: ${event.title} -> ${event.binding_type}:${event.binding_ref}`, color: colors.text })),
    ...reviewerArtifacts.map((path) => ({ text: path, color: colors.text }))
  ];
  if (lines.length === 1) lines.push({ text: "Reviewer panel has not been generated yet.", color: colors.dim });
  return lines.slice(0, limit);
}

function planLines(snapshot: TuiRuntimeSnapshot, limit: number): Array<{ text: string; color: string }> {
  if (!snapshot.plan.items.length) return [{ text: "No plan items yet.", color: colors.dim }];
  return snapshot.plan.items.slice(0, limit).map((item) => {
    const suffix = item.blocker ? ` | ${item.blocker}` : item.next_actions[0] ? ` | ${item.next_actions[0]}` : "";
    return { text: `${mark(item.status)} ${item.step}${suffix}`, color: item.status === "blocked" ? colors.warning : colors.text };
  });
}

function solutionLines(snapshot: TuiRuntimeSnapshot, limit: number): Array<{ text: string; color: string }> {
  const solution = snapshot.researchSummary.solutionStats;
  const proposalArtifacts = snapshot.artifacts
    .map((artifact) => artifact.path.replace(/\\/g, "/"))
    .filter((path) => /^docs\/proposal\/(?:revised_idea|strict_execution_plan|solution_design)\.md$/i.test(path));
  const lines = [
    { text: `Solution artifacts ${solution.artifacts.length} | generated events ${solution.generated}`, color: solution.artifacts.length ? colors.success : colors.warning },
    { text: `Claim focus: ${solution.latestSummary ?? "pending"}`, color: colors.muted },
    ...[...new Set([...solution.artifacts, ...proposalArtifacts])].map((path) => ({ text: path, color: colors.text }))
  ];
  return lines.slice(0, limit);
}

function fileLines(snapshot: TuiRuntimeSnapshot, limit: number): Array<{ text: string; color: string }> {
  const visibleArtifacts = snapshot.artifacts.filter((artifact) => isUserFacingArtifact(artifact.path));
  if (!visibleArtifacts.length) return [{ text: "No user-facing artifacts written yet.", color: colors.dim }];
  const priority = (path: string): number => {
    const normalized = path.replace(/\\/g, "/");
    if (/^docs\/proposal\//i.test(normalized)) return 0;
    if (/^docs\/relative_work\//i.test(normalized)) return 1;
    if (/^docs\/reference\/paper_notes\//i.test(normalized)) return 2;
    if (/^docs\/diagnosis\//i.test(normalized)) return 3;
    return 4;
  };
  return [...visibleArtifacts]
    .sort((left, right) => priority(left.path) - priority(right.path) || left.path.localeCompare(right.path))
    .slice(0, limit)
    .map((artifact) => ({
      text: `${artifact.text ? "[txt]" : "[bin]"} ${artifact.path} (${artifact.bytes} bytes)`,
      color: colors.text
    }));
}

function isUserFacingArtifact(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith(".idea2repo/")) return false;
  if (/\.jsonl$/i.test(normalized)) return false;
  return true;
}

function planSummary(snapshot: TuiRuntimeSnapshot): CockpitSummary {
  const summary: CockpitSummary = { completed: 0, active: 0, blocked: 0, skipped: 0, total: snapshot.plan.items.length };
  for (const item of snapshot.plan.items) {
    if (item.status === "completed") summary.completed += 1;
    else if (item.status === "in_progress") summary.active += 1;
    else if (item.status === "blocked") summary.blocked += 1;
    else if (item.status === "skipped") summary.skipped += 1;
  }
  return summary;
}

function currentStageLabel(snapshot: TuiRuntimeSnapshot): string {
  const active = snapshot.plan.items.find((item) => item.status === "in_progress" || item.status === "blocked");
  if (active) return `${mark(active.status)} ${active.step}`;
  if (snapshot.status === "completed") return "completed";
  if (snapshot.status === "failed") return snapshot.message ?? "failed";
  return "waiting";
}

function needsText(snapshot: TuiRuntimeSnapshot): string {
  const pending = snapshot.approvals.find((approval) => !approval.decision);
  if (pending) return `${pending.action} approval`;
  const blocked = snapshot.plan.items.find((item) => item.status === "blocked");
  if (blocked) return blocked.blocker ?? blocked.step;
  if (snapshot.researchSummary.reviewerStats.openTasks) return `${snapshot.researchSummary.reviewerStats.openTasks} reviewer tasks`;
  if (snapshot.researchSummary.fatalBlockers.length) return snapshot.researchSummary.fatalBlockers[0] ?? "score blocker";
  return "none";
}

function tabLabel(tab: InspectorTab): string {
  if (tab === "idea_score") return "Idea & Score";
  if (tab === "literature") return "Literature";
  if (tab === "paper_notes") return "Paper Notes";
  if (tab === "reviewers") return "Reviewers";
  if (tab === "plan") return "Plan";
  if (tab === "solution") return "Solution";
  if (tab === "files") return "Files";
  return "Debug";
}

function mark(status: TuiRuntimeSnapshot["plan"]["items"][number]["status"]): string {
  if (status === "completed") return "[x]";
  if (status === "in_progress") return "[>]";
  if (status === "blocked") return "[!]";
  if (status === "skipped") return "[-]";
  return "[ ]";
}

function shortStage(step: string): string {
  const normalized = step.toLowerCase();
  if (/idea intake/.test(normalized)) return "Intake";
  if (/search planning/.test(normalized)) return "Search";
  if (/literature search|candidate triage/.test(normalized)) return "Papers";
  if (/pdf acquisition/.test(normalized)) return "PDF";
  if (/pdf reading/.test(normalized)) return "Notes";
  if (/related work/.test(normalized)) return "Survey";
  if (/novelty/.test(normalized)) return "Novelty";
  if (/scoring/.test(normalized)) return "Score";
  if (/clarification/.test(normalized)) return "Questions";
  if (/feasibility/.test(normalized)) return "Feasibility";
  if (/better idea/.test(normalized)) return "Idea";
  if (/artifact|venue template/.test(normalized)) return "Reports";
  return step.replace(/\s+/g, " ").trim().slice(0, 22);
}

function compactAuth(status: string): string {
  if (/logged in/i.test(status)) return "Codex logged in";
  if (/not logged in/i.test(status)) return "not logged in";
  if (/unknown/i.test(status)) return "unknown";
  return compactText(status, 18);
}

function statusColor(status: TuiRuntimeSnapshot["status"]): string {
  if (status === "completed") return colors.success;
  if (status === "failed" || status === "cancelled") return colors.danger;
  if (status === "blocked") return colors.warning;
  return colors.accent;
}

function compactText(value: string, maxLength: number): string {
  const normalized = value.split(/\s+/).filter(Boolean).join(" ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}
