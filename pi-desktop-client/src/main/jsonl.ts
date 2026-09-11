export class JsonlDecoder {
  private buffer = "";

  push(chunk: Buffer | string): string[] {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const records: string[] = [];

    while (true) {
      const newline = this.buffer.indexOf("\n");
      if (newline === -1) break;

      let record = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (record.endsWith("\r")) record = record.slice(0, -1);
      if (record.length > 0) records.push(record);
    }

    return records;
  }

  finish(): string[] {
    if (!this.buffer) return [];
    let record = this.buffer;
    this.buffer = "";
    if (record.endsWith("\r")) record = record.slice(0, -1);
    return record ? [record] : [];
  }
}
