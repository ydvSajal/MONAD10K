import Link from "next/link";
import type { ReactNode } from "react";

export default function ExplorerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header>
        <Link href="/" className="brand">
          Grounded
        </Link>
        <span className="muted">payment-grounded reputation for ERC-8004 agents · Monad testnet</span>
        <Link href="/agents">Agents</Link>
        <Link href="/playground">Playground</Link>
        <Link href="/docs">Docs</Link>
      </header>
      <main>{children}</main>
    </>
  );
}
