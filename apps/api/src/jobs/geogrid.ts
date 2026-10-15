import { processGrid } from "../services/geogrid";
import { defineJob } from "./queue";

defineJob("geogrid.run", 2, async ({ gridId }) => {
  await processGrid(gridId);
});
