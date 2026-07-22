import type { Metadata } from "next";
import "./globals.css";
import { api, Category, StoreSettings } from "@/lib/api";
import { CartProvider } from "@/context/CartContext";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const revalidate = 300;

async function getChrome(): Promise<{ settings: StoreSettings | null; categories: Category[] }> {
  const [settingsRes, categoriesRes] = await Promise.allSettled([
    api.settings.get(),
    api.categories.list(),
  ]);
  return {
    settings: settingsRes.status === 'fulfilled' ? settingsRes.value.settings : null,
    categories: categoriesRes.status === 'fulfilled' ? categoriesRes.value.categories : [],
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getChrome();
  const name = settings?.businessName || "MAMALI";
  return {
    title: `${name} – Digital Commerce`,
    description: `Shop the best products at ${name}, Kenya's digital commerce platform.`,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { settings, categories } = await getChrome();
  const businessName = settings?.businessName || "MAMALI";

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900 font-sans">
        <CartProvider>
          <Header
            businessName={businessName}
            logoUrl={settings?.logoUrl ?? null}
            categories={categories}
          />
          <main className="flex-1">{children}</main>
          <Footer businessName={businessName} />
        </CartProvider>
      </body>
    </html>
  );
}
