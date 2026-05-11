import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { approvalPolicyForMode } from "../src/runtime/approvals.js";
import { refreshManifestArtifactHashes, restoreArtifactSnapshot, snapshotArtifact, listArtifactSnapshots } from "../src/runtime/artifacts.js";
import { EventBus } from "../src/runtime/events.js";
import { createCoreToolRegistry, createToolContext } from "../src/runtime/tools.js";
import { exists, status, writeManifest, writeText } from "../src/state.js";

test("artifact snapshots restore old content and refresh manifest hashes", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-artifacts-"));
  try {
    const artifactPath = join(root, "docs", "note.md");
    await writeText(artifactPath, "old\n");
    await writeManifest(root, {
      projectName: "project",
      idea: "snapshot idea",
      timelineWeeks: 12,
      resources: [],
      stack: "python",
      createdAt: "2026-05-11",
      files: [artifactPath],
      permissions: {},
      workspace: {}
    });

    const snapshot = await snapshotArtifact(root, "docs/note.md", { runId: "run-1" });
    assert.ok(snapshot);
    await writeText(artifactPath, "new\n");
    await refreshManifestArtifactHashes(root, ["docs/note.md"]);
    assert.equal((await status(root)).modified_artifacts.length, 0);

    await restoreArtifactSnapshot(root, { snapshotId: snapshot.id, runId: "run-1" });
    assert.equal(await readFile(artifactPath, "utf8"), "old\n");
    assert.equal((await status(root)).modified_artifacts.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact.write snapshots overwritten artifacts before writing", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-artifact-tool-snapshot-"));
  try {
    await writeText(join(root, "docs", "note.md"), "old\n");
    const events: string[] = [];
    const bus = new EventBus();
    bus.subscribe((event) => events.push(event.type));
    const registry = createCoreToolRegistry();
    await registry.execute(
      "artifact.write",
      { path: "docs/note.md", content: "new\n" },
      createToolContext({
        runId: "run-1",
        outputRoot: root,
        events: bus,
        permissions: approvalPolicyForMode("generate", { allowOverwrite: true })
      })
    );

    assert.equal(await readFile(join(root, "docs", "note.md"), "utf8"), "new\n");
    assert.equal((await listArtifactSnapshots(root)).length, 1);
    assert.ok(events.includes("artifact.snapshot"));
    assert.ok(events.includes("artifact.written"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact.write records create snapshots and restore removes created artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-artifact-create-snapshot-"));
  try {
    await writeManifest(root, {
      projectName: "project",
      idea: "snapshot create idea",
      timelineWeeks: 12,
      resources: [],
      stack: "python",
      createdAt: "2026-05-11",
      files: [],
      permissions: {},
      workspace: {}
    });
    const events: string[] = [];
    const bus = new EventBus();
    bus.subscribe((event) => events.push(event.type));
    const registry = createCoreToolRegistry();
    await registry.execute(
      "artifact.write",
      { path: "docs/new.md", content: "new\n" },
      createToolContext({
        runId: "run-1",
        outputRoot: root,
        events: bus,
        permissions: approvalPolicyForMode("generate", { allowOverwrite: true })
      })
    );

    const snapshots = await listArtifactSnapshots(root);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]?.operation, "create");
    assert.equal(snapshots[0]?.path, "docs/new.md");
    assert.equal((await status(root)).total_artifacts, 1);

    await restoreArtifactSnapshot(root, { snapshotId: snapshots[0]?.id, runId: "run-1", events: bus });
    assert.equal(await exists(join(root, "docs", "new.md")), false);
    assert.equal((await status(root)).total_artifacts, 0);
    assert.ok(events.includes("artifact.snapshot"));
    assert.ok(events.includes("artifact.written"));
    assert.ok(events.includes("artifact.restored"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
