import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "../BrandMark";
import { SiteFooter } from "../SiteFooter";

const NAV = [
  ["Agents", "/agents"],
  ["Playground", "/playground"],
  ["Docs", "/docs"],
] as const;

const REPO = "https://github.com/ydvSajal/MONAD10K";

export default function ExplorerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="brand" aria-label="Grounded home">
            <span style={{ width: 20, height: 31, display: "block" }}>
              <BrandMark id="sh-bg" />
            </span>
            Grounded
          </Link>
          <nav aria-label="Primary">
            {NAV.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
            <a href={REPO} className="tail">
              GitHub
            </a>
          </nav>
          <Link href="/docs/quickstart" className="cta tail">
            Get Started
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
