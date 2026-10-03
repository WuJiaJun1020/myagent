import { expect, it, vi } from "vitest";
import { VectorWriteBuffer, VECTOR_WRITE_BATCH_SIZE } from "../../../../../src/main/smart-library/indexing/vector-buffer";

it("combines small model batches, flushes the last partial batch and keeps order", async () => {
  const append = vi.fn().mockResolvedValue(undefined), buffer = new VectorWriteBuffer<number>(append);
  for (let i = 0; i < 70; i += 2) await buffer.add([i, i + 1]);
  expect(append).toHaveBeenCalledTimes(1); expect(append.mock.calls[0][0]).toEqual(Array.from({ length: VECTOR_WRITE_BATCH_SIZE }, (_, i) => i));
  expect(buffer.pending).toBe(6); await buffer.flush(); expect(append.mock.calls[1][0]).toEqual([64,65,66,67,68,69]);
  expect(buffer.pending).toBe(0); await buffer.flush(); expect(append).toHaveBeenCalledTimes(2);
});
it("saves partial successful results on pause or model failure", async () => {
  const append = vi.fn().mockResolvedValue(undefined), buffer = new VectorWriteBuffer<number>(append);
  await buffer.add([0,1]); await buffer.add([2,3]); expect(append).not.toHaveBeenCalled();
  await buffer.flush(); expect(append).toHaveBeenCalledWith([0,1,2,3]);
});
it("never repeats an uncertain append after write/checkpoint failure", async () => {
  const append = vi.fn().mockRejectedValue(Error("checkpoint failed")), buffer = new VectorWriteBuffer<number>(append, 2);
  await expect(buffer.add([0,1])).rejects.toThrow("checkpoint failed");
  await buffer.flush(); expect(append).toHaveBeenCalledTimes(1);
});
