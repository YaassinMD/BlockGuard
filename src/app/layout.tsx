import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BlockGuard - Fake Product Identification Using Blockchain",
  description: "Leverage blockchain technology to authenticate products, detect counterfeits, and protect consumers. Verify any product instantly with our decentralized verification system.",
  keywords: ["blockchain", "product verification", "anti-counterfeit", "fake product detection", "supply chain", "authentication"],
  authors: [{ name: "BlockGuard Team" }],
  icons: {
    icon: "/logo-blockguard.png",
  },
  openGraph: {
    title: "BlockGuard - Fake Product Identification Using Blockchain",
    description: "Verify products instantly with blockchain-powered authentication",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster richColors position="top-right" />
      </body>
    </html>
  );
}
