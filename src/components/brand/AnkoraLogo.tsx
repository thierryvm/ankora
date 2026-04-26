import { cn } from '@/lib/utils';

interface AnkoraLogoProps extends React.SVGProps<SVGSVGElement> {
  /**
   * Display the wordmark alongside the mark. Defaults to true.
   * Set to false for compact contexts (small nav, mobile avatar).
   */
  wordmark?: boolean;
}

/**
 * Ankora brand mark. Teal background + laiton (brass) eyelet + white anchor.
 * Inline SVG so it inherits `currentColor` for focus styles and can be
 * sized with Tailwind height/width utilities.
 */
export function AnkoraLogo({
  wordmark = true,
  className,
  ...props
}: AnkoraLogoProps): React.JSX.Element {
  if (wordmark) {
    return (
      <svg
        viewBox="0 0 280 64"
        fill="none"
        role="img"
        aria-label="Ankora"
        className={cn('select-none', className)}
        {...props}
      >
        <rect width="64" height="64" rx="14" fill="#0F766E" />
        <circle cx="32" cy="17" r="4.5" stroke="#d4a017" strokeWidth="2.5" fill="none" />
        <line
          x1="32"
          y1="22"
          x2="32"
          y2="50"
          stroke="#F8FAFC"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <line
          x1="23"
          y1="28"
          x2="41"
          y2="28"
          stroke="#F8FAFC"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M 14 40 Q 14 52 32 52 Q 50 52 50 40"
          stroke="#F8FAFC"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <text
          x="84"
          y="42"
          fill="currentColor"
          fontFamily="inherit"
          fontSize="30"
          fontWeight="700"
          letterSpacing="-1.2"
        >
          Ankora
        </text>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="Ankora"
      className={cn('select-none', className)}
      {...props}
    >
      <rect width="64" height="64" rx="14" fill="#0F766E" />
      <circle cx="32" cy="17" r="4.5" stroke="#d4a017" strokeWidth="2.5" fill="none" />
      <line
        x1="32"
        y1="22"
        x2="32"
        y2="50"
        stroke="#F8FAFC"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="23"
        y1="28"
        x2="41"
        y2="28"
        stroke="#F8FAFC"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M 14 40 Q 14 52 32 52 Q 50 52 50 40"
        stroke="#F8FAFC"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
