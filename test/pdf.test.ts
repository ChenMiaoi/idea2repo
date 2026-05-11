import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildPdfChunkIndex, chunkPdf } from "../src/skills/pdf/chunk.js";
import { acquirePdf, acquirePdfs } from "../src/skills/pdf/acquire.js";
import { parsePdf } from "../src/skills/pdf/parse.js";
import { isPdf } from "../src/skills/pdf/validate.js";
import type { PdfManifestRecord } from "../src/skills/pdf/provenance.js";
import type { LiteraturePaperCandidate } from "../src/literature.js";

const tinyPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nstream\nAgent Benchmark Evaluation\nendstream\n%%EOF\n", "latin1");

test("PDF acquisition records sha256 bytes status and provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-pdf-"));
  try {
    const record = await acquirePdf(candidate({ pdf_urls: ["https://arxiv.org/pdf/1234.5678"] }), {
      outputRoot: root,
      allowNetwork: true,
      downloadPdfs: true,
      fetchImpl: async () => new Response(tinyPdf, { status: 200, headers: { "content-type": "application/pdf" } }),
      now: () => "2026-05-11T00:00:00Z"
    });
    assert.equal(record.status, "downloaded");
    assert.equal(record.bytes, tinyPdf.byteLength);
    assert.equal(record.license_hint, "arXiv");
    assert.equal(record.downloaded_at, "2026-05-11T00:00:00Z");
    assert.equal(record.pdf_sha256?.length, 64);
    assert.equal(isPdf(await readFile(join(root, record.pdf_path!))), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PDF acquisition records graceful unavailable and failed entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-pdf-missing-"));
  try {
    const records = await acquirePdfs(
      [
        candidate({ candidate_id: "missing", pdf_urls: [] }),
        candidate({ candidate_id: "bad", pdf_urls: ["https://arxiv.org/pdf/bad"] }),
        candidate({ candidate_id: "unknown", pdf_urls: ["https://example.org/not.pdf"] })
      ],
      {
        outputRoot: root,
        allowNetwork: true,
        downloadPdfs: true,
        fetchImpl: async () => new Response("not pdf", { status: 200 })
      }
    );
    assert.equal(records[0]?.status, "not_available");
    assert.equal(records[1]?.status, "failed");
    assert.match(records[1]?.reason ?? "", /not a PDF/);
    assert.equal(records[2]?.status, "skipped_license");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PDF download requires explicit network permission", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-pdf-permission-"));
  try {
    const record = await acquirePdf(candidate({ pdf_urls: ["https://arxiv.org/pdf/1234.5678"] }), {
      outputRoot: root,
      downloadPdfs: true,
      fetchImpl: async () => {
        throw new Error("fetch should not run without allowNetwork");
      }
    });
    assert.equal(record.status, "not_available");
    assert.match(record.reason ?? "", /allowNetwork/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PDF acquisition propagates cancellation from download fetches", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-pdf-cancel-"));
  const controller = new AbortController();
  let sawSignal = false;
  try {
    await assert.rejects(
      acquirePdfs([candidate({ pdf_urls: ["https://arxiv.org/pdf/1234.5678"] })], {
        outputRoot: root,
        allowNetwork: true,
        downloadPdfs: true,
        signal: controller.signal,
        fetchImpl: async (_input, init) => {
          sawSignal = init?.signal instanceof AbortSignal;
          controller.abort("pdf cancelled");
          throw new Error("fetch failed after cancellation");
        }
      }),
      /pdf cancelled/
    );
    assert.equal(sawSignal, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PDF parse and chunk assign stable page chunk ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-pdf-parse-"));
  try {
    const path = join(root, "paper.pdf");
    await writeFile(path, tinyPdf);
    const parsed = await parsePdf(path);
    assert.equal(parsed.page_count, 1);
    const chunks = chunkPdf(parsed, 20);
    assert.equal(chunks[0]?.chunk_id, "p1-c1");
    assert.equal(chunks[0]?.page, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PDF chunk index propagates cancellation before hidden parse work", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-pdf-chunk-cancel-"));
  const controller = new AbortController();
  try {
    const path = join(root, "paper.pdf");
    await writeFile(path, tinyPdf);
    const manifest: PdfManifestRecord[] = [{
      paper_id: "agent-benchmark",
      source_url: "https://arxiv.org/pdf/1234.5678",
      pdf_path: "paper.pdf",
      pdf_sha256: "0".repeat(64),
      bytes: tinyPdf.byteLength,
      title_match_score: 1,
      license_hint: "arXiv",
      downloaded_at: "2026-05-11T00:00:00Z",
      status: "downloaded"
    }];
    controller.abort("chunk cancelled");
    await assert.rejects(buildPdfChunkIndex(root, manifest, { signal: controller.signal }), /chunk cancelled/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function candidate(overrides: Partial<LiteraturePaperCandidate>): LiteraturePaperCandidate {
  return {
    candidate_id: "agent-benchmark",
    title: "Agent Benchmark Evaluation",
    authors: ["Ada Lovelace"],
    year: 2026,
    source_urls: ["https://example.org/paper"],
    pdf_urls: [],
    retrieval_sources: ["test"],
    retrieval_queries: ["agent benchmark"],
    confidence: "high",
    ...overrides
  };
}
