const { spawn } = require("node:child_process");
const { existsSync, readFileSync, unlinkSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { version } = require("../package.json");

const projectRoot = join(__dirname, "..");
const unpackedRoot = join(projectRoot, "release", "win-unpacked");
const executable = join(unpackedRoot, "Pi Desktop.exe");
const portableExecutable = join(projectRoot, "release", `Pi-Desktop-${version}-x64.exe`);
const portableResult = join(projectRoot, "release", ".portable-smoke-result.json");
const portableRequest = join(projectRoot, "release", ".portable-smoke-request");
const unpackedAppResult = join(projectRoot, "release", ".unpacked-app-smoke-result.json");
const appArchive = join(unpackedRoot, "resources", "app.asar");
const rpcEntry = join(
  unpackedRoot,
  "resources",
  "app.asar",
  "node_modules",
  "@earendil-works",
  "pi-coding-agent",
  "dist",
  "bundle",
  "rpc-entry.js",
);

function createElectronAppEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

if (!existsSync(executable) || !existsSync(appArchive)) {
  console.error("缺少打包产物，请先运行 npm.cmd run dist:win");
  process.exit(1);
}

const child = spawn(executable, [rpcEntry, "--no-session"], {
  cwd: projectRoot,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});

let buffer = "";
let stderr = "";
let settled = false;
let portableStarted = false;

function finishUnpacked(error, response) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  child.kill();

  if (error) {
    console.error(error.message);
    if (stderr.trim()) console.error(stderr.trim());
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({
    success: true,
    command: response.command,
    model: response.data?.model?.id,
    sessionId: response.data?.sessionId,
    packagedExecutable: executable,
  }, null, 2));
}

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  while (true) {
    const newline = buffer.indexOf("\n");
    if (newline === -1) break;
    let line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (!line) continue;

    try {
      const message = JSON.parse(line);
      if (message.type === "response" && message.id === "package-smoke") {
        if (message.success) finishUnpacked(null, message);
        else finishUnpacked(new Error(message.error || "打包后的 Pi RPC 返回失败"));
      }
    } catch {
      // Ignore non-JSON process diagnostics and continue waiting for the response.
    }
  }
});

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

child.once("error", (error) => finishUnpacked(error));
child.once("exit", (code, signal) => {
  if (!settled) finishUnpacked(new Error(`打包后的运行时提前退出（code=${code}, signal=${signal}）`));
});

const timer = setTimeout(() => {
  finishUnpacked(new Error("等待打包后的 Pi RPC 响应超时"));
}, 30_000);

child.stdin.write(`${JSON.stringify({ id: "package-smoke", type: "get_state" })}\n`);

async function verifyPortable() {
  if (!existsSync(portableExecutable)) {
    throw new Error("缺少便携 EXE，请先运行 npm.cmd run dist:win");
  }
  if (existsSync(portableResult)) unlinkSync(portableResult);
  writeFileSync(portableRequest, "verify", "utf8");

  let portableExit = null;
  let portableStderr = "";
  const portable = spawn(portableExecutable, [], {
    cwd: projectRoot,
    env: createElectronAppEnv({ PI_CLIENT_SMOKE_RESULT: portableResult }),
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  portable.once("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  portable.stderr.on("data", (chunk) => {
    portableStderr += chunk.toString("utf8");
  });
  portable.once("exit", (code, signal) => {
    portableExit = { code, signal };
  });

  const deadline = Date.now() + 180_000;
  while (!existsSync(portableResult) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!existsSync(portableResult)) {
    portable.kill();
    if (existsSync(portableRequest)) unlinkSync(portableRequest);
    throw new Error(`等待便携 EXE 的 Pi RPC 自检结果超时；外壳状态=${JSON.stringify(portableExit)}${portableStderr.trim() ? `；stderr=${portableStderr.trim()}` : ""}`);
  }

  const result = JSON.parse(readFileSync(portableResult, "utf8"));
  unlinkSync(portableResult);
  unlinkSync(portableRequest);
  if (!result.success) throw new Error(result.error || "便携 EXE 自检失败");
  console.log(JSON.stringify({ portable: true, ...result }, null, 2));
}

async function verifyUnpackedApp() {
  if (existsSync(unpackedAppResult)) unlinkSync(unpackedAppResult);
  const packagedApp = spawn(executable, [], {
    cwd: projectRoot,
    env: createElectronAppEnv({ PI_CLIENT_SMOKE_RESULT: unpackedAppResult }),
    stdio: "ignore",
    windowsHide: true,
  });

  const deadline = Date.now() + 60_000;
  while (!existsSync(unpackedAppResult) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!existsSync(unpackedAppResult)) {
    packagedApp.kill();
    throw new Error("等待解包应用外壳的 Pi RPC 自检结果超时");
  }

  const result = JSON.parse(readFileSync(unpackedAppResult, "utf8"));
  unlinkSync(unpackedAppResult);
  if (!result.success) throw new Error(result.error || "解包应用外壳自检失败");
  console.log(JSON.stringify({ packagedApp: true, ...result }, null, 2));
}

process.once("beforeExit", async () => {
  if (process.exitCode || portableStarted || process.argv.includes("--runtime-only")) return;
  portableStarted = true;
  try {
    await verifyUnpackedApp();
    await verifyPortable();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});
