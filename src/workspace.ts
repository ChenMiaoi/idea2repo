import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export type WorkspaceSnapshot = {
  cwd: string;
  git_root: string | null;
  git_branch: string | null;
  git_status_short: string[];
  tracked_files: number | null;
};

export function inspectWorkspace(cwd = process.cwd()): WorkspaceSnapshot {
  const root = resolve(cwd);
  const gitRoot = git(root, ["rev-parse", "--show-toplevel"]);
  const branch = gitRoot ? git(root, ["branch", "--show-current"]) : null;
  const status = gitRoot ? git(root, ["status", "--short"]) : null;
  const tracked = gitRoot ? git(root, ["ls-files"]) : null;
  return {
    cwd: root,
    git_root: gitRoot?.trim() || null,
    git_branch: branch?.trim() || null,
    git_status_short: (status ?? "").split(/\r?\n/).filter(Boolean),
    tracked_files: tracked == null ? null : tracked.split(/\r?\n/).filter(Boolean).length
  };
}

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}
