const { app } = require("electron");
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const pty = require("node-pty");

const marker = "__PI_DESKTOP_PTY_OK__";

function shellConfig() {
  if (process.platform === "win32") {
    const executable = join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    if (!existsSync(executable)) throw new Error(`PowerShell not found: ${executable}`);
    return { executable, args: ["-NoLogo", "-NoProfile"], command: `Write-Output '${marker}'\r` };
  }
  const executable = process.env.SHELL || "/bin/bash";
  return { executable, args: ["--noprofile", "--norc"], command: `printf '${marker}\\n'\r` };
}

app.whenReady().then(() => {
  const config = shellConfig();
  const terminal = pty.spawn(config.executable, config.args, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: { ...process.env, TERM_PROGRAM: "pi-desktop-smoke" },
    ...(process.platform === "win32" ? { useConpty: true } : {}),
  });
  let passed = false;
  const timeout = setTimeout(() => {
    terminal.kill();
    console.error("PTY smoke test timed out");
    app.exit(1);
  }, 10_000);

  terminal.onData((data) => {
    if (!data.includes(marker) || passed) return;
    passed = true;
    terminal.write("exit\r");
  });
  terminal.onExit(() => {
    clearTimeout(timeout);
    if (passed) console.log(`PTY smoke test passed (Electron ${process.versions.electron})`);
    app.exit(passed ? 0 : 1);
  });
  terminal.write(config.command);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
