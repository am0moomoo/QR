import Link from "next/link";

const productHighlights = [
  "Create a QR and save it straight to the dashboard",
  "Download PNG and SVG assets without leaving the product",
  "Track live scans, status, and billing from one account",
  "Handle plan limits and upgrades before they interrupt work"
];

export default function HomePage() {
  return (
    <main className="grid">
      <section className="hero">
        <div className="card">
          <span className="badge">QRFlow</span>
          <h1 className="h1">Create, manage, and support QR codes from one product.</h1>
          <p className="muted">
            Create a real link QR, download production-ready assets, review scans, and manage plan limits without leaving the workflow.
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
          <h2 className="h2">Core workflow</h2>
          <div className="stack-sm">
            {productHighlights.map((item) => (
              <div className="inline-stat" key={item}>
                <span>{item}</span>
                <strong>Live</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
