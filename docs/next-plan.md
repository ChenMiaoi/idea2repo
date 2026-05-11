# Idea2Repo Next Plan

## Summary

Idea2Repo 已经完成 TypeScript/Node/TUI 迁移，并且目标形态已经明确为 CCF-A readiness research repository generator。当前核心缺口不是更多模板文档，而是缺少证据驱动的研究流水线：

- 文献检索仍是占位能力。
- PDF 下载、解析、证据抽取尚未接入。
- 相关工作、差异分析、严格评分、改进方案还没有形成可审计阶段。
- Paper scaffold 仍是通用 LaTeX 骨架，还不是 venue-aware submission package。

下一阶段应把 Idea2Repo 从“更长的 Codex prompt”推进为 **Evidence-first Research Pipeline**：确定性 TypeScript skills 负责检索、下载、解析、校验和写文件；Codex agents 负责研究判断、差异分析、评分和策略改进。

## Design Principles

1. **Do not let Codex invent papers.**
   Codex 只能基于 search skill、PDF skill 和 verified paper notes 做分析。

2. **Evidence gates must cap scores.**
   没有 verified related work、PDF evidence、baseline、dataset、metric 时，严格评分必须触发上限。

3. **PDF provenance is mandatory.**
   每个 PDF 至少记录 `source_url`、`downloaded_at`、`sha256`、`bytes`、`license_hint`、`title_match_score` 和 `status`。

4. **Better idea synthesis happens last.**
   只有完成 related work、novelty collision 和 strict scoring 后，research strategist 才能提出更好的方向。

5. **Every stage must be resumable.**
   检索和 PDF 下载经常失败；单篇 PDF 失败不能导致整条 pipeline 失败。

## Target Architecture

```text
src/
  pipeline/
    research-pipeline.ts
    stages.ts
    stage-state.ts

  agents/
    agent-runner.ts
    schemas.ts
    prompts/
      00_intake_router.md
      01_search_planner.md
      02_candidate_triage.md
      03_pdf_paper_reader.md
      04_related_work_analyst.md
      05_novelty_gap_analyst.md
      06_ccf_a_reviewer.md
      07_feasibility_reviewer.md
      08_research_strategist.md
      09_artifact_writer.md
      10_venue_template_selector.md
      11_latex_template_packager.md
      12_template_compliance_reviewer.md

  skills/
    literature/
      search.ts
      dedupe.ts
      rank.ts
      adapters/
        openalex.ts
        crossref.ts
        arxiv.ts
        dblp.ts
        semantic-scholar.ts
        acl-anthology.ts

    pdf/
      acquire.ts
      validate.ts
      parse.ts
      chunk.ts
      provenance.ts

    analysis/
      evidence-extract.ts
      related-work-matrix.ts
      novelty-matrix.ts
      ccf-a-score.ts
      idea-refine.ts

    templates/
      catalog.ts
      resolve.ts
      render.ts
      compile.ts
      compliance.ts

data/
  skills/
    literature-search.skill.md
    pdf-acquisition.skill.md
    pdf-reading.skill.md
    evidence-extraction.skill.md
    related-work-analysis.skill.md
    novelty-analysis.skill.md
    ccf-a-review.skill.md
    feasibility-review.skill.md
    research-strategy.skill.md

  template_profiles/
    acm-sigconf.json
    ieee-conference.json
    acl-anthology.json
    usenix-security.json
    neurips.json
    iclr.json
    cvf.json
    springer-lncs.json

  latex_templates/
    acm-sigconf/
    ieee-conference/
    acl/
    usenix/
    neurips/
    iclr/
    cvf/
```

## Research Pipeline

| Stage | Agent Prompt | Skills | Artifacts | Gate |
| --- | --- | --- | --- | --- |
| 0. Idea intake | `00_intake_router.md` | idea normalization, domain routing | `docs/idea/idea_brief.md` | idea 不能为空；问题、方法、场景至少能解析 |
| 1. Search planning | `01_search_planner.md` | query expansion, venue routing | `docs/relative_work/search_plan.json` | 至少 5 个 precision queries 和 5 个 recall queries |
| 2. Literature search | deterministic | OpenAlex, Crossref, arXiv, DBLP, Semantic Scholar, ACL | `docs/relative_work/candidates.json` | 候选论文不足 N 时扩大 query |
| 3. Candidate triage | `02_candidate_triage.md` | dedupe, rank, CCF venue filter | `docs/relative_work/triage_report.md` | 至少 8 篇 core papers，最好 15-30 篇 expanded papers |
| 4. PDF acquisition | deterministic | PDF download, license/provenance, hash | `docs/reference/pdf_manifest.json`, `docs/reference/pdfs/*.pdf` | 只下载合法可访问 PDF；每个 PDF 有 sha256 |
| 5. PDF reading | `03_pdf_paper_reader.md` | PDF parse, chunk, quote extraction | `docs/reference/paper_notes/<paper_id>.md` | 每个结论必须带 page、quote、chunk id |
| 6. Related work analysis | `04_related_work_analyst.md` | cluster, matrix builder | `docs/relative_work/related_work_matrix.csv`, `docs/relative_work/topic_clusters.md` | 不允许用未读 PDF 的论文做强结论 |
| 7. Novelty analysis | `05_novelty_gap_analyst.md` | novelty matrix, collision risk | `docs/relative_work/novelty_gap_matrix.md` | idea 与已有工作高度重合时触发创新性上限 |
| 8. CCF-A strict scoring | `06_ccf_a_reviewer.md` | CCF-A rubric, cap rules | `docs/diagnosis/ccf_a_strict_scorecard.md` | 无证据不能高分 |
| 9. Feasibility review | `07_feasibility_reviewer.md` | resource/timeline/risk analysis | `docs/diagnosis/feasibility_report.md` | 12 周、单人、无 GPU 等约束必须建模 |
| 10. Better idea synthesis | `08_research_strategist.md` | idea refinement, experiment design | `docs/proposal/revised_idea.md`, `docs/proposal/experiment_plan.md` | 新 idea 必须解决 novelty collision 和 feasibility risk |
| 11. Artifact writer | `09_artifact_writer.md` | repo writer, manifest updater | all docs / paper / issues | artifacts 必须可验证、可 resume |
| 12. Venue template packaging | `10-12` template prompts | template resolver, renderer, checker | `docs/submission/*`, `paper/*` | template profile、anonymity、compile/compliance 状态可审计 |

## CLI Shape

```bash
idea2repo research "..." \
  --allow-network \
  --download-pdfs \
  --max-papers 20 \
  --strict-ccf-a \
  --venue "ACM CCS" \
  --review-mode anonymous \
  --compile-paper \
  --package-overleaf \
  --output generated_repos/demo
```

Additional staged commands:

```bash
idea2repo literature plan --output generated_repos/demo
idea2repo literature search --output generated_repos/demo --allow-network
idea2repo literature download --output generated_repos/demo --download-pdfs
idea2repo papers analyze --output generated_repos/demo
idea2repo score --output generated_repos/demo --strict-ccf-a
idea2repo refine --output generated_repos/demo

idea2repo templates list
idea2repo templates validate
idea2repo templates show --venue "ACM CCS"
idea2repo templates show --family acm

idea2repo paper render --output generated_repos/demo --venue "ACM CCS" --mode review
idea2repo paper check --output generated_repos/demo --strict
idea2repo paper package --output generated_repos/demo --for-overleaf
```

## Generate Integration

Current `generateResearchRepo()` flow:

```ts
const providerAnalysis = await analyzeWithProvider(...);
const analysis = providerAnalysis.analysis;
const literatureTasks = options.literatureTasks ?? analysis?.related_work_queries ?? [];
const evidenceGate = evaluateEvidenceGate(options.verifiedPapers ?? [], ...);
```

Proposed flow:

```ts
const pipeline = options.runResearchPipeline
  ? await runResearchPipeline(idea, {
      allowNetwork: policy.allowNetwork,
      downloadPdfs: options.downloadPdfs,
      maxPapers: options.maxPapers ?? 20,
      requestedDomains: options.requestedDomains,
      timelineWeeks,
      resources: options.resources ?? [],
      stack,
      provider: selectedProvider,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      progress: options.progressCallback
    })
  : null;

const verifiedPapers = options.verifiedPapers ?? pipeline?.verifiedPapers ?? [];
const baselines = options.baselines ?? pipeline?.baselineRecommendations ?? [];
const datasets = options.datasets ?? pipeline?.datasetRecommendations ?? [];
const metrics = options.metrics ?? pipeline?.metricRecommendations ?? [];
const claimEvidenceRows =
  options.claimEvidenceRows ??
  pipeline?.claimEvidenceRows ??
  (analysis ? analysisClaimEvidenceRows(analysis) : undefined);
```

New `GenerateOptions`:

```ts
runResearchPipeline?: boolean;
allowNetwork?: boolean;
downloadPdfs?: boolean;
maxPapers?: number;
sources?: string[];
strictCcfA?: boolean;
venue?: string;
template?: string;
reviewMode?: "anonymous" | "camera-ready" | "non-anonymous";
paperType?: "full" | "short" | "demo" | "dataset" | "system" | "benchmark";
templateYear?: number;
compilePaper?: boolean;
packageOverleaf?: boolean;
```

## Agent Prompts

### 00 Intake Router

Goal: convert an early-stage idea into a precise research brief for literature search and CCF-A evaluation.

Rules:

- Do not judge novelty yet.
- Do not invent related work.
- Extract explicit assumptions.
- Identify missing information only if it blocks search or feasibility analysis.
- Prefer concrete problem, setting, method, and evaluation dimensions.

Return JSON:

```json
{
  "idea_summary": "",
  "problem": "",
  "target_domain": "",
  "target_venues": [],
  "method_keywords": [],
  "task_keywords": [],
  "evaluation_keywords": [],
  "resource_constraints": [],
  "missing_information": [],
  "assumptions": [],
  "search_seed_terms": []
}
```

### 01 Search Planner

Goal: generate high-recall and high-precision search plans.

Rules:

- Do not fabricate paper titles or citations.
- Produce queries for DBLP, OpenAlex, Crossref, arXiv, Semantic Scholar, and venue pages.
- Include recent-work queries for the last 2-3 years.
- Include baseline, dataset, benchmark, and collision queries.
- Separate broad recall queries from narrow precision queries.

Return JSON:

```json
{
  "core_concepts": [],
  "synonyms": [],
  "precision_queries": [
    {
      "query": "",
      "source_hints": ["openalex", "dblp", "arxiv"],
      "purpose": "find direct prior work"
    }
  ],
  "recall_queries": [],
  "baseline_queries": [],
  "dataset_metric_queries": [],
  "venue_queries": [],
  "collision_queries": [],
  "stop_condition": ""
}
```

### 02 Candidate Triage

Goal: select papers that must be read before novelty judgment.

Rules:

- Never add a paper that is not in the candidate list.
- Prefer DOI, arXiv, DBLP, OpenAlex identifiers.
- Prefer accessible PDFs, but do not ignore important unavailable papers.
- Separate must-read direct prior work, baselines, datasets, surveys, and weakly related papers.
- Flag duplicates and missing search areas.

### 03 PDF Paper Reader

Goal: extract evidence from PDF chunks.

Rules:

- Every important claim must cite page number and quote.
- Do not infer beyond PDF text.
- Report incomplete or corrupted PDF text.
- Extract limitations and negative results, not only strengths.
- Focus on problem, method, evidence, baselines, datasets, metrics, and relation to the current idea.

Return JSON:

```json
{
  "paper_id": "",
  "title_verified": true,
  "summary": "",
  "main_problem": "",
  "core_method": "",
  "main_claims": [
    {
      "claim": "",
      "evidence_quote": "",
      "page": 3,
      "confidence": "high"
    }
  ],
  "datasets": [],
  "baselines": [],
  "metrics": [],
  "strengths": [],
  "weaknesses": [],
  "limitations": [],
  "relevance_to_current_idea": "",
  "difference_from_current_idea": "",
  "collision_risk": "high|medium|low",
  "useful_for": [],
  "unreadable_or_missing_parts": []
}
```

### 04 Related Work Analyst

Goal: synthesize verified paper notes into a related-work map.

Rules:

- Use only verified paper notes.
- Distinguish direct overlap from superficial similarity.
- Identify method families and evaluation conventions.
- Identify reviewer-expected baselines.
- Do not claim novelty yet.

### 05 Novelty Gap Analyst

Goal: compare the idea against verified related work.

Rules:

- Be skeptical.
- Treat vague differences as non-differences.
- Valid novelty must differ on problem formulation, setting, method, theory, data, evaluation, or empirical finding.
- If mostly engineering integration, mark novelty risk high.
- If prior work already solved the core problem, propose a narrower defensible gap.

### 06 CCF-A Reviewer

Goal: score the idea and revised plan using only verified evidence.

Rubric:

| Dimension | Points |
| --- | ---: |
| Problem importance | 10 |
| Novelty after verified related work | 20 |
| Technical depth | 15 |
| Experimental design | 15 |
| Baseline/dataset/metric strength | 10 |
| Venue fit | 10 |
| Feasibility | 10 |
| Reproducibility/open-source value | 5 |
| Paper story | 5 |

Rules:

- Do not reward ambition without evidence.
- Apply cap rules strictly.
- If related work PDFs were not read, novelty cannot exceed medium and total score is capped.
- If no strong baseline/dataset/metric exists, experimental soundness is capped.
- If contribution is engineering-only without scientific claim, total score is capped.

### 07 Feasibility Reviewer

Goal: judge whether the project can realistically produce a CCF-A-quality submission under time and resource constraints.

Rules:

- Model time, compute, data access, implementation risk, evaluation risk, and writing risk.
- Separate feasible MVP from ambitious extension.
- Do not propose experiments requiring unavailable resources.

### 08 Research Strategist

Goal: propose a better and more defensible research direction after strict review.

Rules:

- Preserve the user's broad interest if possible.
- Make the revised idea narrower, testable, and differentiable from prior work.
- Define a central hypothesis and reviewer-convincing evidence.
- Include baselines, datasets, metrics, ablations, and failure cases.
- Avoid vague framework contributions unless paired with measurable claims.

## Skills

### Literature Search

Input: queries, source list, limit, year range, domain.

Output:

```ts
export type PaperCandidate = {
  candidate_id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue?: string;
  doi?: string;
  arxiv_id?: string;
  openalex_id?: string;
  dblp_key?: string;
  semantic_scholar_id?: string;
  source_urls: string[];
  pdf_urls: string[];
  abstract?: string;
  retrieval_sources: string[];
  retrieval_queries: string[];
  confidence: "high" | "medium" | "low";
};
```

Source priority:

1. DBLP for venue, author, title reliability.
2. OpenAlex for broad recall.
3. Crossref for DOI and publication metadata.
4. arXiv for preprints and PDFs.
5. Semantic Scholar for abstracts, references, and related papers.
6. ACL Anthology, ACM, IEEE, USENIX, NeurIPS, ICML, ICLR pages as domain supplements.

### Candidate Dedupe And Rank

Dedupe:

- DOI exact match.
- arXiv id exact match.
- normalized title similarity above threshold.
- author/year/title tuple.

Ranking:

```text
relevance_score =
  0.35 * semantic_match_to_idea
+ 0.20 * title_abstract_keyword_match
+ 0.15 * venue_or_CCF_A_signal
+ 0.15 * recency
+ 0.10 * citation_or_prominence_signal
+ 0.05 * pdf_availability
```

### PDF Acquisition

Responsibilities:

- Download only public and legally accessible PDFs.
- Save to `docs/reference/pdfs/`.
- Write sha256, bytes, source_url, license_hint, and download_time.
- Record missing reasons instead of fabricating PDFs.

Output:

```json
{
  "paper_id": "smith2025agentmemory",
  "pdf_path": "docs/reference/pdfs/smith2025agentmemory.pdf",
  "pdf_sha256": "",
  "source_url": "",
  "license_hint": "arXiv|publisher|author-page|unknown",
  "status": "downloaded|not_available|failed|skipped_license"
}
```

### PDF Parse And Chunk

Responsibilities:

- Validate file is a PDF.
- Extract page count, title candidate, and per-page text.
- Chunk by page or section.
- Assign stable chunk ids.

Recommended dependency:

```bash
npm install pdfjs-dist
```

Optional external mode:

- GROBID for structured title, authors, sections, and references.
- Do not make GROBID a default dependency.

### Evidence Extraction

Feed PDF chunks to `03_pdf_paper_reader.md`. Every important claim must include:

- page
- quote
- chunk_id
- confidence

Downstream novelty and scoring may only cite these evidence refs.

### Verified Paper Record

Upgrade `PaperRecord` with:

```ts
pdf_path?: string;
pdf_sha256?: string;
pdf_status?: "downloaded" | "not_available" | "failed" | "skipped_license";
evidence_refs?: Array<{
  page: number;
  quote: string;
  chunk_id: string;
  purpose: string;
}>;
analysis_confidence?: "high" | "medium" | "low";
```

### CCF-A Strict Rubric

Preliminary `scoring.ts` can stay keyword-based. Strict score must be evidence-based.

Cap rules:

- No verified related work: total cap 50.
- No PDF read: total cap 45.
- Fewer than 5 core related papers: total cap 60.
- No strong baseline: total cap 65.
- No dataset/benchmark: total cap 60.
- No metric: total cap 60.
- High prior-work collision: novelty cap 6/20 and total cap 55.
- Pure engineering integration without scientific hypothesis: total cap 55.
- No executable experiment plan: total cap 65.
- Single-person/12-week plan is clearly infeasible: feasibility cap 5/10 and total cap 70.

## Venue-Aware Paper Template Packaging

Template adaptation should be an independent venue/template stage, not a hard-coded replacement of `paper/main.tex`.

### Target Abstraction

```text
CCF-A venue
  -> venue profile
  -> template family
  -> review/camera-ready mode
  -> LaTeX renderer
  -> compliance checker
  -> submission package
```

Template families include:

- `acm`
- `ieee`
- `acl`
- `usenix`
- `neurips`
- `iclr`
- `cvf`
- `springer`
- `custom`

### Venue Template Profile

```ts
export type TemplateFamily =
  | "acm"
  | "ieee"
  | "acl"
  | "usenix"
  | "neurips"
  | "iclr"
  | "cvf"
  | "springer"
  | "custom";

export type VenueTemplateProfile = {
  profile_id: string;
  venue_key: string;
  venue_name: string;
  ccf_rank?: "A" | "B" | "C";
  template_family: TemplateFamily;
  publisher_hint?: string;
  official_template_url?: string;
  official_template_version?: string;
  official_template_verified_at?: string | null;
  review_modes: Array<"anonymous" | "non_anonymous" | "camera_ready">;
  default_review_mode: "anonymous" | "non_anonymous" | "camera_ready";
  latex: {
    documentclass?: string;
    documentclass_options?: string[];
    usepackages?: string[];
    bibliography_style?: string;
    citation_style?: "numeric" | "author_year" | "venue_specific";
    main_tex_template: string;
    section_template_dir: string;
    compile_engine: "pdflatex" | "xelatex" | "lualatex" | "tectonic";
  };
  paper_rules: {
    columns?: 1 | 2;
    font_size?: string;
    main_page_limit?: number | null;
    references_count_toward_limit?: boolean | null;
    appendix_allowed?: boolean | null;
    supplement_allowed?: boolean | null;
    checklist_required?: boolean;
    anonymity_required?: boolean;
  };
  required_files: string[];
  optional_files: string[];
  forbidden_patterns?: string[];
  notes: string[];
};
```

### Template Resolver

Input:

- target venue
- domain route
- paper type
- year
- review/camera-ready mode

Output:

```ts
export async function resolveTemplateProfile(input: {
  venue?: string;
  domain?: string;
  year?: number;
  mode?: "review" | "camera_ready";
  paperType?: string;
}): Promise<{
  profile: VenueTemplateProfile;
  confidence: "high" | "medium" | "low";
  needsOfficialVerification: boolean;
  verificationTasks: string[];
}> {
  // 1. exact venue match
  // 2. alias match
  // 3. domain default
  // 4. fallback to generic article template
}
```

### LaTeX Renderer

Render from profiles and templates instead of asking Codex to write arbitrary `.tex`.

```ts
export type PaperRenderInput = {
  profile: VenueTemplateProfile;
  projectName: string;
  title: string;
  anonymous: boolean;
  sections: Array<{
    id: string;
    title: string;
    body: string;
  }>;
  bibFile: string;
  macrosFile: string;
};

export type PaperRenderResult = {
  files: Record<string, string>;
  warnings: string[];
};
```

Generated files:

```text
paper/
  main.tex
  macros.tex
  references.bib
  sections/
    00_abstract.tex
    01_introduction.tex
    02_related_work.tex
    03_method.tex
    04_experiments.tex
    05_results.tex
    06_discussion.tex
    07_limitations.tex
    08_conclusion.tex
  appendix/
    appendix.tex
  checklist/
    reproducibility_checklist.tex
  template/
    profile.json
    README.md
  build/
    compile.log
    main.pdf
  submission/
    overleaf.zip
    submission.zip
```

### Compile And Compliance Check

Compile strategy:

1. Use `latexmk` if available.
2. Else try `tectonic`.
3. Else perform static check only.
4. Do not auto-install TeX.

Compile output:

```json
{
  "compile_status": "passed|failed|skipped",
  "engine": "latexmk|tectonic|static",
  "pdf_path": "paper/build/main.pdf",
  "errors": [],
  "warnings": [],
  "log_path": "paper/build/compile.log"
}
```

Compliance checks:

- `main.tex` exists.
- `references.bib` exists.
- anonymous mode does not leak author, affiliation, GitHub URL, or institution.
- forbidden packages are not used.
- required checklist exists.
- appendix/supplement placeholders exist when required.
- bibliography style matches profile.
- section structure fits venue expectations.

### ACM Template Example

```tex
\documentclass[sigconf,review,anonymous]{acmart}
\input{macros}
\title{...}
\begin{document}
\begin{abstract}
\input{sections/00_abstract}
\end{abstract}
\maketitle
\input{sections/01_introduction}
\input{sections/02_related_work}
\input{sections/03_method}
\input{sections/04_experiments}
\input{sections/05_results}
\input{sections/06_discussion}
\input{sections/07_limitations}
\input{sections/08_conclusion}
\bibliographystyle{ACM-Reference-Format}
\bibliography{references}
\end{document}
```

Check:

- anonymous review mode
- author and affiliation hidden
- ACM rights block hidden in review mode
- bibliography style
- artifact, ethics, and reproducibility sections

### IEEE Template Example

```tex
\documentclass[conference]{IEEEtran}
\input{macros}
\title{...}
\begin{document}
\maketitle
\begin{abstract}
\input{sections/00_abstract}
\end{abstract}
\input{sections/01_introduction}
\input{sections/02_related_work}
\input{sections/03_method}
\input{sections/04_experiments}
\input{sections/05_results}
\input{sections/06_discussion}
\input{sections/07_conclusion}
\bibliographystyle{IEEEtran}
\bibliography{references}
\end{document}
```

Check:

- `IEEEtran` class exists.
- numeric citation style.
- author block matches review mode.
- two-column layout.
- figure/table placement.
- page-limit risk.

## Venue Expectations And Scoring

Template adaptation affects CCF-A feasibility and venue-fit scoring.

Examples:

- ACM CCS / IEEE S&P require threat model, security evaluation, ethics/responsible disclosure, and artifact discussion.
- SIGCOMM / OSDI / SOSP require system implementation and latency/throughput/scalability/cost evaluation.
- NeurIPS / ICML / ICLR require strong baselines, ablations, generalization, and failure cases.
- SIGMOD / VLDB require query/workload/data/system evaluation and clear data-management contribution.

Additional cap rules:

- Target venue requires threat model but none exists: total cap 65.
- Target venue requires system evaluation but prototype absent: total cap 60.
- Target venue expects strong ML baselines but none defined: total cap 65.
- Template/checklist missing: submission readiness blocked.
- Page limit makes story impossible: feasibility penalty.

## Generated Repo Artifacts

```text
generated_repos/demo/
  docs/
    idea/
      idea_brief.md
      assumptions.md

    relative_work/
      search_plan.json
      search_report.md
      candidates.json
      triage_report.md
      related_work_matrix.csv
      topic_clusters.md
      novelty_gap_matrix.md
      collision_risk.md
      baseline_recommendations.md

    reference/
      pdf_manifest.json
      paper_notes/
        <paper_id>.md
      pdfs/
        <paper_id>.pdf

    diagnosis/
      ccf_a_strict_scorecard.md
      feasibility_report.md
      reviewer_panel.md
      evidence_gate.md

    proposal/
      revised_idea.md
      experiment_plan.md
      first_4_week_plan.md
      paper_story.md

    submission/
      target_venue.md
      venue_template_profile.json
      template_decision.md
      submission_checklist.md
      anonymity_check.md
      template_compliance_report.md
      camera_ready_todo.md

  paper/
    main.tex
    macros.tex
    references.bib
    sections/
    appendix/
    checklist/
    template/
    build/
    submission/
```

## Implementation Roadmap

### PR 1: Schemas And Pipeline Skeleton

Implement:

- `src/pipeline/research-pipeline.ts`
- `src/agents/prompts/*.md`
- TypeBox schemas
- resumable stage state
- offline/mock pipeline output

Acceptance:

```bash
npm run typecheck
npm test
idea2repo research "..." --offline --strict-ccf-a
```

### PR 2: Literature Search Adapters

Implement:

- OpenAlex, Crossref, arXiv, DBLP adapters
- candidate dedupe
- candidate ranking
- `candidates.json`
- `search_report.md`

Acceptance:

```bash
idea2repo literature search \
  --output generated_repos/demo \
  --allow-network \
  --max-papers 30
```

Tests must mock `fetch`; unit tests should not depend on real network.

### PR 3: PDF Acquisition And Parsing

Implement:

- open-access PDF download
- `pdf_manifest.json`
- PDF chunk index
- sha256 and title-match checks
- graceful missing-PDF records

### PR 4: Paper Reader And Related Work Matrix

Implement:

- Codex paper reader over chunks
- `paper_notes`
- `related_work_matrix.csv`
- `topic_clusters.md`

Acceptance:

- Every note has problem, method, claim, evidence, and limitation.
- Important claims have page quote.
- Strong conclusions require evidence refs.

### PR 5: Novelty, CCF-A Reviewer, And Strategist

Implement:

- `novelty_gap_matrix.md`
- `ccf_a_strict_scorecard.md`
- `feasibility_report.md`
- `revised_idea.md`

Acceptance:

- No PDF evidence triggers score caps.
- Related-work collision lowers novelty.
- Revised idea includes hypothesis, baseline, dataset, metric, ablation, and failure cases.

### PR 6: Venue Template Catalog And Resolver

Implement:

- `data/template_profiles/*.json`
- `src/skills/templates/catalog.ts`
- `src/skills/templates/resolve.ts`
- `idea2repo templates list/show/validate`
- `docs/submission/venue_template_profile.json`
- `docs/submission/template_decision.md`

Acceptance:

- ACM profile validates.
- IEEE profile validates.
- unknown venue falls back to generic template.
- required fields are complete.

### PR 7: Paper Renderer And Compliance Checker

Implement:

- `data/latex_templates/*`
- `src/skills/templates/render.ts`
- `src/skills/templates/compliance.ts`
- `idea2repo paper render/check/package`
- venue-specific `paper/main.tex`
- `paper/submission/overleaf.zip`

Acceptance:

- ACM `main.tex` snapshot test.
- IEEE `main.tex` snapshot test.
- anonymous mode does not include author/affiliation.
- `references.bib` path is correct.
- missing checklist produces warning/fail.

## Immediate Next Steps

1. Split `CodexOAuthClient.analyzeIdea()` into specialized agent calls:
   - `discussIdea()`
   - `planLiteratureSearch()`
   - `triagePaperCandidates()`
   - `readPaperPdf()`
   - `analyzeRelatedWork()`
   - `analyzeNovelty()`
   - `scoreCcfA()`
   - `reviewFeasibility()`
   - `refineIdea()`

2. Upgrade `searchLiterature()` from placeholder to adapter orchestrator.

3. Upgrade `PaperRecord` into `VerifiedPaperRecord` with PDF provenance and evidence refs.

4. Add venue template catalog and resolver before adding hard-coded template renderers.

## Final Direction

Idea2Repo should become an **evidence-driven research workspace generator**, not a longer prompt generator.

The end-state user experience:

```bash
idea2repo research "..." \
  --venue "ACM CCS" \
  --review-mode anonymous \
  --allow-network \
  --download-pdfs \
  --strict-ccf-a \
  --compile-paper \
  --package-overleaf
```

The generated repo should include:

- verified related-work evidence
- CCF-A strict review
- revised feasible idea
- venue-specific LaTeX skeleton
- template compliance report
- Overleaf/submission zip
