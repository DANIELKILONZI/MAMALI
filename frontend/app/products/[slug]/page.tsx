'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import DOMPurify from 'dompurify';
import { api, Product, effectivePrice, stockStatus } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { CountdownTimer } from '@/components/ui/CountdownTimer';

const stockBadge = {
  in_stock: { variant: 'green' as const, label: 'In Stock' },
  low_stock: { variant: 'yellow' as const, label: 'Low Stock' },
  out_of_stock: { variant: 'red' as const, label: 'Out of Stock' },
};

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);

  const fetchProduct = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.products.get(slug);
      setProduct(res.product);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load product');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  // Fire-and-forget view tracking once product loads
  useEffect(() => {
    if (slug) {
      api.products.recordView(slug).catch(() => {});
    }
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Alert variant="error">{error || 'Product not found'}</Alert>
        <Button onClick={() => router.push('/products')} variant="outline" className="mt-4">
          Back to Products
        </Button>
      </div>
    );
  }

  const status = stockStatus(product.stock);
  const badge = stockBadge[status];
  const price = effectivePrice(product);
  const images = product.images?.length ? product.images : [];

  function handleAddToCart() {
    addItem({
      productId: product!.id,
      name: product!.name,
      price,
      image: images[0],
      stock: product!.stock,
      quantity,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/" className="hover:text-blue-600">Home</Link>
        <span>/</span>
        <Link href="/products" className="hover:text-blue-600">Products</Link>
        {product.category && (
          <>
            <span>/</span>
            <Link href={`/categories/${product.category.slug}`} className="hover:text-blue-600">
              {product.category.name}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-gray-800 font-medium line-clamp-1">{product.name}</span>
      </nav>

      <div className="grid gap-10 md:grid-cols-2">
        {/* Image Gallery */}
        <div>
          <div className="relative mb-3 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 aspect-square">
            {images.length > 0 ? (
              <Image
                src={images[activeImage]}
                alt={product.name}
                fill
                className="object-contain p-4"
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">
                <svg className="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                    activeImage === i ? 'border-blue-600' : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <Image src={img} alt={`${product.name} ${i + 1}`} fill className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div>
          {product.category && (
            <Link
              href={`/categories/${product.category.slug}`}
              className="mb-2 inline-block text-xs font-semibold uppercase tracking-wide text-blue-600 hover:underline"
            >
              {product.category.name}
            </Link>
          )}
          <h1 className="mb-3 text-3xl font-extrabold text-gray-900">{product.name}</h1>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {product.discount > 0 && (
              <Badge variant="red">-{product.discount}% OFF</Badge>
            )}
            {product.boostScore && product.boostScore > 0 ? (
              <Badge variant="blue">🔥 Hot Deal</Badge>
            ) : null}
          </div>

          {/* Scarcity indicator */}
          {status === 'low_stock' && product.stock > 0 && (
            <p className="mb-3 text-sm font-semibold text-red-600">
              ⚠ Only {product.stock} left in stock — order soon!
            </p>
          )}

          {/* Discount countdown */}
          {product.discount > 0 && product.discountEndsAt && new Date(product.discountEndsAt) > new Date() && (
            <div className="mb-4">
              <CountdownTimer endsAt={product.discountEndsAt} label="Discount ends in" />
            </div>
          )}

          {/* Price */}
          <div className="mb-6 flex items-baseline gap-3">
            <span className="text-3xl font-bold text-gray-900">
              KSh {price.toLocaleString('en-KE', { minimumFractionDigits: 0 })}
            </span>
            {product.discount > 0 && (
              <span className="text-xl text-gray-400 line-through">
                KSh {product.price.toLocaleString('en-KE', { minimumFractionDigits: 0 })}
              </span>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <div
              className="mb-6 prose prose-sm max-w-none text-gray-600"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(product.description),
              }}
            />
          )}

          {/* Quantity + Add to Cart */}
          {status !== 'out_of_stock' && (
            <div className="mb-4 flex items-center gap-3">
              <div className="flex items-center rounded-lg border border-gray-300 bg-white overflow-hidden">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-3 py-2 text-gray-600 hover:bg-gray-100 transition"
                >
                  −
                </button>
                <span className="w-10 text-center text-sm font-semibold">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(product!.stock, q + 1))}
                  className="px-3 py-2 text-gray-600 hover:bg-gray-100 transition"
                >
                  +
                </button>
              </div>
              <span className="text-xs text-gray-500">{product.stock} available</span>
            </div>
          )}

          {added && (
            <Alert variant="success" className="mb-3">
              Added to cart!
            </Alert>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={handleAddToCart}
              disabled={status === 'out_of_stock'}
              size="lg"
              className="flex-1"
            >
              {status === 'out_of_stock' ? 'Out of Stock' : 'Add to Cart'}
            </Button>
            <Button
              onClick={() => {
                handleAddToCart();
                router.push('/checkout');
              }}
              disabled={status === 'out_of_stock'}
              variant="secondary"
              size="lg"
              className="flex-1"
            >
              Buy Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
