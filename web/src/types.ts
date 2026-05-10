import type { LucideIcon } from "lucide-react";

export type RouteScore = {
  id: string;
  route: string;
  score: number;
  gate: "ready" | "blocked" | "warning";
  feasible: number;
  novelty: number;
  impact: number;
  progress: number;
};

export type LiteratureRecord = {
  id: string;
  citation: string;
  finding: string;
  relevance: number;
  evidence: "high" | "medium" | "low";
  selected: boolean;
};

export type BoardColumn = {
  title: string;
  tone: "plan" | "active" | "validate" | "done" | "blocked";
  tasks: string[];
};

export type ArtifactNode = {
  path: string;
  status: "clean" | "modified" | "missing";
  depth: number;
};

export type ProviderService = {
  name: string;
  status: "running" | "offline";
  detail: string;
};

export type PermissionKey =
  | "localFirst"
  | "write"
  | "network"
  | "install"
  | "publish";

export type PermissionState = Record<PermissionKey, boolean>;

export type RunLogEntry = {
  time: string;
  label: string;
  tone: "ok" | "warn" | "blocked";
};

export type NavItem = {
  label: string;
  icon: LucideIcon;
};
