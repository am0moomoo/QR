import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QRFlow",
  description: "Create QR codes, download assets, and review scan analytics."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <header className="nav">
            <Link href="/" className="badge">QRFlow</Link>
            <nav className="nav-links">
              <Link href="/">Home</Link>
              <Link href="/generator">Generator</Link>
              <Link href="/dashboard">Dashboard</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
