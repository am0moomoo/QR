import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QR Platform Starter",
  description: "Codex-ready starter repo for a dynamic QR platform"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <header className="nav">
            <Link href="/" className="badge">QR Platform Starter</Link>
            <nav className="nav-links">
              <Link href="/generator">Generator</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/api-docs" className="button secondary">API</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
