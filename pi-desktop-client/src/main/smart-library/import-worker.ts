import { parentPort, workerData } from "node:worker_threads";
import { readFile, stat } from "node:fs/promises";
import { parseBook } from "./book-parser";
(async () => {
  if ((await stat(workerData.path)).size > 80 * 1024 * 1024) throw Error("单本图书不能超过 80 MB");
  parentPort!.postMessage({ book: await parseBook(await readFile(workerData.path), workerData.path) });
})().catch(error => parentPort!.postMessage({ error: String(error.message ?? error) }));
