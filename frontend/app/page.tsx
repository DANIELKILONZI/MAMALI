import Link from 'next/link';
import Image from 'next/image';
import { api, Advertisement, Product } from '@/lib/api';
import { ProductGrid } from '@/components/products/ProductGrid';
import { RotatingBanner } from '@/components/ui/RotatingBanner';

export const revalidate = 60;

async function getData() {
  const [featuredRes, categoriesRes, adsRes] = await Promise.allSettled([
    api.products.list({ featured: true, limit: 8 }),
    api.categories.list(),
    api.advertisements.getByPlacement('HOMEPAGE'),
  ]);

  return {
    featured: featuredRes.status === 'fulfilled' ? featuredRes.value.products : [] as Product[],
    categories: categoriesRes.status === 'fulfilled' ? categoriesRes.value.categories : [],
    ads: adsRes.status === 'fulfilled' ? adsRes.value.advertisements : [] as Advertisement[],
  };
}

export default async function HomePage() {
  const { featured, categories, ads } = await getData();
  const heroBanners = ads.filter((a) => a.type === 'BANNER');
  const promoAds = ads.filter((a) => a.type === 'PROMOTION');

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Hero */}
      <section className="mb-12 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <RotatingBanner banners={heroBanners} />
      </section>

      {/* Promo Banners */}
      {promoAds.length > 0 && (
        <section className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {promoAds.slice(0, 3).map((ad) => (
            <div
              key={ad.id}
              className="relative overflow-hidden rounded-xl bg-gradient-to-br from-green-500 to-green-700 p-6 text-white shadow"
            >
              {ad.imageUrl && (
                <div className="absolute inset-0">
                  <Image src={ad.imageUrl} alt={ad.title} fill className="object-cover opacity-20" />
                </div>
              )}
              <div className="relative">
                <h3 className="text-lg font-bold">{ad.title}</h3>
                {ad.content && <p className="mt-1 text-sm text-green-100">{ad.content}</p>}
                {ad.linkUrl && (
                  <Link href={ad.linkUrl} className="mt-3 inline-block text-sm font-semibold underline">
                    Learn More
                  </Link>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <section className="mb-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Shop by Category</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {categories.slice(0, 10).map((cat) => (
              <Link
                key={cat.id}
                href={`/categories/${cat.slug}`}
                className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
              >
                {cat.name}
                {cat._count.products > 0 && (
                  <span className="ml-1.5 text-xs text-blue-400">({cat._count.products})</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Products */}
      <section>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Featured Products</h2>
          <Link href="/products" className="text-sm font-medium text-blue-600 hover:underline">
            View all →
          </Link>
        </div>
        <ProductGrid
          products={featured}
          emptyMessage="No featured products yet. Check back soon!"
        />
      </section>
    </div>
  );
}
