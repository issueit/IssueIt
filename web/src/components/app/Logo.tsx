/** The wordmark: a plain glyph and the name, no decoration. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold text-md">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M11 9.5h10M16 9.5v13M11 22.5h10" stroke="var(--accent-fg)" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      Issueit
    </span>
  );
}
