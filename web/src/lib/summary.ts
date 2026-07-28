/**
 * The dataset's own description of itself.
 *
 * The page header, the <meta> description, and the generated OG image all read
 * from here. They used to each carry their own copy of the sentence, which is
 * how the share preview ended up claiming "Seven years - 794 films" while the
 * page said eight years and 676: 794 is the viewing count, not the film count.
 */

const SPAN_WORDS = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve",
];

export function spanWord(n: number): string {
  return SPAN_WORDS[n] ?? String(n);
}

export type DatasetCounts = {
  startYear: number;
  endYear: number;
  years: number;
  filmCount: number;
  watchCount: number;
};

/** Watch years, not release years: the span is how long I have been logging. */
export function datasetCounts(data: {
  films: unknown[];
  watches: { date: string }[];
}): DatasetCounts {
  const years = data.watches.map((w) => new Date(w.date).getUTCFullYear());
  const startYear = Math.min(...years);
  const endYear = Math.max(...years);
  return {
    startYear,
    endYear,
    years: endYear - startYear + 1,
    filmCount: data.films.length,
    watchCount: data.watches.length,
  };
}

/** "A personal film log · 2019–2026" */
export function eyebrow(startYear: number, endYear: number): string {
  return `a personal film log · ${startYear}–${endYear}`;
}

/**
 * The one-line pitch, shared by the page header and every share preview.
 * `films` rather than `watches` on purpose - a rewatch is not a new film.
 */
export function summaryLine(years: number, filmCount: number): string {
  const unit = years === 1 ? "year" : "years";
  return (
    `${spanWord(years)} ${unit} and ${filmCount} films — what I watch, ` +
    `when I watch it, and what that says about my taste.`
  );
}
