import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const agentPromptFiles = [
  "00_intake_router.md",
  "01_search_planner.md",
  "02_candidate_triage.md",
  "03_pdf_paper_reader.md",
  "04_related_work_analyst.md",
  "05_novelty_gap_analyst.md",
  "06_ccf_a_reviewer.md",
  "07_feasibility_reviewer.md",
  "08_research_strategist.md",
  "09_reviewer_novelty_related_work.md",
  "10_reviewer_method_experiment.md",
  "11_reviewer_venue_story.md",
  "09_artifact_writer.md",
  "10_venue_template_selector.md",
  "11_latex_template_packager.md",
  "12_template_compliance_reviewer.md"
] as const;

export type AgentPromptFile = (typeof agentPromptFiles)[number];

export type AgentCallInput = {
  promptFile: AgentPromptFile;
  task: string;
  context?: unknown;
  responseContract?: string;
};

export async function loadAgentPrompt(promptFile: AgentPromptFile): Promise<string> {
  if (!agentPromptFiles.includes(promptFile)) throw new Error(`unknown agent prompt: ${promptFile}`);
  return readFile(join(dirname(fileURLToPath(import.meta.url)), "prompts", promptFile), "utf8");
}

export async function buildAgentPrompt(input: AgentCallInput): Promise<string> {
  const prompt = await loadAgentPrompt(input.promptFile);
  return [
    prompt.trim(),
    "## Task",
    input.task.trim(),
    input.context == null ? "" : "## Context",
    input.context == null ? "" : JSON.stringify(input.context, null, 2),
    input.responseContract ? "## Response Contract" : "",
    input.responseContract ?? ""
  ].filter(Boolean).join("\n\n");
}

export function stagedAgentInstructions(schemaName: string): string {
  return [
    "You are an Idea2Repo staged research agent.",
    "Return exactly one JSON object and no Markdown, prose, code fence, or citations.",
    `The JSON object must validate against ${schemaName}.`,
    "Do not fabricate papers, PDF evidence, BibTeX, datasets, metrics, baselines, or experiment results.",
    "If evidence is missing, report warnings or verification tasks instead of inventing facts."
  ].join(" ");
}
