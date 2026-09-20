function splitLines(content: string): string[] {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function normalizeContextLines(value: number | undefined): number {
  if (value === undefined) return 3;
  if (!Number.isFinite(value)) return 3;
  return Math.max(0, Math.min(10_000, Math.floor(value)));
}

export function createUnifiedDiff(
  path: string,
  before: string,
  after: string,
  requestedContextLines = 3,
): string {
  if (before === after) return "";
  const contextLines = normalizeContextLines(requestedContextLines);
  const oldLines = splitLines(before);
  const newLines = splitLines(after);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix
    && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix += 1;

  const contextBefore = Math.min(contextLines, prefix);
  const contextAfter = Math.min(contextLines, suffix);
  const oldStart = prefix - contextBefore;
  const newStart = prefix - contextBefore;
  const oldChangedEnd = oldLines.length - suffix;
  const newChangedEnd = newLines.length - suffix;
  const oldCount = oldChangedEnd - oldStart + contextAfter;
  const newCount = newChangedEnd - newStart + contextAfter;
  const output = [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${oldStart + 1},${oldCount} +${newStart + 1},${newCount} @@`,
  ];

  for (let index = oldStart; index < prefix; index += 1) output.push(` ${oldLines[index]}`);
  for (let index = prefix; index < oldChangedEnd; index += 1) output.push(`-${oldLines[index]}`);
  for (let index = prefix; index < newChangedEnd; index += 1) output.push(`+${newLines[index]}`);
  for (let index = 0; index < contextAfter; index += 1) output.push(` ${oldLines[oldChangedEnd + index]}`);
  return output.join("\n");
}
