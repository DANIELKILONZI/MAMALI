import Link from 'next/link';
import Image from 'next/image';
import { api, Advertisement, HomepageSection, Product } from '@/lib/api';
import { ProductGrid } from '@/components/products/ProductGrid';
import { RotatingBanner } from '@/components/ui/RotatingBanner';

export const revalidate = 60;

/** Fallback when the homepage CMS has no active sections. */
const DEFAULT_SECTIONS: Pick<HomepageSection, 'type' | 'title'>[] = [
  { type: 'HERO', title: undefined },
  { type: 'PROMOTIONS', title: undefined },
  { type: 'CATEGORIES', title: 'Shop by Category' },
  { type: 'FEATURED_PRODUCTS', title: 'Featured Products' },
];

function sectionKey(section: Pick<HomepageSection, 'type'> & { id?: string }): string {
  return section.id ?? section.type;
}

async function getData() {
  const [featuredRes, categoriesRes, adsRes, sectionsRes] = await Promise.allSettled([
    api.products.list({ featured: true, limit: 8 }),
    api.categories.list(),
    api.advertisements.getByPlacement('HOMEPAGE'),
    api.homepage.getSections(),
  ]);

  return {
    featured: featuredRes.status === 'fulfilled' ? featuredRes.value.products : [] as Product[],
    categories: categoriesRes.status === 'fulfilled' ? categoriesRes.value.categories : [],
    ads: adsRes.status === 'fulfilled' ? adsRes.value.advertisements : [] as Advertisement[],
    sections: sectionsRes.status === 'fulfilled' ? sectionsRes.value.sections : [] as HomepageSection[],
  };
}

export default async function HomePage() {
  const { featured, categories, ads, sections } = await getData();
  const heroBanners = ads.filter((a) => a.type === 'BANNER');
  const promoAds = ads.filter((a) => a.type === 'PROMOTION');

  // Admin-managed section order and visibility; fall back to the default
  // layout when the CMS has nothing active. Categories always render unless
  // the CMS explicitly manages a CATEGORIES section.
  const active = sections
    .filter((s) => s.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const layout = active.length > 0 ? active : DEFAULT_SECTIONS;
  const cmsManagesCategories = active.some((s) => s.type === 'CATEGORIES');

  const blocks = layout.map((section) => {
    switch (section.type) {
      case 'HERO':
        return (
          <section
            key={sectionKey(section)}
            className="mb-12 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg"
          >
            <RotatingBanner banners={heroBanners} />
          </section>
        );

      case 'PROMOTIONS':
        if (promoAds.length === 0) return null;
        return (
          <section key={sectionKey(section)} className="mb-12">
            {section.title && (
              <h2 className="mb-6 text-2xl font-bold text-gray-900">{section.title}</h2>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            </div>
          </section>
        );

      case 'CATEGORIES':
        if (categories.length === 0) return null;
        return (
          <section key={sectionKey(section)} className="mb-12">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">{section.title || 'Shop by Category'}</h2>
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
        );

      case 'FEATURED_PRODUCTS':
        return (
          <section key={sectionKey(section)} className="mb-12">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">{section.title || 'Featured Products'}</h2>
              <Link href="/products" className="text-sm font-medium text-blue-600 hover:underline">
                View all →
              </Link>
            </div>
            <ProductGrid
              products={featured}
              emptyMessage="No featured products yet. Check back soon!"
            />
          </section>
        );

      default:
        // Unknown section types are ignored so a typo in the CMS
        // never breaks the storefront.
        return null;
    }
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {blocks}

      {/* Categories fallback when CMS doesn't manage them explicitly */}
      {active.length > 0 && !cmsManagesCategories && categories.length > 0 && (
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
    </div>
  );
}
