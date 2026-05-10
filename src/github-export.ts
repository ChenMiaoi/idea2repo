import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, stat, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { defaultPolicy, requirePermission, type PermissionPolicy } from "./permissions.js";
import { containsSecretMaterial } from "./providers.js";
import { proxyEnvForChild } from "./proxy.js";

const execFileAsync = promisify(execFile);

export type GithubIssue = {
  title: string;
  body: string;
  labels: string[];
};

export type GithubExportPlan = {
  dry_run: boolean;
  repo_name: string;
  source: string;
  issues: GithubIssue[];
  would_create_issues: number;
  pull_request: {
    title: string;
    body: string;
    base: string;
    draft: string;
  };
  publish_performed: boolean;
};

export type CommandRunner = (command: string[], cwd: string) => Promise<void>;

export async function buildGithubExportPlan(
  output: string,
  options: { repoName?: string; createIssues?: boolean } = {}
): Promise<GithubExportPlan> {
  const root = resolve(output);
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) throw new Error(`output not found: ${root}`);
  const repoName = safeRepoName(options.repoName || root.split(/[\\/]/).pop() || "idea2repo-project");
  const issues = options.createIssues === false ? [] : await issuePayloads(root);
  rejectSecretPayloads(issues);
  return {
    dry_run: true,
    repo_name: repoName,
    source: root,
    issues,
    would_create_issues: issues.length,
    pull_request: {
      title: "Draft: Idea2Repo research scaffold",
      body: "Generated from local Idea2Repo artifacts. Validate evidence, security scope, and provider settings before publishing.",
      base: "main",
      draft: "true"
    },
    publish_performed: false
  };
}

export async function publishWithGh(
  plan: GithubExportPlan,
  options: { permissionPolicy?: PermissionPolicy; runner?: CommandRunner } = {}
): Promise<GithubExportPlan> {
  const policy = options.permissionPolicy ?? defaultPolicy();
  requirePermission(policy, "publish", "GitHub export");
  rejectSecretPayloads(plan.issues);
  const publishFiles = await scannedPublishFiles(plan.source);
  const runner = options.runner ?? defaultRunner;
  const tmp = await mkdtemp(join(tmpdir(), "idea2repo-github-"));
  const publishRoot = join(tmp, plan.repo_name);
  await mkdir(publishRoot, { recursive: true });
  const copied = await copyPublishTree(plan.source, publishRoot, publishFiles);
  await prepareGitRepository(publishRoot, copied, runner);
  await runner(["gh", "repo", "create", plan.repo_name, "--private", "--source", publishRoot, "--remote", "origin", "--push"], publishRoot);
  for (const issue of plan.issues) {
    const command = ["gh", "issue", "create", "--title", issue.title, "--body", issue.body];
    if (issue.labels.length) command.push("--label", issue.labels.join(","));
    await runner(command, publishRoot);
  }
  return { ...plan, dry_run: false, publish_performed: true };
}

async function issuePayloads(root: string): Promise<GithubIssue[]> {
  const issues: GithubIssue[] = [];
  const todoPath = join(root, "docs/execution_plan/todo.md");
  const todo = await readTextIfExists(todoPath);
  for (const line of todo.split(/\r?\n/)) {
    if (!line.startsWith("- ")) continue;
    const item = line.slice(2).trim();
    if (!item) continue;
    issues.push({
      title: truncateTitle(`Research task: ${item}`),
      body: `Source: \`docs/execution_plan/todo.md\`\n\n${item}`,
      labels: ["research", "todo"]
    });
  }
  const milestonePath = join(root, "docs/execution_plan/milestones.md");
  const milestones = await readTextIfExists(milestonePath);
  for (const line of milestones.split(/\r?\n/)) {
    if (!line.startsWith("| M")) continue;
    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 3 || cells[0]?.toLowerCase() === "milestone") continue;
    issues.push({
      title: truncateTitle(`Milestone: ${cells[0]} ${cells[1]}`),
      body: `Source: \`docs/execution_plan/milestones.md\`\n\nExit criteria: ${cells[1]}`,
      labels: ["research", "milestone"]
    });
  }
  return issues;
}

function rejectSecretPayloads(issues: GithubIssue[]): void {
  for (const issue of issues) {
    if (containsSecretMaterial(JSON.stringify(issue))) {
      throw new Error("refusing to export issue with secret-like material");
    }
  }
}

async function scannedPublishFiles(root: string): Promise<string[]> {
  const files = await candidatePublishFiles(root);
  const accepted: string[] = [];
  for (const path of files) {
    let text = "";
    try {
      text = await readFile(path, "utf8");
    } catch {
      continue;
    }
    if (containsSecretMaterial(text)) {
      throw new Error(`refusing to publish secret-like material in ${toPosix(relative(root, path))}`);
    }
    accepted.push(path);
  }
  return accepted;
}

async function candidatePublishFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = toPosix(relative(root, path));
      if (isPublishIgnored(rel)) continue;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await walk(root);
  return files.sort();
}

function isPublishIgnored(relativePath: string): boolean {
  const parts = relativePath.split("/");
  const loweredParts = parts.map((part) => part.toLowerCase());
  const ignoredDirs = new Set([
    ".git",
    ".idea2repo",
    ".venv",
    "venv",
    "node_modules",
    "dist",
    ".vite",
    ".turbo",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "__pycache__"
  ]);
  if (loweredParts.some((part) => ignoredDirs.has(part))) return true;
  if (["artifacts", "runs", "outputs", "datasets", "pdfs", "checkpoints", "models", "wandb", "mlruns"].includes(loweredParts[0] ?? "")) return true;
  if (loweredParts[0] === "data" && ["raw", "processed"].includes(loweredParts[1] ?? "")) return true;
  if (loweredParts[0] === "results" && ["logs", "tables", "figures"].includes(loweredParts[1] ?? "")) return true;
  const name = loweredParts[loweredParts.length - 1] ?? "";
  if (
    new Set([
      ".ds_store",
      "thumbs.db",
      ".env",
      ".env.local",
      ".env.development",
      ".env.production",
      ".env.test",
      "credentials.json",
      "token.json",
      "cookies.txt",
      "secrets.json",
      ".netrc",
      "_netrc",
      "id_rsa",
      "id_dsa",
      "id_ecdsa",
      "id_ed25519"
    ]).has(name)
  ) {
    return true;
  }
  if (name.startsWith(".env.") && name !== ".env.example") return true;
  if (["credential", "credentials", "token", "secret"].some((token) => name.includes(token))) return true;
  return [".pem", ".key", ".crt", ".p12", ".pfx", ".jks", ".keystore", ".sqlite", ".sqlite3", ".db", ".pid", ".ckpt", ".pt", ".pth", ".safetensors", ".onnx", ".gguf", ".parquet", ".feather", ".arrow", ".zip", ".tar", ".tar.gz", ".7z"].some((suffix) => name.endsWith(suffix));
}

async function copyPublishTree(root: string, publishRoot: string, publishFiles: string[]): Promise<string[]> {
  const copied: string[] = [];
  for (const source of publishFiles) {
    const rel = relative(root, source);
    const destination = join(publishRoot, rel);
    await mkdir(destination.split(/[\\/]/).slice(0, -1).join("/") || publishRoot, { recursive: true });
    await copyFile(source, destination);
    copied.push(destination);
  }
  return copied;
}

async function prepareGitRepository(root: string, publishFiles: string[], runner: CommandRunner): Promise<void> {
  await runner(["git", "init"], root);
  for (const batch of batches(publishFiles.map((file) => toPosix(relative(root, file))), 80)) {
    await runner(["git", "add", "--", ...batch], root);
  }
  await runner(["git", "-c", "user.name=Idea2Repo", "-c", "user.email=idea2repo@example.invalid", "commit", "--allow-empty", "-m", "chore: initialize Idea2Repo scaffold"], root);
}

async function defaultRunner(command: string[], cwd: string): Promise<void> {
  await execFileAsync(command[0]!, command.slice(1), { cwd, env: proxyEnvForChild() });
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function safeRepoName(value: string): string {
  const cleaned = value
    .split("")
    .map((char) => (/[A-Za-z0-9_.-]/.test(char) ? char : "-"))
    .join("")
    .replace(/^[._-]+|[._-]+$/g, "");
  return cleaned.slice(0, 100) || "idea2repo-project";
}

function truncateTitle(value: string): string {
  return value.length > 100 ? `${value.slice(0, 97)}...` : value;
}

function toPosix(value: string): string {
  return value.split("\\").join("/");
}
