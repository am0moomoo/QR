export default function ApiDocsPage() {
  return (
    <main className="card">
      <h1 className="h2">API reference</h1>
      <p className="muted">
        Swagger UI is served by the API app at <code>http://localhost:4000/api/reference</code>.
        The current spec and controllers cover auth, QR CRUD, billing plans, and the public scan flow.
      </p>
    </main>
  );
}
