const rows = [
  { slug: "a8x4r2", type: "link", status: "active", scans: 3401, lastScan: "2026-04-11 19:22" },
  { slug: "menu88", type: "menu", status: "active", scans: 908, lastScan: "2026-04-12 08:09" },
  { slug: "promo7", type: "file", status: "inactive", scans: 0, lastScan: "—" }
];

export default function DashboardPage() {
  return (
    <main className="grid">
      <section className="card">
        <h1 className="h2">Dashboard shell</h1>
        <p className="muted">
          The API slice for auth, QR CRUD, and scan routing is now live. This screen is
          still a shell and should be wired to bearer-authenticated requests in the next pass.
        </p>
      </section>

      <section className="hero">
        <div className="card">
          <h2 className="h2">My QR codes</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Slug</th>
                <th>Type</th>
                <th>Status</th>
                <th>Scans</th>
                <th>Last scan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.slug}>
                  <td>{row.slug}</td>
                  <td>{row.type}</td>
                  <td>{row.status}</td>
                  <td>{row.scans}</td>
                  <td>{row.lastScan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 className="h2">Analytics cards</h2>
          <div className="grid">
            <div className="card"><div className="muted">7d scans</div><div className="h2">4,309</div></div>
            <div className="card"><div className="muted">Unique scanners</div><div className="h2">2,118</div></div>
            <div className="card"><div className="muted">Top country</div><div className="h2">UZ</div></div>
            <div className="card"><div className="muted">Alerts</div><div className="h2">2 rules</div></div>
          </div>
        </div>
      </section>
    </main>
  );
}
