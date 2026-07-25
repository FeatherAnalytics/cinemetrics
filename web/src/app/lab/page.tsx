import { LabCharts } from "@/components/lab/LabCharts";
import type { Dataset } from "@/lib/types";
import dataset from "../../../public/data/cinemetrics.json";

// Scratch route for chart prototypes — /lab. Not linked from anywhere; each
// prototype is either promoted into a real component or deleted after review.
export const metadata = { title: "Chart lab" };

export default function Page() {
  return <LabCharts data={dataset as unknown as Dataset} />;
}
