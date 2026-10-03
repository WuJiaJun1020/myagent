export const MODEL_BATCH_SIZE = 2;
export const VECTOR_WRITE_BATCH_SIZE = 64;

// A checkpoint is advanced only after the entire buffered append is committed.
export class VectorWriteBuffer<T> {
  private rows: T[] = [];
  private writeFailed = false;
  constructor(private append: (rows: T[]) => Promise<void>, private limit = VECTOR_WRITE_BATCH_SIZE) {}
  get pending() { return this.rows.length; }
  async add(rows: T[]) {
    this.rows.push(...rows);
    if (this.rows.length >= this.limit) await this.flush();
  }
  async flush() {
    if (!this.rows.length || this.writeFailed) return;
    try { await this.append(this.rows); this.rows = []; }
    catch (error) {
      // The append may have committed before checkpoint saving failed.
      // Let restart recovery reconcile the tail; never append it again here.
      this.writeFailed = true;
      throw error;
    }
  }
}
