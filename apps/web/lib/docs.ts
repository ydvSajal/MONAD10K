import { existsSync, readFileSync } from "node:fs";
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

// Next runs from apps/web, but `pnpm --dir` or a monorepo-root start sets cwd to the repo root.
const DIR = ["content/docs", "apps/web/content/docs"].map((d) => join(process.cwd(), d)).find(existsSync) ?? join(process.cwd(), "content/docs");

export function renderDoc(slug: string): string | null {
  if (!DOCS.some((d) => d.slug === slug)) return null;
  // Our own files, written in this repo: rendered without sanitising.
  return marked.parse(readFileSync(join(DIR, `${slug}.md`), "utf8"), { async: false });
}
