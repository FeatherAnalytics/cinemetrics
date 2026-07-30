import type { Metadata } from "next";
import { Lab } from "@/components/lab/Lab";
import type { Dataset } from "@/lib/types";
import dataset from "../../../public/data/cinemetrics.json";

// Unlinked on purpose: the retirement home for charts that were built, worked,
// and lost their argument for a place in the main narrative. Nothing links
// here and nothing should - it is for anyone who goes looking.
//
// A chart lands here instead of being deleted when it is correct but redundant.
// A chart that is WRONG gets deleted; this is not a quarantine.
export const metadata: Metadata = { title: "Prototypes", robots: { index: false } };

export default function Page() {
  return <Lab data={dataset as unknown as Dataset} />;
}
