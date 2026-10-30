/**
 * Attachment checks. The type is decided from the file's first bytes, not
 * from what the client claims, and only types that are safe to store and
 * show are accepted. SVG and HTML are refused because they can carry script.
 */

export type DetectedType = { contentType: string; ext: string };

const startsWith = (buf: Uint8Array, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

export function sniff(buf: Uint8Array): DetectedType | null {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { contentType: "image/png", ext: "png" };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { contentType: "image/jpeg", ext: "jpg" };
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return { contentType: "image/gif", ext: "gif" };
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return { contentType: "image/webp", ext: "webp" };
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { contentType: "application/pdf", ext: "pdf" };
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return { contentType: "video/webm", ext: "webm" };
  if (startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) return { contentType: "video/mp4", ext: "mp4" };
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return { contentType: "application/zip", ext: "zip" };
  if (isText(buf)) return { contentType: "text/plain", ext: "txt" };
  return null;
}

/** UTF-8 text without control characters other than whitespace, and not markup. */
function isText(buf: Uint8Array): boolean {
  const sample = buf.subarray(0, 8192);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(sample);
  } catch {
    // A multi-byte character cut at the sample boundary is still text.
    if (buf.length <= 8192) return false;
    text = new TextDecoder("utf-8").decode(sample.subarray(0, 8100));
  }
  if (/[\x00-\x08\x0e-\x1f]/.test(text)) return false;
  return !/^\s*<(?:!doctype|html|svg|\?xml|script)/i.test(text);
}

export function cleanFilename(name: string | undefined, ext: string): string {
  const base = (name ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[^\w.\- ()]+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  if (!base) return `attachment.${ext}`;
  return /\.[a-z0-9]{1,8}$/i.test(base) ? base : `${base}.${ext}`;
}
