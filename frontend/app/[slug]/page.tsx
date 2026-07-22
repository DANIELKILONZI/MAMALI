import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import { SafeHtml } from '@/components/ui/SafeHtml';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getPage(slug: string) {
  try {
    const res = await api.content.getPage(slug);
    return res.page;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return {};
  return {
    title: `${page.title} — MAMALI`,
    description: page.title,
  };
}

export default async function ContentPage({ params }: PageProps) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="mb-8 text-3xl font-bold text-gray-900">{page.title}</h1>
      <SafeHtml
        html={page.content}
        className="prose prose-blue max-w-none text-gray-700 [&_a]:text-blue-600 [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6"
      />
    </div>
  );
}
