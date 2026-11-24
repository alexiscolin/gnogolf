import type { Metadata } from "next";
import { buttonClass } from "@/components/button";

// canonical null: the 404 must not be taken for the home page the layout describes
export const metadata: Metadata = { title: "No such page · Gnogolf", robots: { index: false }, alternates: { canonical: null } };

export default function NotFound() {
  return (
    <main className="banner" aria-labelledby="lost-title">
      <div className="banner__in">
        <h2 id="lost-title">No such page</h2>
        <p>This ball rolled off the course.</p>
        <div className="banner__row">
          <a className={buttonClass({ variant: "primary" })} href="/">Play Gnogolf</a>
        </div>
      </div>
    </main>
  );
}
