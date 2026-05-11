import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { latexTemplatesDir } from "./catalog.js";
import type { PaperRenderInput, PaperRenderResult, PaperSection, ReviewMode, VenueTemplateProfile } from "./types.js";

export function renderPaper(input: PaperRenderInput): PaperRenderResult {
  const sections = input.sections?.length ? input.sections : defaultPaperSections();
  const warnings: string[] = [];
  const template = loadMainTemplate(input.profile, warnings);
  const bibliography = bibliographyPath(input.bibFile ?? "references.bib");
  const reviewMode = input.reviewMode ?? (input.anonymous ? "anonymous" : "non_anonymous");
  const anonymous = reviewMode === "anonymous";
  const main = fillTemplate(template, {
    documentclass: input.profile.latex.documentclass ?? "article",
    documentclass_options: documentclassOptions(input.profile, reviewMode),
    packages: packageLines(input.profile),
    title: escapeTex(input.title),
    author_block: anonymous ? "" : nonAnonymousAuthorBlock(input.profile),
    abstract_input: "\\input{sections/00_abstract}",
    section_inputs: sectionInputs(sections),
    bibliography_style: input.profile.latex.bibliography_style ?? "plain",
    bibliography_path: bibliography,
    acm_review_topmatter: anonymous && input.profile.template_family === "acm" ? "\\settopmatter{printacmref=false}\n\\setcopyright{none}" : ""
  });
  const files: Record<string, string> = {
    "paper/main.tex": main,
    "paper/macros.tex": defaultMacros(input.projectName),
    "paper/references.bib": "% Verified BibTeX entries belong here. Do not cite unverified papers.\n",
    "paper/appendix/appendix.tex": appendixPlaceholder(),
    "paper/template/profile.json": JSON.stringify(input.profile, null, 2) + "\n",
    "paper/template/render_config.json": JSON.stringify({ profile_id: input.profile.profile_id, review_mode: reviewMode, anonymous, title: input.title }, null, 2) + "\n",
    "paper/template/README.md": templateReadme(input.profile),
    "paper/build/compile.log": "Compile not run.\n"
  };
  for (const section of sections) {
    files[`paper/sections/${section.id}.tex`] = renderSection(section);
  }
  if (input.profile.paper_rules.checklist_required || input.profile.optional_files.includes("paper/checklist/reproducibility_checklist.tex")) {
    files["paper/checklist/reproducibility_checklist.tex"] = checklistPlaceholder(input.profile);
  }
  return { files, warnings };
}

export function defaultPaperSections(): PaperSection[] {
  return [
    { id: "00_abstract", title: "Abstract", body: "This draft is a venue-aware scaffold. Replace this paragraph only after claims are backed by verified evidence." },
    { id: "01_introduction", title: "Introduction", body: "State the research problem, why it matters, and the evidence-backed contribution." },
    { id: "02_related_work", title: "Related Work", body: "Synthesize only verified related-work notes and cite entries from references.bib." },
    { id: "03_method", title: "Method", body: "Describe the method with enough detail for reviewer assessment and later reproduction." },
    { id: "04_experiments", title: "Experiments", body: "Define datasets, baselines, metrics, ablations, and failure cases before reporting results." },
    { id: "05_results", title: "Results", body: "Report results only after tables and figures exist in the repository artifacts." },
    { id: "06_discussion", title: "Discussion", body: "Discuss interpretation, scope, reviewer concerns, and alternative explanations." },
    { id: "07_limitations", title: "Limitations", body: "Document limitations, risks, and invalidated assumptions." },
    { id: "08_conclusion", title: "Conclusion", body: "Summarize the evidence-backed contribution and remaining work." }
  ];
}

function loadMainTemplate(profile: VenueTemplateProfile, warnings: string[]): string {
  const path = join(latexTemplatesDir(), profile.latex.main_tex_template);
  if (existsSync(path)) return readFileSync(path, "utf8");
  warnings.push(`missing LaTeX template ${profile.latex.main_tex_template}; used generic fallback`);
  return genericTemplate();
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_, key: string) => values[key] ?? "");
}

function packageLines(profile: VenueTemplateProfile): string {
  return (profile.latex.usepackages ?? []).map((pkg) => `\\usepackage{${pkg}}`).join("\n");
}

function documentclassOptions(profile: VenueTemplateProfile, reviewMode: ReviewMode): string {
  const options = [...(profile.latex.documentclass_options ?? [])];
  if (profile.template_family === "acm") {
    return orderedOptions(options, reviewMode === "camera_ready" ? ["sigconf"] : reviewMode === "anonymous" ? ["sigconf", "review", "anonymous"] : ["sigconf", "review"]);
  }
  if (profile.template_family === "neurips") {
    return orderedOptions(options.filter((option) => option !== "final"), reviewMode === "camera_ready" ? ["final"] : []);
  }
  return orderedOptions(options, []);
}

function orderedOptions(base: string[], required: string[]): string {
  const seen = new Set<string>();
  const options = [...base, ...required]
    .filter((option) => option && !seen.has(option) && (seen.add(option), true))
    .filter((option) => required.includes(option) || !["anonymous", "review", "final"].includes(option));
  return options.join(",");
}

function sectionInputs(sections: PaperSection[]): string {
  return sections
    .filter((section) => section.id !== "00_abstract")
    .map((section) => `\\input{sections/${section.id}}`)
    .join("\n");
}

function bibliographyPath(file: string): string {
  return file.replace(/\.bib$/i, "").replace(/^paper\//, "");
}

function nonAnonymousAuthorBlock(profile: VenueTemplateProfile): string {
  if (profile.template_family === "ieee") {
    return "\\author{\\IEEEauthorblockN{Author names omitted in scaffold}\\IEEEauthorblockA{Affiliations omitted in scaffold}}";
  }
  if (profile.template_family === "springer") {
    return "\\author{Author names omitted in scaffold}\\institute{Affiliations omitted in scaffold}";
  }
  return "\\author{Author names omitted in scaffold}\\affiliation{\\institution{Affiliations omitted in scaffold}}";
}

function defaultMacros(projectName: string): string {
  return `% Shared paper macros.\n\\newcommand{\\projectname}{${escapeTex(projectName)}}\n`;
}

function renderSection(section: PaperSection): string {
  if (section.id === "00_abstract") return `${section.body.trim()}\n`;
  return `\\section{${escapeTex(section.title)}}\n${section.body.trim()}\n`;
}

function appendixPlaceholder(): string {
  return "\\appendix\n\\section{Additional Details}\nAdd supplementary derivations, implementation notes, or extended results only when allowed by the target venue.\n";
}

function checklistPlaceholder(profile: VenueTemplateProfile): string {
  return `% ${profile.venue_name} reproducibility checklist placeholder.\n% Complete the official checklist before submission.\n`;
}

function templateReadme(profile: VenueTemplateProfile): string {
  return `# Paper Template

- Profile: ${profile.profile_id}
- Venue: ${profile.venue_name}
- Family: ${profile.template_family}
- Official template: ${profile.official_template_url ?? "unverified"}
- Version: ${profile.official_template_version ?? "unspecified"}

Verify the current call-for-papers and official style files before real submission.
`;
}

function genericTemplate(): string {
  return `\\documentclass[{{documentclass_options}}]{ {{documentclass}} }
{{packages}}
\\input{macros}
\\title{ {{title}} }
{{author_block}}
\\begin{document}
\\maketitle
\\begin{abstract}
{{abstract_input}}
\\end{abstract}
{{section_inputs}}
\\bibliographystyle{ {{bibliography_style}} }
\\bibliography{ {{bibliography_path}} }
\\end{document}
`;
}

function escapeTex(value: string): string {
  return value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([#$%&_{}])/g, "\\$1")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/~/g, "\\textasciitilde{}");
}
