import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { resolveTemplateProfile } from "../src/skills/templates/resolve.js";
import { renderPaper } from "../src/skills/templates/render.js";
import { checkTemplateCompliance } from "../src/skills/templates/compliance.js";
import { ensureChild, writeText } from "../src/state.js";

test("ACM renderer produces anonymous venue-aware main.tex", async () => {
  const { profile } = await resolveTemplateProfile({ venue: "ACM CCS" });
  const rendered = renderPaper({ profile, projectName: "demo", title: "Evidence First Agents", anonymous: true, reviewMode: "anonymous" });
  const main = rendered.files["paper/main.tex"]!;
  assert.match(main, /\\documentclass\[sigconf,review,anonymous\]\{acmart\}/);
  assert.match(main, /\\settopmatter\{printacmref=false\}/);
  assert.doesNotMatch(main, /\\author\{/);
  assert.doesNotMatch(main, /\\affiliation\{/);
  assert.match(main, /\\bibliographystyle\{ACM-Reference-Format\}/);
  assert.match(main, /\\bibliography\{references\}/);
});

test("ACM renderer applies camera-ready mode without anonymous review options", async () => {
  const { profile } = await resolveTemplateProfile({ venue: "ACM CCS" });
  const rendered = renderPaper({ profile, projectName: "demo", title: "Evidence First Agents", anonymous: false, reviewMode: "camera_ready" });
  const main = rendered.files["paper/main.tex"]!;
  assert.match(main, /\\documentclass\[sigconf\]\{acmart\}/);
  assert.doesNotMatch(main, /\\documentclass\[[^\]]*(review|anonymous)/);
  assert.match(main, /\\author\{/);
  assert.match(rendered.files["paper/template/render_config.json"]!, /"review_mode": "camera_ready"/);
});

test("IEEE renderer produces conference main.tex with correct references path", async () => {
  const { profile } = await resolveTemplateProfile({ venue: "IEEE S&P" });
  const rendered = renderPaper({ profile, projectName: "demo", title: "Evidence First Systems", anonymous: true });
  const main = rendered.files["paper/main.tex"]!;
  assert.match(main, /\\documentclass\[conference\]\{IEEEtran\}/);
  assert.match(main, /\\maketitle/);
  assert.match(main, /\\begin\{abstract\}/);
  assert.match(main, /\\bibliographystyle\{IEEEtran\}/);
  assert.match(main, /\\bibliography\{references\}/);
});

test("template compliance passes anonymous render and fails missing checklist", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-paper-"));
  try {
    const { profile } = await resolveTemplateProfile({ venue: "ACM CCS" });
    const rendered = renderPaper({ profile, projectName: "demo", title: "Evidence First Agents", anonymous: true });
    for (const [relativePath, content] of Object.entries(rendered.files)) await writeText(ensureChild(root, relativePath), content);
    const passed = await checkTemplateCompliance(root, { profile, anonymous: true, strict: true });
    assert.equal(passed.status, "passed");
    await unlink(join(root, "paper/checklist/reproducibility_checklist.tex"));
    const failed = await checkTemplateCompliance(root, { profile, anonymous: true, strict: true });
    assert.equal(failed.status, "failed");
    assert.ok(failed.errors.some((error) => /checklist/i.test(error)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("paper CLI renders checks and packages Overleaf zip", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-paper-cli-"));
  const output = join(root, "project");
  try {
    assert.equal(await main(["paper", "render", "--output", output, "--venue", "ACM CCS", "--mode", "review", "--title", "Evidence First Agents"]), 0);
    assert.equal(await main(["paper", "check", "--output", output, "--strict"]), 0);
    assert.equal(await main(["paper", "package", "--output", output, "--for-overleaf"]), 0);
    assert.equal((await stat(join(output, "paper/main.tex"))).isFile(), true);
    assert.equal((await stat(join(output, "docs/submission/template_compliance_report.md"))).isFile(), true);
    const zip = await readFile(join(output, "paper/submission/overleaf.zip"));
    assert.equal(zip.subarray(0, 2).toString("utf8"), "PK");
    assert.ok((await stat(join(output, "paper/submission/submission.zip"))).size > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("paper check exits nonzero on hard failures and preserves rendered camera-ready mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-paper-cli-fail-"));
  const output = join(root, "project");
  try {
    assert.equal(await main(["paper", "render", "--output", output, "--venue", "ACM CCS", "--mode", "camera-ready", "--title", "Evidence First Agents"]), 0);
    assert.equal(await main(["paper", "check", "--output", output]), 0);
    const mainTex = await readFile(join(output, "paper/main.tex"), "utf8");
    assert.doesNotMatch(mainTex, /review,anonymous/);
    await unlink(join(output, "paper/checklist/reproducibility_checklist.tex"));
    assert.equal(await main(["paper", "check", "--output", output]), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
