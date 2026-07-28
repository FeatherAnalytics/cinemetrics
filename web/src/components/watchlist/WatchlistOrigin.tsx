"use client";

import { useMemo, useState } from "react";
import { useExplorer } from "@/lib/store";
import { ratingDeltaByKey } from "@/lib/ratingDelta";
import { countryBars, languageBars } from "@/lib/watchlistChart";
import { ChartTakeaway } from "../ChartTakeaway";
import { Toggle } from "../stats/Toggle";
import { RankedBars } from "./RankedBars";

const MODES = ["country", "language"] as const;
type Mode = (typeof MODES)[number];

/**
 * Where the watchlist comes from — production country or original language.
 *
 * One chart with a switch rather than two side by side. The two views mostly
 * agree (an American film is usually in English), so as separate charts they
 * read as one finding stated twice; the switch makes the comparison the point
 * and gives the disagreements — a co-production, an English-language film shot
 * abroad — somewhere to show up.
 *
 * The second track is a rating deviation drawn from films ALREADY WATCHED from
 * that country or language, because nothing on the watchlist has a rating. So
 * the row reads "twelve Japanese films waiting, and Japanese films I have seen
 * rate four points above my median" — two facts about one origin, not one fact
 * measured twice.
 */
export function WatchlistOrigin() {
  const { filteredWatchlist, filtered, filters, setCountry, setLanguage } = useExplorer();
  const [mode, setMode] = useState<Mode>("country");
  const isLang = mode === "language";

  const bars = useMemo(
    () => (isLang ? languageBars(filteredWatchlist) : countryBars(filteredWatchlist)),
    [filteredWatchlist, isLang],
  );

  // Measured off the WATCH log, not the watchlist, and against whatever the rail
  // currently shows so the baseline is the films on screen.
  const deltas = useMemo(
    () =>
      ratingDeltaByKey(filtered, (w) =>
        isLang
          ? w.film?.language
            ? [w.film.language]
            : []
          : (w.film?.production_countries ?? []),
      ),
    [filtered, isLang],
  );

  const active = isLang ? filters.language : filters.country;
  const onPick = isLang ? setLanguage : setCountry;

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
        deltas={deltas}
        ariaLabel={`Watchlist films per ${mode}, with how I rate films I have already seen from each`}
      />
      <ChartTakeaway>
        {isLang
          ? "one language per film · deviation from films I've seen"
          : "co-productions count once per country · deviation from films I've seen"}
      </ChartTakeaway>
    </>
  );
}
