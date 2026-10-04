import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const sans = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Grounded",
  description: "ERC-8004 agent reputation that counts only ratings backed by an onchain payment.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
