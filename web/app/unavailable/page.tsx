import type { Metadata } from "next";
import { buttonClass } from "@/components/button";
import { SHOP } from "@/lib/gnomes/shop";

// Shown where the shop is not offered (netlify.toml's country rules). Shop off, it never names the shop.
export const metadata: Metadata = { title: "Not available in your region · Gnogolf", robots: { index: false }, alternates: { canonical: null } };

export default function Unavailable() {
  return (
    <main className="banner" aria-labelledby="away-title">
      <div className="banner__in">
        <h2 id="away-title">{SHOP ? "The gnome shop is not available in your region" : "This page is not available in your region"}</h2>
        <p>The game itself is free to play, here as everywhere.</p>
        <div className="banner__row">
          <a className={buttonClass({ variant: "primary" })} href="/">Play Gnogolf</a>
        </div>
      </div>
    </main>
  );
}
