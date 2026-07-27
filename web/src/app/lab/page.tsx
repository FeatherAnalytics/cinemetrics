import { Lab } from "@/components/lab/Lab";
import type { Dataset } from "@/lib/types";
import dataset from "../../../public/data/cinemetrics.json";

// Prototype surface, not linked from anywhere. Delete this route again once the
// charts that survive review have a home on the main page, the way the stats
// charts did.
export const metadata = { title: "Prototypes" };

export default function Page() {
  return <Lab data={dataset as unknown as Dataset} />;
}
