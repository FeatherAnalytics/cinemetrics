// TMDB original_language code -> display name.
//
// Intl.DisplayNames handles all but one of the 23 codes in the data. TMDB is not
// strictly ISO 639-1 here: it writes Cantonese as "cn", which is not a language
// code at all (ISO 639-3 has it as "yue", and "cn" is a COUNTRY code), so Intl
// hands the string straight back and the language chart printed a bare "cn"
// among a column of real names.
const OVERRIDE: Record<string, string> = {
  cn: "Cantonese",
};

export function languageName(code: string): string {
  const override = OVERRIDE[code];
  if (override) return override;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    // An unknown or malformed code is shown as itself rather than dropped: a
    // visible oddity is easier to notice and fix than a silently missing bar.
    return code;
  }
}
