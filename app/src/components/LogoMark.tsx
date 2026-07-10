/**
 * The brand mark: `LineMotif` reduced to a square. Not an approximation of it, but the
 * same control points, scaled from its 520x200 box into 24x24 (X = 2.6 + 18u,
 * Y = 3.2 + 19v). So the mark keeps the motif's whole shape: the price starts low,
 * dips, climbs with an overshoot, settles back onto the entry line where you took it,
 * and rises away to the close. The gap between those two markers is Closing Line Value.
 *
 * The line and closing marker inherit `currentColor`, so the mark works on any plane.
 * The entry marker stays accent, because that is the number you committed to.
 *
 * Keep this in sync with `public/favicon.svg`.
 */
export default function LogoMark({ className = '', accent = 'var(--color-accent)' }: { className?: string; accent?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      {/* entry reference: the price you took, held flat across the match */}
      <line x1="2.2" y1="12.32" x2="21.4" y2="12.32" stroke="currentColor" strokeWidth="1.15" strokeDasharray="2.4 2.4" opacity="0.4" />
      {/* the consensus line: dip, overshoot, settle onto entry, then away to the close */}
      <path
        d="M2.6 17.45 C4.67 16.5 6.42 19.16 8.49 14.6 S12.99 8.9 15.06 12.32 L20.6 7.38"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="15.06" cy="12.32" r="2" fill={accent} />
      <circle cx="20.6" cy="7.38" r="2" fill="currentColor" />
    </svg>
  )
}
