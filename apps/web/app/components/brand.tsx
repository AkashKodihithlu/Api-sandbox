import Link from 'next/link';

export function BrandMark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="brand brand-link">
      <span className="brand-mark" aria-hidden="true">
        M
      </span>
      <span>MockFlow</span>
    </Link>
  );
}
