import { ExplorerApp } from "@/components/ExplorerApp";
import type { Dataset } from "@/lib/types";
import dataset from "../../public/data/cinemetrics.json";

// The dataset is known at build time (the pipeline rebuilds the site whenever it
// changes), so it's imported here in a Server Component and baked into the
// prerendered HTML — no client fetch, no loading flash, no layout shift.
export default function Page() {
  return <ExplorerApp data={dataset as unknown as Dataset} />;
}
