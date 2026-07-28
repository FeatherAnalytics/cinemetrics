"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { countryBars, languageBars } from "@/lib/watchlistChart";
import { ChartTakeaway } from "../ChartTakeaway";
import { Toggle } from "../stats/Toggle";
import { RankedBars } from "./RankedBars";

const MODES = ["country", "language"] as const;
type Mode = (typeof MODES)[number];

/**
 * Where the watchlist comes from — production country or original language.
 *
 * One chart with a switch rather than two charts side by side. The two views
 * mostly agree (an American film is usually in English), so as separate charts
 * they read as one finding stated twice; the switch makes the comparison the
 * point and gives the disagreements — a co-production, an English-language film
 * shot abroad — somewhere to show up.
 *
 * Country counts every co-producing country, so its bars sum past the film
 * count. Language is single-valued and sums to the films that declare one.
 * Both cross-filter the rail, since both have a control there.
 */
export function WatchlistOrigin() {
  const { filteredWatchlist, filters, setCountry, setLanguage } = useExplorer();
  const [mode, setMode] = useState<Mode>("country");

  const bars = useMemo(
    () => (mode === "country" ? countryBars(filteredWatchlist) : languageBars(filteredWatchlist)),
    [filteredWatchlist, mode],
  );

  const active = mode === "country" ? filters.country : filters.language;
  const onPick = mode === "country" ? setCountry : setLanguage;

  return (
    <>
      <div className="mb-2">
        <Toggle options={MODES} value={mode} onChange={setMode} label="Origin dimension" />
      </div>
      <RankedBars
        bars={bars}
        total={filteredWatchlist.length}
        active={active}
        onPick={onPick}
        ariaLabel={`Watchlist films per ${mode}`}
      />
      <ChartTakeaway>
        {mode === "country"
          ? "co-productions count once per country"
          : "one language per film"}
      </ChartTakeaway>
    </>
  );
}
