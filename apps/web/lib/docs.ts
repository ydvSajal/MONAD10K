import { readFileSync } from "node:fs";
import { join } from "node:path";

import { marked } from "marked";

/** The only pages that exist. A slug outside this list never reaches the filesystem. */
export const DOCS = [
  { slug: "quickstart", title: "Quickstart" },
  { slug: "sdk", title: "SDK reference" },
  { slug: "scoring", title: "Scoring spec" },
  { slug: "contracts", title: "Contracts" },
  { slug: "402-scheme", title: "402 scheme" },
  { slug: "threat-model", title: "Threat model" },
  { slug: "faq", title: "FAQ" },
] as const;

export function renderDoc(slug: string): string | null {
  if (!DOCS.some((d) => d.slug === slug)) return null;
  // Our own files, written in this repo: rendered without sanitising.
  return marked.parse(readFileSync(join(process.cwd(), "content/docs", `${slug}.md`), "utf8"), { async: false });
}
