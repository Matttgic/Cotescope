const ROOT = "https://raw.githubusercontent.com/Matttgic/cotes-value/donnees/";
/** Fixed public endpoints, bounded streaming body and timeout; never calls PulseScore. */
export async function readPublishedFeed(
  file: "paris.json" | "opportunites_actuelles.json",
  maxBytes: number,
): Promise<unknown> {
  const response = await fetch(ROOT + file, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !response.body) throw new Error("source_unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("feed_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
