import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "tradins | Multi-Agent Stock Analysis",
  description: "Next.js + Vercel multi-agent stock analysis dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
