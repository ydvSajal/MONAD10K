"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "./BrandMark";
import "./hero.css";

const VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260808_112712_da9d53df-6d27-4b12-bdf6-aa9dc2622bdf.mp4";

const LINKS = [
  ["Agents", "/agents"],
  ["Playground", "/playground"],
  ["How it works", "#how"],
  ["Docs", "/docs"],
  ["GitHub", "https://github.com/ydvSajal/MONAD10K"],
] as const;

// The product first: a new visitor lands on live agents, then can rate one in the playground.
const PRIMARY = ["Explore agents", "/agents"] as const;
const SECONDARY = ["Try the app layer", "https://gigtrust-grounded.vercel.app/"] as const;

/** Full-screen looping-video hero. Client only for the mobile menu; everything else is static markup. */
export function Hero() {
  const [open, setOpen] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  // React drops the `muted` attribute on hydration, which blocks autoplay; set it on the element and start playback.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onResize = () => innerWidth / innerHeight > 1.1 && close();
    document.body.style.overflow = "hidden";
    addEventListener("keydown", onKey);
    addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = "";
      removeEventListener("keydown", onKey);
      removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <section className={`hs${open ? " is-open" : ""}`}>
      <div className="hs-plate">
        <video ref={video} className="hs-video" autoPlay muted loop playsInline preload="auto" aria-hidden="true">
          <source src={VIDEO} type="video/mp4" />
        </video>
      </div>

      <div className="hs-bar">
        <Link href="/" className="hs-brand" aria-label="Home">
          <BrandMark id="hs-bg1" />
        </Link>
        <nav className="hs-links" aria-label="Primary">
          {LINKS.map(([label, href]) => (
            <Link key={label} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <Link href={PRIMARY[1]} className="hs-pill hs-pill-nav">
          <span>{PRIMARY[0]}</span>
        </Link>
        <button
          type="button"
          className="hs-burger"
          aria-expanded={open}
          aria-controls="hs-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <i />
          <i />
        </button>
      </div>

      <nav className="hs-menu" id="hs-menu" aria-hidden={!open}>
        <div className="hs-menu-inner">
          <p className="hs-menu-eyebrow">Menu</p>
          <ul>
            {LINKS.map(([label, href]) => (
              <li key={label}>
                <Link href={href} onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="hs-menu-foot">
            <Link href={PRIMARY[1]} className="hs-pill" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}>
              <span>{PRIMARY[0]}</span>
            </Link>
            <Link href={SECONDARY[1]} target="_blank" rel="noopener noreferrer" className="hs-ghost" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}>
              {SECONDARY[0]}
            </Link>
          </div>
        </div>
      </nav>

      <div className="hs-main">
        <h1 className="hs-headline">
          <span>A rating counts</span> <span>only if they paid.</span>
        </h1>
        <p className="hs-sub">
          <span>Grounded scores ERC-8004 agents from ratings by reviewers who</span>{" "}
          <span>paid them onchain. A contract computes it, not a company.</span>
        </p>
        <div className="hs-actions">
          <Link href={PRIMARY[1]} className="hs-pill hs-pill-cta">
            <span>{PRIMARY[0]}</span>
          </Link>
          <Link href={SECONDARY[1]} target="_blank" rel="noopener noreferrer" className="hs-ghost">
            {SECONDARY[0]} ↗
          </Link>
        </div>
      </div>

      <div className="hs-logos" aria-hidden="true">
        <span className="hs-lg hs-lg1">
          <svg viewBox="0 0 30 31" fill="currentColor">
            <defs>
              <mask id="hs-m1">
                <rect width="30" height="31" fill="#fff" />
                <circle cx="19.5" cy="10.5" r="5.1" fill="#000" />
              </mask>
            </defs>
            <rect width="30" height="31" rx="2" mask="url(#hs-m1)" />
            <circle cx="19.5" cy="10.5" r="2.6" />
          </svg>
          <b>Monad</b>
        </span>
        <span className="hs-lg hs-lg2">
          <svg viewBox="0 0 25 30" fill="currentColor">
            <rect width="6.5" height="30" />
            <path d="M15 4a11 11 0 0 1 0 22V4z" />
            <circle cx="15" cy="15" r="3.4" fill="#050505" />
          </svg>
          <b>
            ERC-8004
          </b>
        </span>
        <span className="hs-lg hs-lg3">
          <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="3.1" strokeLinecap="round">
            <circle cx="14" cy="14" r="12.35" />
            <path d="M7.5 15.5c3-5 6.5-5 9 0s5 4.5 5 4.5" />
            <path d="M7 10.5c2.5-2 5-2 7 0" />
          </svg>
          <b>USDC</b>
        </span>
        <span className="hs-lg hs-lg4">
          <svg viewBox="0 0 28 25.5" fill="currentColor">
            <path d="M0 14C6 3 11 3 14 9s8 6 14-3v8c-6 9-11 7-14 2s-8-4-14 2z" />
            <path d="M0 23c4-3 7-3 14 0s10 2 14-1" fill="none" stroke="currentColor" strokeWidth="3.05" />
          </svg>
          <b>WebAuthn</b>
        </span>
      </div>
    </section>
  );
}
