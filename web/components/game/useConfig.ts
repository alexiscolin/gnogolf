"use client";

// What the page's address asks of the game, read once.
import { useEffect, useState } from "react";
import { camlog } from "@/lib/testhooks";
import { isHoleId, isAddress } from "@/lib/chain";
import { register } from "@/lib/analytics";
import { SHOP } from "@/lib/gnomes/door";
import { endpoints } from "@/lib/builder/holes";
import type { ShopView } from "@/components/gnomes/Shop";

// The test hooks answer in a dev build, or on a page opened with ?camlog. ?won answers in a dev build only.
export const DEV = process.env.NODE_ENV !== "production";
// the shot clip on the win card: NEXT_PUBLIC_CLIPS=1, or ?clips in a dev build
const CLIPS = process.env.NEXT_PUBLIC_CLIPS === "1";

/** The game's config, from the query string. A public production build keeps its own node. */
export interface Config {
  rpc: string;
  web: string;
  hole: string;
  cup: string;
  place: number;
  gnome: string;
  screen: "" | "modes" | "rival" | "worlds" | "community" | "pick" | "shop";
  /** the shop's own address: /g/, /g/<id>/, ?who= */
  shop: ShopView;
  shot: string;
  play: boolean;
  demo: string;
  weather: string;
  world: string;
  won: number;
  clips: boolean;
  /** a collection gnome's traits to play as, and for every rival's ghost: test hooks only */
  traits: string;
  rivalTraits: string;
}
export function useConfig() {
  const [cfg, setCfg] = useState<Config | null>(null);
  useEffect(() => {
    const p0 = new URLSearchParams(window.location.search);
    const hooks = DEV || camlog();
    const TEST = ["shot", "play", "demo", "weather", "world", "won", "traits", "rivaltraits"];
    const p = new URLSearchParams([...p0].filter(([k]) => (hooks || !TEST.includes(k)) && (DEV || k !== "won")));
    // a hole's own page: /h/garden-3/ its slot, /h/garden/ its cup; a ?hole= or ?cup= wins
    const [, pw, pn] = /^\/h\/([a-z]{2,16})(?:-(\d{1,3}))?\/?$/.exec(window.location.pathname) || [];
    // how the visit came; by= and friend= never leave the page: they hold an address
    const src = p0.get("src") || ""; // where the link was shared from: registered now, as the address bar may drop it
    register({ src: ["hole", "cup", "board", "duel"].includes(src) ? src : null, entry: p0.has("by") ? (p0.has("hole") || pn ? "dare_hole" : "dare_course") : p0.has("friend") ? "friend" : p0.has("hole") || pn ? "hole" : p0.has("cup") || pw ? "cup" : p0.has("screen") ? "screen" : "home" });
    if (pw && !p.has("hole") && !p.has("cup")) p.set(pn ? "hole" : "cup", pn ? `${pw}/${pn}` : pw);
    // the shop's pages: /g/ its gallery, /g/<id>/ a gnome, /g/<kind>/ an earned one
    const [, gp] = SHOP ? /^\/g(?:\/([a-z0-9]{1,16}))?\/?$/.exec(window.location.pathname) || [] : [];
    const onShop = SHOP && /^\/g(\/|$)/.test(window.location.pathname);
    const { rpc, web } = endpoints(window.location.search);
    setCfg({
      rpc,
      web,
      // ?cup=island&hole=3 is a place in a cup; ?hole=garden/7/v2 an id, ?hole=garden/7 a slot's current version
      hole: isHoleId(p.get("hole") || "") ? p.get("hole") || "" : "",
      cup: /^[a-z]{2,16}$/.test(p.get("cup") || "") ? p.get("cup") || "" : "",
      place: /^\d{1,3}$/.test(p.get("hole") || "") ? Number(p.get("hole")) : 0,
      gnome: /^[a-z]{2,16}$/.test(p.get("gnome") || "") ? p.get("gnome") || "" : "",
      // ?screen=cups opens the cups; ?screen=pick a cup hole's picker, not its play
      screen: onShop ? "shop" : p.get("screen") === "rival" ? "rival" : p.get("screen") === "modes" ? "modes" : p.get("screen") === "cups" ? "worlds" : p.get("screen") === "community" ? "community" : p.get("screen") === "pick" ? "pick" : "",
      shop: { open: gp || undefined, who: isAddress(p.get("who")) ? p.get("who") || undefined : undefined },
      shot: p.get("shot") || "",
      // ?play skips the title screen, for screenshots and smoke tests
      play: p.has("play") || p.has("shot"),
      // ?demo=angle,power;angle,power… plays those shots once the game starts
      demo: p.get("demo") || "",
      // ?weather=wind,rain,fog,storm shows the forecast without the chain
      weather: p.get("weather") || "",
      // ?world=island|town dresses the hole in that world's look
      world: p.get("world") || "",
      won: Number(p.get("won")) || 0,
      clips: CLIPS || (DEV && p0.has("clips")),
      // ?traits=<hex> plays as a collection gnome, ?rivaltraits=<hex> dresses every rival's ghost in one
      traits: /^(?:[0-9a-f]{2}){1,64}$/.test(p.get("traits") || "") ? p.get("traits") || "" : "",
      rivalTraits: /^(?:[0-9a-f]{2}){1,64}$/.test(p.get("rivaltraits") || "") ? p.get("rivaltraits") || "" : "",
    });
  }, []);
  return cfg;
}
