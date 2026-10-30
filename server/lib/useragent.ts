/** Small user-agent summary: enough for a bug report, without a 50 KB parser. */
export function describeUserAgent(ua: string | undefined | null): { browser?: string; os?: string; device?: string } {
  if (!ua) return {};
  const browser =
    match(ua, /Edg(?:e|A|iOS)?\/(\d+)/, "Edge") ??
    match(ua, /OPR\/(\d+)/, "Opera") ??
    match(ua, /SamsungBrowser\/(\d+)/, "Samsung Internet") ??
    match(ua, /Firefox\/(\d+)/, "Firefox") ??
    match(ua, /FxiOS\/(\d+)/, "Firefox") ??
    match(ua, /CriOS\/(\d+)/, "Chrome") ??
    match(ua, /Chrome\/(\d+)/, "Chrome") ??
    (/(Safari)\//.test(ua) ? match(ua, /Version\/(\d+(?:\.\d+)?)/, "Safari") ?? "Safari" : undefined);
  const os = /Windows NT 10/.test(ua)
    ? "Windows"
    : /Windows/.test(ua)
      ? "Windows"
      : /iPhone|iPad|iPod/.test(ua)
        ? `iOS ${(ua.match(/OS (\d+)_/) ?? [])[1] ?? ""}`.trim()
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Android/.test(ua)
            ? `Android ${(ua.match(/Android (\d+)/) ?? [])[1] ?? ""}`.trim()
            : /CrOS/.test(ua)
              ? "ChromeOS"
              : /Linux/.test(ua)
                ? "Linux"
                : undefined;
  const device = /Mobi|iPhone|Android.+Mobile/.test(ua) ? "Mobile" : /iPad|Tablet/.test(ua) ? "Tablet" : "Desktop";
  return { browser, os, device };
}

function match(ua: string, re: RegExp, name: string) {
  const m = ua.match(re);
  return m ? `${name} ${m[1]}` : undefined;
}
