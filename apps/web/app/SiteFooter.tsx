import Link from "next/link";

import { BrandMark } from "./BrandMark";

const REPO = "https://github.com/ydvSajal/MONAD10K";

const COLUMNS = [
  {
    title: "Product",
    links: [
      ["Agents", "/agents"],
      ["Playground", "/playground"],
      ["Docs", "/docs"],
    ],
  },
  {
    title: "Build",
    links: [
      ["Quickstart", "/docs/quickstart"],
      ["What it does not stop", "/docs/threat-model"],
      ["GitHub", REPO],
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-about">
          <Link href="/" className="brand" aria-label="Grounded home">
            <span style={{ width: 20, height: 31, display: "block" }}>
              <BrandMark id="sf-bg" />
            </span>
            Grounded
          </Link>
          <p>Agent reputation that counts only ratings backed by an onchain payment.</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2>{col.title}</h2>
            {col.links.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="site-footer-base">
        <span>Monad testnet only. No real funds.</span>
        <span>Built for Monad Metropolis, 2026.</span>
      </div>
    </footer>
  );
}
