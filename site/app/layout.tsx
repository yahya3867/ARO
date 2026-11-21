import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://tryaro.app"),
  title: "aro: autonomous resource operations",
  description: "Autonomous resource operations for communities",
  openGraph: {
    title: "aro: autonomous resource operations",
    description: "Autonomous resource operations for communities",
    url: "/",
    siteName: "aro",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  colorScheme: "only light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable + " " + GeistMono.variable + " h-full antialiased"}>
      <head>
        <meta name="darkreader-lock" />
      </head>
      <body className="h-full overflow-hidden font-sans">{children}</body>
    </html>
  );
}
