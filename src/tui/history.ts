import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const DEFAULT_HISTORY_LIMIT = 100;

export function tuiHistoryPath(): string {
  return join(resolve(process.env.IDEA2REPO_HOME || join(homedir(), ".idea2repo")), "tui", "input-history.json");
}

export async function readTuiInputHistory(path = tuiHistoryPath()): Promise<string[]> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string" && isHistorySafe(entry));
  } catch {
    return [];
  }
}

export async function writeTuiInputHistory(entries: string[], path = tuiHistoryPath()): Promise<void> {
  const safeEntries = entries.filter(isHistorySafe).slice(-DEFAULT_HISTORY_LIMIT);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try {
    await chmod(dirname(path), 0o700);
  } catch {}
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(safeEntries, null, 2) + "\n", "utf8");
  await chmod(tmp, 0o600);
  await rename(tmp, path);
  try {
    await chmod(path, 0o600);
  } catch {}
}

export function addHistoryEntry(entries: string[], value: string, limit = DEFAULT_HISTORY_LIMIT): string[] {
  const normalized = value.trim();
  if (!normalized || !isHistorySafe(normalized)) return entries;
  return [...entries.filter((entry) => entry !== normalized), normalized].slice(-limit);
}

export function isHistorySafe(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/code=|access_token|refresh_token|id_token|authorization code/i.test(text)) return false;
  if (/\/auth\/callback/i.test(text)) return false;
  if (/Bearer\s+[A-Za-z0-9._-]+/i.test(text)) return false;
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text)) return false;
  return true;
}
