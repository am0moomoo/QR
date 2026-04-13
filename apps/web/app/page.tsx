import Link from "next/link";

const featureCards = [
  "Dynamic QR with editable targets",
  "Analytics with scan events and aggregates",
  "Folders, sharing, and workspaces",
  "White-label domains and branded landing pages",
  "Bulk import, API, and webhooks",
  "Billing, quotas, anti-abuse, and auditability"
];

export default function HomePage() {
  return (
    <main className="grid">
      <section className="hero">
        <div className="card">
          <span className="badge">Clean-room analogue, not a clone</span>
          <h1 className="h1">Build a serious QR platform without guessing the architecture.</h1>
          <p className="muted">
            This starter repo is prepared for Codex and follows the uploaded analysis:
            separate scan edge from CRUD, keep typed QR payloads, and treat analytics,
            billing, security, and rendering as first-class modules.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <Link href="/generator" className="button">Open generator</Link>
            <Link href="/dashboard" className="button secondary">Open dashboard shell</Link>
          </div>

          <div className="section kpis">
            <div className="card"><div className="muted">Target QR types</div><div className="h2">15 → 47</div></div>
            <div className="card"><div className="muted">Export formats</div><div className="h2">PNG SVG PDF</div></div>
            <div className="card"><div className="muted">Core plans</div><div className="h2">free lite premium</div></div>
            <div className="card"><div className="muted">Latency target</div><div className="h2">&lt;200ms p95</div></div>
          </div>
        </div>

        <div className="card">
          <div className="preview-box">
            <div className="qr-mock" />
          </div>
          <div className="section">
            <div className="muted">Repo state</div>
            <h2 className="h2">First backend slice live</h2>
            <p className="muted">
              Auth, QR CRUD, OpenAPI-aligned API routes, and the public scan flow are now
              implemented in the API app. The next pass should extend the web shell with
              authenticated screens that consume those endpoints directly.
            </p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="h2">Included product pillars</h2>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {featureCards.map((item) => (
            <div key={item} className="card">
              <div>{item}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
