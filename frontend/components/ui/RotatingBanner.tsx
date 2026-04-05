'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Advertisement } from '@/lib/api';

interface RotatingBannerProps {
  banners: Advertisement[];
}

const ROTATE_INTERVAL_MS = 5000;

export function RotatingBanner({ banners }: RotatingBannerProps) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const id = setInterval(() => {
      setCurrent((i) => (i + 1) % banners.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [banners.length]);

  if (banners.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
        <h1 className="text-4xl font-extrabold sm:text-6xl">Welcome to MAMALI</h1>
        <p className="mt-4 max-w-xl text-lg text-blue-100">
          Your trusted digital commerce platform in Kenya.
        </p>
        <Link
          href="/products"
          className="mt-6 rounded-lg bg-white px-8 py-3 text-sm font-semibold text-blue-700 shadow transition hover:bg-blue-50"
        >
          Shop Now
        </Link>
      </div>
    );
  }

  const banner = banners[current];

  return (
    <div className="relative h-64 w-full sm:h-80 md:h-96">
      {banner.imageUrl ? (
        <Image
          src={banner.imageUrl}
          alt={banner.title}
          fill
          className="object-cover opacity-50"
          priority={current === 0}
        />
      ) : null}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        <h1 className="text-3xl font-extrabold sm:text-5xl">{banner.title}</h1>
        {banner.content && (
          <p className="mt-3 max-w-xl text-lg text-blue-100">{banner.content}</p>
        )}
        {banner.linkUrl && (
          <Link
            href={banner.linkUrl}
            className="mt-6 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-blue-700 shadow transition hover:bg-blue-50"
          >
            Shop Now
          </Link>
        )}
      </div>
      {banners.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              aria-label={`Banner ${i + 1}`}
              className={`h-2 w-2 rounded-full transition ${
                i === current ? 'bg-white scale-125' : 'bg-white/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
