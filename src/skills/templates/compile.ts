import { spawn } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PaperCompileResult, VenueTemplateProfile } from "./types.js";

export async function compilePaper(root: string, _profile: VenueTemplateProfile): Promise<PaperCompileResult> {
  const paperDir = join(root, "paper");
  const buildDir = join(paperDir, "build");
  const logPath = join(buildDir, "compile.log");
  await mkdir(buildDir, { recursive: true });
  const latexmk = await findCommand("latexmk");
  const tectonic = latexmk ? null : await findCommand("tectonic");
  if (!latexmk && !tectonic) {
    await writeFile(logPath, "No TeX compiler found. Static compliance checks are still available.\n", "utf8");
    return {
      compile_status: "skipped",
      engine: "static",
      pdf_path: "paper/build/main.pdf",
      errors: [],
      warnings: ["latexmk and tectonic were not found; compile skipped"],
      log_path: "paper/build/compile.log"
    };
  }
  const engine = latexmk ? "latexmk" : "tectonic";
  const args = latexmk
    ? ["-pdf", "-interaction=nonstopmode", "-halt-on-error", "-outdir=build", "main.tex"]
    : ["--outdir", "build", "main.tex"];
  const run = await runCommand(engine, args, paperDir);
  await writeFile(logPath, run.output, "utf8");
  const pdfExists = await fileExists(join(buildDir, "main.pdf"));
  return {
    compile_status: run.code === 0 && pdfExists ? "passed" : "failed",
    engine,
    pdf_path: "paper/build/main.pdf",
    errors: run.code === 0 && pdfExists ? [] : [`${engine} exited with code ${run.code}`],
    warnings: pdfExists ? [] : ["paper/build/main.pdf was not produced"],
    log_path: "paper/build/compile.log"
  };
}

async function findCommand(name: "latexmk" | "tectonic"): Promise<string | null> {
  const result = await runCommand("sh", ["-lc", `command -v ${name}`], process.cwd());
  return result.code === 0 ? result.output.trim().split(/\s+/)[0] ?? null : null;
}

async function runCommand(command: string, args: string[], cwd: string): Promise<{ code: number; output: string }> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", (error) => resolve({ code: 127, output: `${error.message}\n` }));
    child.on("exit", (code) => resolve({ code: code ?? 0, output: Buffer.concat(chunks).toString("utf8") }));
  });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
