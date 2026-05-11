import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CompositeEventSink, EventBus, JsonlEventSink, readJsonlEvents, runtimeTimestamp, type Idea2RepoEvent } from "../src/runtime/events.js";

test("EventBus publishes events to subscribers and supports unsubscribe", () => {
  const bus = new EventBus();
  const events: Idea2RepoEvent[] = [];
  const unsubscribe = bus.subscribe((event) => events.push(event));
  const event = { type: "run.started", run_id: "run-1", idea: "test", output_root: "out", timestamp: runtimeTimestamp(new Date("2026-05-11T00:00:00Z")) } satisfies Idea2RepoEvent;

  bus.emit(event);
  unsubscribe();
  bus.emit({ type: "run.completed", run_id: "run-1", timestamp: event.timestamp });

  assert.deepEqual(events, [event]);
});

test("JsonlEventSink appends typed events and creates parent directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-events-"));
  const path = join(root, ".idea2repo", "trace.jsonl");
  try {
    const sink = new JsonlEventSink(path);
    await sink.emit({ type: "stage.started", run_id: "run-1", stage_id: "idea_intake", label: "Idea intake", timestamp: "2026-05-11T00:00:00Z" });
    await sink.emit({ type: "stage.completed", run_id: "run-1", stage_id: "idea_intake", artifacts: ["docs/idea/idea_brief.md"], timestamp: "2026-05-11T00:00:01Z" });

    const events = await readJsonlEvents(path);
    assert.equal(events.length, 2);
    assert.equal(events[0]?.type, "stage.started");
    assert.equal(events[1]?.type, "stage.completed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CompositeEventSink forwards events in order", async () => {
  const seen: string[] = [];
  const sink = new CompositeEventSink([
    {
      emit: (event) => {
        seen.push(`a:${event.type}`);
      }
    },
    {
      emit: (event) => {
        seen.push(`b:${event.type}`);
      }
    }
  ]);

  await sink.emit({ type: "run.completed", run_id: "run-1", timestamp: "2026-05-11T00:00:00Z" });

  assert.deepEqual(seen, ["a:run.completed", "b:run.completed"]);
});
