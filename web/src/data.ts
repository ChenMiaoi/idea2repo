import {
  Archive,
  Bot,
  Boxes,
  ClipboardList,
  FileText,
  GitBranch,
  LayoutDashboard,
  Library,
  MessageSquareReply,
  Route,
  Settings,
  ShieldCheck
} from "lucide-react";
import type {
  ArtifactNode,
  BoardColumn,
  LiteratureRecord,
  NavItem,
  ProviderService,
  RouteScore,
  RunLogEntry
} from "./types";

export const navItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Idea", icon: Bot },
  { label: "Routes", icon: Route },
  { label: "Literature", icon: Library },
  { label: "Execution", icon: ClipboardList },
  { label: "Artifacts", icon: Archive },
  { label: "Reviewer", icon: ShieldCheck },
  { label: "Rebuttal", icon: MessageSquareReply },
  { label: "GitHub", icon: GitBranch },
  { label: "Providers", icon: Settings },
  { label: "Scaffold", icon: Boxes }
];

export const initialRoutes: RouteScore[] = [
  {
    id: "R1",
    route: "AI / LLM Agent: memory and tool-use benchmark",
    score: 78,
    gate: "ready",
    feasible: 0.72,
    novelty: 0.68,
    impact: 0.82,
    progress: 32
  },
  {
    id: "R2",
    route: "Security: defensive jailbreak evaluation",
    score: 71,
    gate: "ready",
    feasible: 0.69,
    novelty: 0.58,
    impact: 0.76,
    progress: 18
  },
  {
    id: "R3",
    route: "Systems: local artifact runtime",
    score: 56,
    gate: "warning",
    feasible: 0.64,
    novelty: 0.45,
    impact: 0.62,
    progress: 12
  },
  {
    id: "R4",
    route: "Workshop/demo track cap",
    score: 48,
    gate: "warning",
    feasible: 0.6,
    novelty: 0.34,
    impact: 0.61,
    progress: 8
  },
  {
    id: "R5",
    route: "Engineering-only scaffold",
    score: 36,
    gate: "blocked",
    feasible: 0.4,
    novelty: 0.28,
    impact: 0.43,
    progress: 0
  }
];

export const initialLiterature: LiteratureRecord[] = [
  {
    id: "L1",
    citation: "Verified Agent Memory Benchmarks, 2026",
    finding: "Traceable benchmark framing with source URL and BibTeX.",
    relevance: 0.86,
    evidence: "high",
    selected: true
  },
  {
    id: "L2",
    citation: "Open Tool-Use Evaluation, 2025",
    finding: "Baseline reproduction order and failure-case taxonomy.",
    relevance: 0.78,
    evidence: "high",
    selected: true
  },
  {
    id: "L3",
    citation: "Local Research Agent Runtime, 2024",
    finding: "Artifact manifest and resumable workflow comparison.",
    relevance: 0.73,
    evidence: "medium",
    selected: true
  },
  {
    id: "L4",
    citation: "Offline Literature Search Notes, 2025",
    finding: "Network-disabled runs should emit tasks, not citations.",
    relevance: 0.48,
    evidence: "low",
    selected: false
  },
  {
    id: "L5",
    citation: "Reviewer Simulation Protocols, 2024",
    finding: "Useful for rebuttal clustering, not direct evidence.",
    relevance: 0.31,
    evidence: "low",
    selected: false
  }
];

export const boardColumns: BoardColumn[] = [
  {
    title: "Plan",
    tone: "plan",
    tasks: ["Define research question", "Select route", "Write threat/scope notes", "Choose scaffold stack"]
  },
  {
    title: "In Progress",
    tone: "active",
    tasks: ["Generate repository", "Fill provider report", "Configure CI"]
  },
  {
    title: "Validate",
    tone: "validate",
    tasks: ["Evidence gate check", "Score thresholds", "Generated repo smoke test"]
  },
  {
    title: "Done",
    tone: "done",
    tasks: ["Literature search tasks", "Artifact manifest", "Security guardrail", "Workflow registry"]
  },
  {
    title: "Blocked",
    tone: "blocked",
    tasks: []
  }
];

export const artifacts: ArtifactNode[] = [
  { path: "README.md", status: "modified", depth: 0 },
  { path: "docs", status: "clean", depth: 0 },
  { path: "docs/diagnosis/ccf_a_readiness_report.md", status: "clean", depth: 1 },
  { path: "docs/reference/related_work_matrix.csv", status: "clean", depth: 1 },
  { path: "docs/workflow/reviewer_simulation.md", status: "clean", depth: 1 },
  { path: "src", status: "clean", depth: 0 },
  { path: "src/research_project/runner.py", status: "clean", depth: 1 },
  { path: "tests/test_smoke.py", status: "clean", depth: 0 },
  { path: ".idea2repo/manifest.json", status: "clean", depth: 0 }
];

export const providerServices: ProviderService[] = [
  { name: "OpenAI", status: "offline", detail: "env unset" },
  { name: "Local model", status: "running", detail: "http://localhost:11434" },
  { name: "Node API", status: "running", detail: "http://127.0.0.1:8000" },
  { name: "GitHub", status: "offline", detail: "dry-run only" }
];

export const initialRunLog: RunLogEntry[] = [
  { time: "09:12", label: "Workspace inspected", tone: "ok" },
  { time: "09:14", label: "Evidence gate blocked until verified papers are added", tone: "warn" },
  { time: "09:17", label: "GitHub publish permission denied by default", tone: "blocked" }
];
