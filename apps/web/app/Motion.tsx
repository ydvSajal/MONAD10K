"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef, type ReactNode } from "react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Landing motion, driven by data attributes so the page itself stays a Server Component.
 * `data-hero` enters on load, `data-count` counts from `data-from` (the raw score falling to the grounded one),
 * `data-reveal` enters on scroll, `data-line` draws down the steps. Reduced motion gets the static page.
 */
export function Motion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-hero]", { y: 24, autoAlpha: 0, duration: 0.9, ease: "power3.out", stagger: 0.08 });

        for (const el of gsap.utils.toArray<HTMLElement>("[data-count]")) {
          const n = { v: Number(el.dataset.from ?? 0) };
          gsap.to(n, {
            v: Number(el.dataset.count),
            duration: 1.6,
            delay: 0.7,
            ease: "power2.inOut",
            onUpdate: () => void (el.textContent = String(Math.round(n.v))),
          });
        }

        for (const el of gsap.utils.toArray<HTMLElement>("[data-reveal]")) {
          gsap.from(el, {
            y: 32,
            autoAlpha: 0,
            duration: 0.8,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 85%" },
          });
        }

        gsap.from("[data-line]", {
          scaleY: 0,
          transformOrigin: "top",
          ease: "none",
          scrollTrigger: { trigger: "[data-steps]", start: "top 70%", end: "bottom 60%", scrub: true },
        });
      });
    },
    { scope: root },
  );

  return <div ref={root}>{children}</div>;
}
