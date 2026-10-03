import type { LibraryApi, LibraryRuntimeStatus } from "../../../shared/contracts/smart-library";

export type RuntimeSnapshot = { status?: LibraryRuntimeStatus; checking: boolean; error?: string };

// One check/start and one polling loop, even when several panels are visible.
// Importing this module does no work; the first open panel subscribes lazily.
export class LibraryRuntimeMonitor {
  private snapshot: RuntimeSnapshot = { checking: true };
  private listeners = new Set<() => void>();
  private operation?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  constructor(private api: () => Pick<LibraryApi, "modelRuntime">) {}
  getSnapshot = () => this.snapshot;
  private publish(value: RuntimeSnapshot) {
    this.snapshot = value;
    for (const listener of this.listeners) listener();
  }
  subscribe = (listener: () => void) => {
    const first = !this.listeners.size;
    this.listeners.add(listener);
    if (first) void this.ensure();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) clearTimeout(this.timer);
    };
  };
  ensure = (): Promise<void> => {
    if (this.operation) return this.operation;
    clearTimeout(this.timer);
    const generation = ++this.generation;
    this.publish({ ...this.snapshot, checking: true, error: undefined });
    const operation = (async () => {
      try {
        const status = await this.api().modelRuntime("ensure");
        if (generation === this.generation) this.publish({ status, checking: false });
      } catch (error) {
        if (generation === this.generation) this.publish({ checking: false, error: String(error) });
      } finally {
        this.operation = undefined;
        this.schedule();
      }
    })();
    this.operation = operation;
    return operation;
  };
  private schedule() {
    clearTimeout(this.timer);
    const status = this.snapshot.status;
    if (this.listeners.size && status?.managedRequired !== false) {
      this.timer = setTimeout(() => void this.poll(), 2000);
    }
  }
  private async poll() {
    const generation = this.generation;
    try {
      const status = await this.api().modelRuntime("status");
      if (generation === this.generation && this.listeners.size) this.publish({ checking: false, error: status.state === "stopped" ? this.snapshot.error : undefined,
        status: { ...status, managedRequired: this.snapshot.status?.managedRequired, notice: this.snapshot.status?.notice } });
    } catch (error) {
      if (generation === this.generation && this.listeners.size) this.publish({ checking: false, error: String(error) });
    } finally { if (generation === this.generation) this.schedule(); }
  }
}
