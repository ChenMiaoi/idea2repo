import { describe, expect, it } from "vitest";
import { buildApiUrl, runtimeEventTypes, subscribeRunEvents, type EventSourceLike } from "./api";
import type { RuntimeEvent } from "./types";

describe("api helpers", () => {
  it("keeps relative paths when no API base is configured", () => {
    expect(buildApiUrl("/generate", "")).toBe("/generate");
  });

  it("joins configured API bases without duplicate slashes", () => {
    expect(buildApiUrl("/generate", "http://127.0.0.1:8000")).toBe(
      "http://127.0.0.1:8000/generate"
    );
  });

  it("subscribes to runtime SSE events for runs", () => {
    const sources: FakeEventSource[] = [];
    const events: RuntimeEvent[] = [];
    let closeCount = 0;
    const subscription = subscribeRunEvents(
      "run-1",
      { onEvent: (event) => events.push(event), onClose: () => closeCount += 1 },
      "http://127.0.0.1:8000",
      (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      }
    );
    const source = sources[0]!;

    expect(source.url).toBe("http://127.0.0.1:8000/runs/run-1/events");
    source.emit("stage.started", {
      type: "stage.started",
      run_id: "run-1",
      stage_id: "idea_intake",
      label: "Idea intake",
      timestamp: "2026-01-01T00:00:00Z"
    });
    subscription.close();

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("stage.started");
    expect(source.closed).toBe(true);
    expect(closeCount).toBe(1);
  });

  it("subscribes to research-native runtime events", () => {
    const sources: FakeEventSource[] = [];
    const events: RuntimeEvent[] = [];
    subscribeRunEvents(
      "run-1",
      { onEvent: (event) => events.push(event) },
      "http://127.0.0.1:8000",
      (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      }
    );
    const source = sources[0]!;
    expect(runtimeEventTypes).toEqual(expect.arrayContaining(["stage.blocked", "paper.found", "pdf.downloaded", "evidence.extracted", "question.asked", "score.updated"]));

    source.emit("score.updated", {
      type: "score.updated",
      run_id: "run-1",
      score: 70,
      max_score: 100,
      confidence: 0.8,
      hard_blockers: [],
      timestamp: "2026-01-01T00:00:00Z"
    });

    expect(events[0]?.type).toBe("score.updated");
  });

  it("closes runtime SSE subscriptions on final events without error", () => {
    const sources: FakeEventSource[] = [];
    const errors: string[] = [];
    let closeCount = 0;
    subscribeRunEvents(
      "run-1",
      {
        onEvent: () => undefined,
        onError: (message) => errors.push(message),
        onClose: () => closeCount += 1
      },
      "http://127.0.0.1:8000",
      (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      }
    );
    const source = sources[0]!;

    source.emit("run.completed", {
      type: "run.completed",
      run_id: "run-1",
      timestamp: "2026-01-01T00:00:00Z"
    });
    source.onerror?.(new Event("error"));

    expect(source.closed).toBe(true);
    expect(errors).toEqual([]);
    expect(closeCount).toBe(1);
  });
});

class FakeEventSource implements EventSourceLike {
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
  closed = false;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener);
  }

  emit(type: string, data: unknown): void {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }

  close(): void {
    this.closed = true;
  }
}
