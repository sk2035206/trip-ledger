import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? "https://jcxxy.cn/ledger/");
const shareTitle = "旅行分账";
const shareDescription = "用于多人旅行公共费用、出行费用、个人费用和成员自付扣减核算的 H5 分账工具。";
const shareImage = new URL("/api/share-card.png", siteUrl).toString();

function normalizeSiteUrl(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: shareTitle,
  description: shareDescription,
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: shareTitle,
    description: shareDescription,
    url: siteUrl,
    siteName: shareTitle,
    type: "website",
    locale: "zh_CN",
    images: [
      {
        url: shareImage,
        width: 1200,
        height: 630,
        alt: "旅行分账账单工具",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: shareTitle,
    description: shareDescription,
    images: [shareImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
