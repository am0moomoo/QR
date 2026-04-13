const qrTypes = [
  "link",
  "text",
  "wifi",
  "file",
  "vcard",
  "email",
  "sms",
  "phone",
  "app-store",
  "event",
  "menu",
  "payment"
];

export default function GeneratorPage() {
  return (
    <main className="grid">
      <section className="card">
        <span className="badge">Step 1 of 3</span>
        <h1 className="h2">Choose QR type</h1>
        <p className="muted">
          The backend QR create/update flow is implemented; this shell is ready to be wired
          to the shared schema-driven payloads in the next UI pass.
        </p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          {qrTypes.map((type) => (
            <div key={type} className="card">
              {type}
            </div>
          ))}
        </div>
      </section>

      <section className="hero">
        <div className="card">
          <span className="badge">Step 2 of 3</span>
          <h2 className="h2">Content + design</h2>

          <div className="section">
            <label className="label">Title</label>
            <input className="input" defaultValue="Spring campaign landing QR" />
          </div>
          <div className="section">
            <label className="label">Target URL</label>
            <input className="input" defaultValue="https://example.com/spring" />
          </div>
          <div className="section">
            <label className="label">Foreground color</label>
            <input className="input" defaultValue="#111111" />
          </div>
          <div className="section">
            <label className="label">Background color</label>
            <input className="input" defaultValue="#ffffff" />
          </div>
          <div className="section">
            <label className="label">Error correction</label>
            <select className="select" defaultValue="M">
              <option>L</option>
              <option>M</option>
              <option>Q</option>
              <option>H</option>
            </select>
          </div>
        </div>

        <div className="card">
          <span className="badge">Step 3 of 3</span>
          <h2 className="h2">Preview + download</h2>
          <div className="preview-box">
            <div className="qr-mock" />
          </div>
          <div className="section" style={{ display: "flex", gap: 12 }}>
            <button className="button">Generate PNG</button>
            <button className="button secondary">Generate SVG</button>
          </div>
        </div>
      </section>
    </main>
  );
}
