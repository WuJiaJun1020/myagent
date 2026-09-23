/** Mirrors the gateway's preflight estimate; provider-reported usage remains authoritative. */
export function estimateTextTokens(text: string): number {
  let ascii = 0;
  let nonAscii = 0;
  for (const character of text) {
    if (character.codePointAt(0)! <= 0x7f) ascii += 1;
    else nonAscii += 1;
  }
  return Math.ceil(ascii / 4 + nonAscii);
}

export function estimateJsonRequestTokens(system: string, payload: unknown, schemaName: string, schema: Readonly<Record<string, unknown>>): number {
  const instruction = [
    "Return exactly one valid JSON value with no Markdown fence or surrounding prose.",
    `JSON contract name: ${schemaName}.`,
    `The JSON value must satisfy this JSON Schema: ${JSON.stringify(schema)}`,
  ].join("\n");
  return estimateTextTokens(`${system}\n\n${instruction}`) + 4 + estimateTextTokens(JSON.stringify(payload));
}
