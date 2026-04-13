import type { Route } from "next";
import Link from "next/link";
import type { DashboardSection } from "./dashboard-types";

export function DashboardNavigation({
  section
}: {
  section: DashboardSection;
}) {
  return (
    <nav className="dashboard-nav">
      <Link
        className="dashboard-nav-link"
        href={"/generator" as Route}
      >
        Create QR
      </Link>
      <Link
        className={section === "list" ? "dashboard-nav-link active" : "dashboard-nav-link"}
        href="/dashboard"
      >
        QR list
      </Link>
      <Link
        className={section === "analytics" ? "dashboard-nav-link active" : "dashboard-nav-link"}
        href={"/dashboard/analytics" as Route}
      >
        Analytics
      </Link>
      <Link
        className={section === "settings" ? "dashboard-nav-link active" : "dashboard-nav-link"}
        href={"/dashboard/settings" as Route}
      >
        Profile & settings
      </Link>
    </nav>
  );
}
