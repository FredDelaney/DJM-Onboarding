'use client';

import Link from 'next/link';

export default function Brand({
  light = false,
  compact = false,
}: {
  light?: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href="/"
      className={`brand ${
        light ? 'brand-light' : ''
      }`}
      aria-label="DJM Sports Management"
    >
      <span className="brand-mark">
        <img
          src="/djm-mark.png"
          alt="DJM Sports Management"
        />
      </span>

      {!compact && (
        <span className="brand-copy">
          DJM PLAYER
          <small>SPORTS MANAGEMENT</small>
        </span>
      )}
    </Link>
  );
}
