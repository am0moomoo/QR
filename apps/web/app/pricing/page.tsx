const plans = [
  { name: "free", features: ["Ads on scan flow", "Basic analytics", "Core QR generation"] },
  { name: "lite", features: ["Reduced ads", "Longer analytics retention", "Folders and shares"] },
  { name: "premium", features: ["No ads", "API access", "White-label domains", "Advanced analytics"] }
];

export default function PricingPage() {
  return (
    <main className="card">
      <h1 className="h2">Pricing shell</h1>
      <p className="muted">
        Replace with a real billing table connected to Stripe price IDs and feature flags.
      </p>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", marginTop: 20 }}>
        {plans.map((plan) => (
          <div className="card" key={plan.name}>
            <span className="badge">{plan.name}</span>
            <ul>
              {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
