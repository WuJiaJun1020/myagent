import { spawn } from 'node:child_process';

/** Serialize graceful restarts so old and new Electron processes never overlap. */
export class DevElectron {
  child;
  closed;
  restarting = false;
  stopped = false;
  pending = false;
  task = Promise.resolve();
  constructor({ executable, args, env, onExit = () => {}, timeoutMs = 30000 }) {
    Object.assign(this, { executable, args, env, onExit, timeoutMs });
  }
  restart() {
    if (this.stopped) return this.task;
    this.pending = true;
    if (this.restarting) return this.task;
    this.restarting = true;
    this.task = (async () => {
      try {
        while (this.pending && !this.stopped) {
          this.pending = false;
          await this.closeChild();
          if (this.stopped) break;
          // This is the user's interactive GUI, not a background helper.
          // On Windows, windowsHide suppresses Electron's first show() call.
          this.child = spawn(this.executable, this.args, { env: this.env, windowsHide: false, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
          const child = this.child;
          this.closed = new Promise(resolve => {
            child.once('error', error => { console.error('[dev] Electron 启动失败', error); resolve(); });
            child.once('close', code => {
              if (this.child === child) this.child = undefined;
              resolve();
              if (!this.restarting && !this.stopped) this.onExit(code);
            });
          });
          console.log(`[dev] Electron 已启动（PID ${child.pid ?? '未知'}）`);
        }
      } finally { this.restarting = false; }
    })();
    return this.task;
  }
  async closeChild() {
    const child = this.child;
    if (!child) return;
    if (child.connected) child.send({ type: 'pi-desktop-dev:quit' }, error => { if (error) console.error('[dev] 退出请求发送失败', error.message); });
    const timer = setTimeout(() => {
      console.warn('[dev] 正常退出超时，结束开发窗口进程');
      child.kill();
    }, this.timeoutMs);
    try { await this.closed; } finally { clearTimeout(timer); }
  }
  async stop() {
    this.stopped = true;
    this.pending = false;
    await this.task;
    await this.closeChild();
  }
}
