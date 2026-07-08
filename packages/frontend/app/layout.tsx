import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "__LIVE_DASHBOARD_SITE_TITLE__",
  description: "__LIVE_DASHBOARD_SITE_DESCRIPTION__",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="app-shell">
          {children}
        </div>
      </body>
    </html>
  );
}
