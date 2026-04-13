import Link from "next/link";

const productHighlights = [
  "Create link QR codes",
  "Download PNG and SVG files",
  "Manage codes from the dashboard",
  "Track scans and daily analytics"
];

export default function HomePage() {
  return (
    <main className="grid">
      <section className="hero">
        <div className="card">
          <span className="badge">QRFlow</span>
          <h1 className="h1">Create, manage, and track QR codes from one dashboard.</h1>
          <p className="muted">
            Build a real link QR, download the assets you need, and review scan
            activity without leaving the product.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <Link className="button" href="/generator">
              Create a QR
            </Link>
            <Link className="button secondary" href="/dashboard">
              Open dashboard
            </Link>
          </div>
        </div>

        <div className="card">
          <h2 className="h2">What is ready now</h2>
          <div className="stack-sm">
            {productHighlights.map((item) => (
              <div className="inline-stat" key={item}>
                <span>{item}</span>
                <strong>Ready</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
