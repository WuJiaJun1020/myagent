import { writeFile } from "node:fs/promises";
import type { App } from "electron";
import { PiProcess } from "../../src/main/pi-process";

/** Compiled only for release verification; the normal main bundle has no test logic. */
export async function runPackagedSmokeTest(resultPath: string, app: Pick<App, "getAppPath" | "exit">): Promise<void> {
  const pi = new PiProcess(process.cwd(), app.getAppPath());
  let success = false;
  try {
    await pi.start();
    const response = await pi.send({ type: "get_state" }, 30_000);
    await writeFile(resultPath, JSON.stringify({ success: true, command: response.command,
      model: (response.data as { model?: { id?: string } } | undefined)?.model?.id, appPath: app.getAppPath() }, null, 2), "utf8");
    success = true;
  } catch (error) {
    await writeFile(resultPath, JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error), appPath: app.getAppPath() }, null, 2), "utf8");
  } finally { await pi.stop(); app.exit(success ? 0 : 1); }
}
