"use client";

import { useRef, useState } from "react";
import { ACCENT, INK } from "@/lib/palette";

/**
 * Hover/focus-revealed button beside a chart title that copies a deep link to
 * that chart: the current query string (filters or story) plus the section
 * anchor, so the recipient lands on the same view scrolled to the same chart.
 */
export function CopyChartLink({ anchor, title }: { anchor: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = async () => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${anchor}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions/insecure context): surface the URL
      // so the user can still copy it by hand.
      window.prompt("Copy this link:", url);
    }
  };

  return (
    <button
      onClick={copy}
      aria-label={`Copy link to ${title}`}
      title={`Copy link to ${title}`}
      className="opacity-0 transition-opacity duration-150 focus:opacity-100 group-hover:opacity-100"
      style={{ color: copied ? ACCENT : INK.muted }}
    >
      {copied ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em]">copied</span>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      )}
    </button>
  );
}
