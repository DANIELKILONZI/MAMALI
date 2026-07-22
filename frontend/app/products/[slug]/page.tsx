import type { Metadata } from 'next';
import { api, Product, effectivePrice } from '@/lib/api';
import ProductDetailClient from './ProductDetailClient';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getProduct(slug: string): Promise<Product | null> {
  try {
    const res = await api.products.get(slug);
    return res.product;
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: 'Product not found — MAMALI' };

  const description = product.description
    ? stripHtml(product.description).slice(0, 160)
    : `Buy ${product.name} for KSh ${effectivePrice(product).toLocaleString('en-KE')} on MAMALI.`;

  return {
    title: `${product.name} — MAMALI`,
    description,
    openGraph: {
      title: product.name,
      description,
      type: 'website',
      images: product.images?.length ? [{ url: product.images[0] }] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProduct(slug);
  return <ProductDetailClient initialProduct={product} />;
}
