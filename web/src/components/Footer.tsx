"use client";

import { useMemo } from "react";
import { useExplorer } from "@/lib/store";

const REPO_URL = "https://github.com/FeatherAnalytics/cinemetrics";

export function Footer() {
  const { all } = useExplorer();

  const updated = useMemo(() => {
    let max = 0;
    for (const w of all) max = Math.max(max, w.d.getTime());
    if (max === 0) return null;
    return new Date(max).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  }, [all]);

  return (
    <footer
      className="mt-12 border-t pt-6 text-xs text-[#67655f]"
      style={{ borderColor: "rgba(11,11,11,0.12)" }}
    >
      <p className="max-w-2xl">
        Built from my Letterboxd history: an RSS feed feeds a dbt / DuckDB pipeline that
        enriches each film with TMDB, OMDb, and critic scores, then exports the static JSON
        this page reads. A GitHub Action checks the feed each morning and, only when there&rsquo;s
        a new watch, re-runs the pipeline and redeploys.
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-[#0b0b0b]"
        >
          Source on GitHub
        </a>
        {updated && (
          <span className="font-mono text-[#8b8981]">· data through {updated}</span>
        )}
      </p>
    </footer>
  );
}
