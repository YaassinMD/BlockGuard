import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "BlockGuard - Fake Product Identification Using Blockchain",
  description: "Check product registration records and hash-linked ledger integrity with BlockGuard.",
  keywords: ["blockchain", "product verification", "anti-counterfeit", "fake product detection", "supply chain", "authentication"],
  authors: [{ name: "BlockGuard Team" }],
  icons: {
    icon: "/logo-blockguard.png",
  },
  openGraph: {
    title: "BlockGuard - Fake Product Identification Using Blockchain",
    description: "Check product records against the BlockGuard application ledger.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster />
        <SonnerToaster richColors position="top-right" />
      </body>
    </html>
  );
}
