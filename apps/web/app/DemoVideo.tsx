"use client";

import { useEffect, useRef, useState } from "react";

/** Browser-framed explainer: autoplays muted on a loop, one click to unmute. */
export function DemoVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  // React drops the `muted` attribute on hydration, which blocks autoplay; set it on the element and start playback.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => {});
  }, []);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted) v.play().catch(() => {});
  };

  return (
    <section id="demo" className="mx-auto max-w-5xl px-4 pb-8 pt-16 md:px-8 md:pt-24">
      <h2 className="m-0 text-center text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-balance md:text-5xl">
        See it work in 95 seconds.
      </h2>
      <div className="mt-10 overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="flex gap-1.5" aria-hidden="true">
            <i className="block size-3 rounded-full bg-[#ff5f57]" />
            <i className="block size-3 rounded-full bg-[#febc2e]" />
            <i className="block size-3 rounded-full bg-[#28c840]" />
          </span>
          <span className="flex-1 truncate rounded-md bg-ink/60 px-3 py-1 font-mono text-sm text-mute">grounded.sajal.sbs</span>
        </div>
        <div className="relative aspect-video bg-ink">
          <video
            ref={video}
            className="size-full object-cover"
            src="/grounded-explainer.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="Grounded explainer video"
          />
          <button
            type="button"
            onClick={toggle}
            className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-paper backdrop-blur transition hover:bg-black/90"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              {muted ? <path d="m22 9-6 6m0-6 6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />}
            </svg>
            {muted ? "Unmute" : "Mute"}
          </button>
        </div>
      </div>
    </section>
  );
}
