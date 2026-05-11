import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { runtimeTimestamp, type EventSink, type Idea2RepoEvent } from "./events.js";

export const RUN_STATE_PATH = join(".idea2repo", "run_state.json");
const runStateWriteQueues = new Map<string, Promise<void>>();

export type RuntimeRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type PersistedRunState = {
  version: 1;
  id: string;
  idea: string;
  output_root: string;
  status: RuntimeRunStatus;
  created_at: string;
  updated_at: string;
  event_count: number;
  last_event_type?: Idea2RepoEvent["type"];
  result?: unknown;
  error?: string;
};

export function createRunState(input: { runId: string; idea: string; outputRoot: string; now?: string }): PersistedRunState {
  const now = input.now ?? runtimeTimestamp();
  return {
    version: 1,
    id: input.runId,
    idea: input.idea,
    output_root: input.outputRoot,
    status: "queued",
    created_at: now,
    updated_at: now,
    event_count: 0
  };
}

export function updateRunStateForEvent(state: PersistedRunState, event: Idea2RepoEvent): PersistedRunState {
  if (event.run_id !== state.id) return state;
  const next: PersistedRunState = {
    ...state,
    updated_at: event.timestamp,
    event_count: state.event_count + 1,
    last_event_type: event.type
  };
  if (event.type === "run.started") {
    next.status = "running";
    next.idea = event.idea;
    next.output_root = event.output_root;
  } else if (event.type === "run.completed") {
    next.status = "completed";
    delete next.error;
  } else if (event.type === "run.failed") {
    next.status = "failed";
    next.error = event.error;
  } else if (event.type === "run.cancelled") {
    next.status = "cancelled";
    next.error = event.reason;
  }
  return next;
}

export async function writeRunState(root: string, state: PersistedRunState): Promise<string> {
  const path = join(root, RUN_STATE_PATH);
  const previous = runStateWriteQueues.get(path) ?? Promise.resolve();
  const write = previous.catch(() => undefined).then(async () => {
    const existing = await readRunStateFile(path);
    const next = mergeRunState(existing, state);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(next, null, 2) + "\n", "utf8");
  });
  runStateWriteQueues.set(path, write);
  try {
    await write;
  } finally {
    if (runStateWriteQueues.get(path) === write) runStateWriteQueues.delete(path);
  }
  return path;
}

export async function readRunState(root: string): Promise<PersistedRunState> {
  const path = join(root, RUN_STATE_PATH);
  await runStateWriteQueues.get(path)?.catch(() => undefined);
  return JSON.parse(await readFile(path, "utf8")) as PersistedRunState;
}

async function readRunStateFile(path: string): Promise<PersistedRunState | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as PersistedRunState;
  } catch {
    return null;
  }
}

function mergeRunState(existing: PersistedRunState | null, incoming: PersistedRunState): PersistedRunState {
  if (!existing || existing.id !== incoming.id) return incoming;
  const existingFinal = isFinalRunStatus(existing.status);
  const incomingFinal = isFinalRunStatus(incoming.status);
  if (existingFinal && !incomingFinal) {
    return {
      ...existing,
      event_count: Math.max(existing.event_count, incoming.event_count),
      result: existing.result ?? incoming.result,
      error: existing.error ?? incoming.error
    };
  }
  const preferIncoming = incomingFinal || incoming.event_count >= existing.event_count;
  const next = preferIncoming ? { ...existing, ...incoming } : { ...incoming, ...existing };
  return {
    ...next,
    event_count: Math.max(existing.event_count, incoming.event_count),
    result: incoming.result ?? existing.result,
    ...(next.status === "completed" ? { error: undefined } : { error: incoming.error ?? existing.error })
  };
}

function isFinalRunStatus(status: RuntimeRunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export async function attachRunStateResult(root: string, runId: string, result: unknown): Promise<PersistedRunState> {
  const state = await readRunState(root);
  if (state.id !== runId) throw new Error(`run_state belongs to a different run: ${state.id}`);
  const next = {
    ...state,
    result,
    updated_at: runtimeTimestamp()
  };
  await writeRunState(root, next);
  return next;
}

export class RunStateEventSink implements EventSink {
  private state: PersistedRunState;

  constructor(
    private readonly root: string,
    runId: string,
    input: { idea: string; outputRoot: string; now?: string },
    private readonly downstream?: EventSink
  ) {
    this.state = createRunState({ runId, idea: input.idea, outputRoot: input.outputRoot, now: input.now });
  }

  current(): PersistedRunState {
    return this.state;
  }

  async emit(event: Idea2RepoEvent): Promise<void> {
    this.state = updateRunStateForEvent(this.state, event);
    await writeRunState(this.root, this.state);
    await this.downstream?.emit(event);
  }
}
