import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mangalore Transit Viz",
  description: "High-performance transit engine analyzing direct and transfer routes across Mangalore.",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#09090b",
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-zinc-950 text-zinc-50`}>
        {children}
      </body>
    </html>
  );
}
