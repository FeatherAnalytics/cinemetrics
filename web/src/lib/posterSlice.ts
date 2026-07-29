/** 20 RGB stops, packed six hex characters each by ingest/poster_slice.py. */
export const SLICE_STOPS = 20;

/**
 * Unpack a film's poster slice into CSS colours, top of the poster first.
 *
 * Returns [] for absent or malformed input, so a bad row draws the barcode's
 * fallback stripe instead of throwing on the landing page.
 */
export function sliceStops(packed: string | null | undefined): string[] {
  if (!packed || packed.length !== SLICE_STOPS * 6) return [];
  const out: string[] = [];
  for (let i = 0; i < SLICE_STOPS; i++) out.push(`#${packed.slice(i * 6, i * 6 + 6)}`);
  return out;
}
