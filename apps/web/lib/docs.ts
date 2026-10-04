import { readFileSync } from "node:fs";
import { join } from "node:path";

import { marked } from "marked";

/** The only pages that exist. A slug outside this list never reaches the filesystem. */
export const DOCS = [
  { slug: "quickstart", title: "Quickstart", group: "Introduction" },
  { slug: "faq", title: "FAQ", group: "Introduction" },
  { slug: "scoring", title: "Scoring spec", group: "Core concepts" },
  { slug: "contracts", title: "Contracts", group: "Core concepts" },
  { slug: "threat-model", title: "Threat model", group: "Core concepts" },
  { slug: "sdk", title: "SDK reference", group: "Integrate" },
  { slug: "402-scheme", title: "402 scheme", group: "Integrate" },
  { slug: "ai-agents", title: "AI agents", group: "Integrate" },
] as const;

export function renderDoc(slug: string): string | null {
  if (!DOCS.some((d) => d.slug === slug)) return null;
  // Our own files, written in this repo: rendered without sanitising.
  return marked.parse(readFileSync(join(process.cwd(), "content/docs", `${slug}.md`), "utf8"), { async: false });
}
