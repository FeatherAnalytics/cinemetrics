import type { Metadata } from "next";
import { Lab } from "@/components/lab/Lab";
import type { Dataset } from "@/lib/types";
import dataset from "../../../public/data/cinemetrics.json";

// Unlinked on purpose: a staging surface for prototypes under review, before one
// of them is promoted to the main page. Nothing links here and nothing should.
//
// `robots: { index: false }` emits `<meta name="robots" content="noindex">`, which
// is the whole of what keeps this out of a search index on a static export: there
// is no server to serve a header and no sitemap listing it. Verified against
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md.
export const metadata: Metadata = { title: "Prototypes", robots: { index: false } };

export default function Page() {
  return <Lab data={dataset as unknown as Dataset} />;
}
