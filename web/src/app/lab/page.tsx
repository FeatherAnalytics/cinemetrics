import { LikedLab } from "@/components/lab/LikedLab";
import type { Dataset } from "@/lib/types";
import dataset from "../../../public/data/cinemetrics.json";

// Prototype surface, not linked from anywhere. Delete this route again once the
// `liked` charts that survive review have a home on the main page, the way the
// stats charts did.
export const metadata = { title: "The heart (prototypes)" };

export default function Page() {
  return <LikedLab data={dataset as unknown as Dataset} />;
}
