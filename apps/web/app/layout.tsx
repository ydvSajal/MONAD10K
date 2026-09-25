import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Grounded Explorer",
  description: "ERC-8004 agent reputation that counts only ratings backed by an onchain payment.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <Link href="/" className="brand">
            Grounded
          </Link>
          <span className="muted">payment-grounded reputation for ERC-8004 agents · Monad testnet</span>
          <Link href="/agents">Agents</Link>
          <Link href="/docs">Docs</Link>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
