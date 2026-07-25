import { StatsStoryPreview } from "@/components/stats/StatsStoryPreview";
import type { Dataset } from "@/lib/types";
import dataset from "../../../public/data/cinemetrics.json";

// Preview of the stats story at /lab. Not linked from anywhere. Unlike the
// prototypes that used to live here, these are the real components: promoting
// them is a matter of wiring the story swap, not rewriting the charts.
export const metadata = { title: "The stats (preview)" };

export default function Page() {
  return <StatsStoryPreview data={dataset as unknown as Dataset} />;
}
