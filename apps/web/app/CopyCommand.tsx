"use client";

import { useState } from "react";

/** Install line with a copy button. Clipboard can be blocked (insecure origin, permissions), so failure just shows nothing. */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-panel px-6 py-4">
      <code className="overflow-x-auto whitespace-nowrap font-mono text-base text-paper md:text-lg">
        <span className="select-none text-mute">$ </span>
        {command}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            ?.writeText(command)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            })
            .catch(() => {});
        }}
        className="shrink-0 rounded-full border border-line px-5 py-2 text-base font-semibold text-paper transition hover:border-paper"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
