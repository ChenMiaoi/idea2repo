import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("src", "agents", "prompts");
const target = resolve("dist", "prompts");

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
