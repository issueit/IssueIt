/**
 * Just enough of the source map format to turn a minified stack frame back
 * into a file and a line someone can open. Written out rather than taken as
 * a dependency: the useful part is one decoder and one binary search, and a
 * stack is the single thing that makes a bug report actionable.
 */

export type RawSourceMap = {
  version: number;
  sources: Array<string | null>;
  names?: string[];
  mappings: string;
  sourceRoot?: string;
  file?: string;
  sourcesContent?: Array<string | null>;
};

export type OriginalPosition = { source: string; line: number; column: number; name?: string };

/* -------------------------------------------------------------------- VLQ */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const VALUES = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) VALUES[ALPHABET.charCodeAt(i)] = i;

/** Reads one base64 VLQ number starting at `cursor.i`, which it advances. */
function readVlq(text: string, cursor: { i: number }): number | null {
  let result = 0;
  let shift = 0;
  let digit: number;
  do {
    if (cursor.i >= text.length) return null;
    const value = VALUES[text.charCodeAt(cursor.i++)] ?? -1;
    if (value < 0) return null;
    digit = value;
    result += (digit & 31) << shift;
    shift += 5;
  } while (digit & 32);
  // The low bit is the sign, which is why negative zero has to be handled.
  return result & 1 ? (result >>> 1 === 0 ? -0x80000000 : -(result >>> 1)) : result >>> 1;
}

type Segment = { generatedColumn: number; source: number; originalLine: number; originalColumn: number; name: number };

/** Decoded lazily: a map is only worth parsing when a stack actually needs it. */
export class SourceMap {
  private lines: Segment[][] | null = null;

  constructor(private readonly raw: RawSourceMap) {}

  static parse(json: string): SourceMap | null {
    try {
      const raw = JSON.parse(json) as RawSourceMap;
      if (typeof raw?.mappings !== "string" || !Array.isArray(raw.sources)) return null;
      return new SourceMap(raw);
    } catch {
      return null;
    }
  }

  private decode(): Segment[][] {
    if (this.lines) return this.lines;
    const lines: Segment[][] = [];
    let source = 0;
    let originalLine = 0;
    let originalColumn = 0;
    let name = 0;

    for (const group of this.raw.mappings.split(";")) {
      const segments: Segment[] = [];
      let generatedColumn = 0;
      for (const text of group.split(",")) {
        if (!text) continue;
        const cursor = { i: 0 };
        const dCol = readVlq(text, cursor);
        if (dCol === null) continue;
        generatedColumn += dCol;
        const dSource = readVlq(text, cursor);
        if (dSource === null) {
          // A one-field segment says "generated code with no original".
          segments.push({ generatedColumn, source: -1, originalLine: -1, originalColumn: -1, name: -1 });
          continue;
        }
        source += dSource;
        originalLine += readVlq(text, cursor) ?? 0;
        originalColumn += readVlq(text, cursor) ?? 0;
        const dName = readVlq(text, cursor);
        if (dName !== null) name += dName;
        segments.push({ generatedColumn, source, originalLine, originalColumn, name: dName === null ? -1 : name });
      }
      lines.push(segments);
    }
    this.lines = lines;
    return lines;
  }

  /** Lines and columns are 1-based going in, as they appear in a stack trace. */
  originalPositionFor(line: number, column: number): OriginalPosition | null {
    const segments = this.decode()[line - 1];
    if (!segments?.length) return null;
    const target = column - 1;

    // The last segment at or before this column owns it.
    let low = 0;
    let high = segments.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (segments[mid].generatedColumn <= target) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const segment = segments[found === -1 ? 0 : found];
    if (!segment || segment.source < 0) return null;
    const source = this.raw.sources[segment.source];
    if (source == null) return null;
    const root = this.raw.sourceRoot ? `${this.raw.sourceRoot.replace(/\/$/, "")}/` : "";
    const name = segment.name >= 0 ? this.raw.names?.[segment.name] : undefined;
    return { source: tidy(`${root}${source}`), line: segment.originalLine + 1, column: segment.originalColumn + 1, ...(name ? { name } : {}) };
  }
}

/**
 * What a bundler writes is relative to its own output: webpack://app/./src/x.ts,
 * or ../src/x.ts from an out/ directory. What someone wants is the path in the
 * repository, so the scheme and the climb out of the build folder both go.
 */
function tidy(source: string): string {
  return source
    .replace(/^[a-z-]+:\/\/[^/]*\//i, "")
    .replace(/^(?:\.\.\/)+/, "")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

/* ------------------------------------------------------------------ stacks */

export type Frame = {
  /** The whole line, so anything unrecognised can be put back as it was. */
  raw: string;
  fn?: string;
  file: string;
  line: number;
  column: number;
};

const V8 = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/;
const SPIDERMONKEY = /^\s*(?:(.*?)@)?(.+?):(\d+):(\d+)\s*$/;

/** Reads the frames out of a stack, in either of the two shapes browsers write. */
export function parseStack(stack: string): Array<Frame | string> {
  return stack.split("\n").map((raw) => {
    const match = V8.exec(raw) ?? SPIDERMONKEY.exec(raw);
    if (!match) return raw;
    const [, fn, file, line, column] = match;
    if (!/^\w+:\/\/|^\//.test(file) && !/\.[cm]?js/.test(file)) return raw;
    return { raw, fn: fn || undefined, file, line: Number(line), column: Number(column) };
  });
}

/** The file part of a URL, as a source map is named after it: assets/app-8fd2.js. */
export function fileKey(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0];
  try {
    return new URL(withoutQuery).pathname.replace(/^\/+/, "");
  } catch {
    return withoutQuery.replace(/^\/+/, "");
  }
}

/**
 * Rewrites every frame a map is available for, leaving the rest alone. The
 * original line is added rather than substituted, because the built location
 * is still what the browser saw.
 */
export function symbolicateStack(stack: string, find: (file: string) => SourceMap | undefined): { stack: string; changed: number } {
  let changed = 0;
  const lines = parseStack(stack).map((frame) => {
    if (typeof frame === "string") return frame;
    const map = find(fileKey(frame.file));
    const original = map?.originalPositionFor(frame.line, frame.column);
    if (!original) return frame.raw;
    changed++;
    const fn = original.name ?? frame.fn;
    return `    at ${fn ? `${fn} ` : ""}(${original.source}:${original.line}:${original.column})`;
  });
  return { stack: lines.join("\n"), changed };
}
