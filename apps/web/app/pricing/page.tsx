import Link from "next/link";

const plans = [
  {
    cta: "Start free",
    features: ["3 QR codes", "Basic analytics", "Deterministic billing test mode", "Core QR generation"],
    name: "Free",
    summary: "Best for trying the product and running a small QR set."
  },
  {
    cta: "Upgrade to Lite",
    features: ["More QR capacity", "More storage", "Reduced ads on scan flow", "Longer analytics retention"],
    name: "Lite",
    summary: "Best for small teams that need more headroom without a custom contract."
  },
  {
    cta: "Upgrade to Premium",
    features: ["Higher QR and storage limits", "Ads control", "API access", "Custom domains"],
    name: "Premium",
    summary: "Best for operators who need branded routing, billing controls, and advanced limits."
  }
];

export default function PricingPage() {
  return (
    <main className="stack-xl">
      <section className="card">
        <span className="badge">Plans</span>
        <h1 className="h2">Choose the QRFlow plan that fits your volume</h1>
        <p className="muted">
          The product supports Free, Lite, and Premium plans today. Upgrade and invoice history live inside the dashboard billing page.
        </p>
      </section>

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {plans.map((plan) => (
          <article className="card stack-lg" key={plan.name}>
            <div className="stack-sm">
              <span className="badge">{plan.name}</span>
              <h2 className="h2">{plan.name}</h2>
              <p className="muted">{plan.summary}</p>
            </div>
            <ul className="stack-sm pricing-list">
              {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <Link className="button secondary" href="/dashboard/billing">
              {plan.cta}
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
