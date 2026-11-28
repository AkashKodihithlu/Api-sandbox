import Link from 'next/link';

export function BrandMark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="brand">
      <span className="brand-mark" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path
            d="M3 12V4l5 4.5L13 4v8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="brand-name">MockFlow</span>
    </Link>
  );
}
