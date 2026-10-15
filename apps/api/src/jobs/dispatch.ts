import { AppError } from "../lib/errors";
import { enqueue, type JobMap } from "./queue";

/**
 * Queues the job for a run row that was just inserted. If the queue cannot take it, the row is
 * marked failed straight away: a row left "queued" with no job would block the tracker or
 * project (one active run each) until cleanup.
 */
export async function dispatch<K extends keyof JobMap>(name: K, data: JobMap[K], markFailed: (message: string) => Promise<unknown>): Promise<void> {
  try {
    await enqueue(name, data);
  } catch (error) {
    await markFailed(`Could not be queued: ${error instanceof Error ? error.message : String(error)}`).catch(() => {});
    throw new AppError(503, "queue_unavailable", "The background queue is unavailable. Nothing was spent; try again in a moment.");
  }
}
