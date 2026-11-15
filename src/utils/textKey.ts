/** Stable key for a narration line (FNV-1a over normalized text). Shared by the app and the generator. */
export function textKey(text: string): string {
  const s = text.replace(/\s+/g, " ").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
