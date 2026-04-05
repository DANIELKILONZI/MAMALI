'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Product, effectivePrice, stockStatus } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface ProductCardProps {
  product: Product;
}

const stockBadge = {
  in_stock: { variant: 'green' as const, label: 'In Stock' },
  low_stock: { variant: 'yellow' as const, label: 'Low Stock' },
  out_of_stock: { variant: 'red' as const, label: 'Out of Stock' },
};

function scarcityLabel(stock: number, status: string): string | null {
  if (status === 'low_stock' && stock > 0) return `Only ${stock} left`;
  return null;
}

export function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();
  const status = stockStatus(product.stock);
  const badge = stockBadge[status];
  const price = effectivePrice(product);
  const firstImage = product.images?.[0];

  function handleAddToCart() {
    addItem({
      productId: product.id,
      name: product.name,
      price,
      image: firstImage,
      stock: product.stock,
      quantity: 1,
    });
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      <Link href={`/products/${product.slug}`} className="relative block aspect-square overflow-hidden bg-gray-100">
        {firstImage ? (
          <Image
            src={firstImage}
            alt={product.name}
            fill
            className="object-cover transition duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {product.boostScore && product.boostScore > 0 ? (
            <Badge variant="blue">🔥 Hot</Badge>
          ) : null}
        </div>
        {product.discount > 0 && (
          <div className="absolute right-2 top-2">
            <Badge variant="red">-{product.discount}%</Badge>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        {product.category && (
          <Link
            href={`/categories/${product.category.slug}`}
            className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-600 hover:underline"
          >
            {product.category.name}
          </Link>
        )}
        <Link href={`/products/${product.slug}`} className="mb-2 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold text-gray-800 hover:text-blue-600">
            {product.name}
          </h3>
        </Link>

        <div className="mb-3 flex items-baseline gap-2">
          <span className="text-lg font-bold text-gray-900">
            KSh {price.toLocaleString('en-KE', { minimumFractionDigits: 0 })}
          </span>
          {product.discount > 0 && (
            <span className="text-sm text-gray-400 line-through">
              KSh {product.price.toLocaleString('en-KE', { minimumFractionDigits: 0 })}
            </span>
          )}
        </div>

        {scarcityLabel(product.stock, status) && (
          <p className="mb-2 text-xs font-semibold text-red-600">
            ⚠ {scarcityLabel(product.stock, status)}
          </p>
        )}

        <Button
          onClick={handleAddToCart}
          disabled={status === 'out_of_stock'}
          size="sm"
          className="w-full"
        >
          {status === 'out_of_stock' ? 'Out of Stock' : 'Add to Cart'}
        </Button>
      </div>
    </div>
  );
}
