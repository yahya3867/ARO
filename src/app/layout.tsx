import { Toaster } from "@/components/ui/sonner";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./base.css";
import "./workspace.css";
export const metadata: Metadata = {
  title: "aro",
  description: "Essential resources. Autonomously coordinated.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable + " " + GeistMono.variable}>
      <body>{children}<Toaster position="bottom-right" /></body>
    </html>
  );
}
