import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Linkify Growth OS – Kundenakquise, Audits & KI-Steuerung",
  description:
    "Internes Browser-System für Linkify: lokale Kundensuche, Website-Audits, OpenRouter-Budgetsteuerung und persönliche Akquise.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={figtree.variable}>
      <body className="min-h-screen bg-white text-[#1A1A2E] antialiased">
        {children}
      </body>
    </html>
  );
}
