"use client";

// What the page's address asks of the game, read once: the node, the hole or the cup, the gnome, the screen to open
// on, the shop's view, and the test hooks.
import { useEffect, useState } from "react";
import { camlog } from "@/lib/testhooks";
import { isHoleId, isAddress } from "@/lib/chain";
import { register } from "@/lib/analytics";
import { SHOP } from "@/lib/gnomes/door";
import { endpoints } from "@/lib/builder/holes";
import type { ShopView } from "@/components/gnomes/Shop";

// The test hooks (?play, ?shot, ?demo, ?weather, ?world, ?promo) answer in a
// dev build, or on a page opened with ?camlog where the hooks answer
// (lib/testhooks.ts); ?won, a win card for a round nobody played, in a dev
// build only.
export const DEV = process.env.NODE_ENV !== "production";
// the shot clip in the hole-finished card: NEXT_PUBLIC_CLIPS=1, or ?clips in a
// dev build (the flag is read when the dev server starts)
const CLIPS = process.env.NEXT_PUBLIC_CLIPS === "1";

/** Config travels in the query string (a public production build keeps its own node: endpoints). */
export interface Config {
  rpc: string;
  web: string;
  hole: string;
  cup: string;
  place: number;
  gnome: string;
  screen: "" | "modes" | "rival" | "worlds" | "community" | "pick" | "shop";
  /** the shop's own address (/g/, /g/<id>/, ?who=): a gnome open, a player's gnomes */
  shop: ShopView;
  shot: string;
  play: boolean;
  demo: string;
  weather: string;
  world: string;
  won: number;
  clips: boolean;
  /** a collection gnome's traits to play as, and to give every rival's ghost (test hooks only, the shop built: lib/gnomes) */
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
    // a hole's own page (app/h): /h/garden-3/ its slot, /h/garden/ its cup; a ?hole= or ?cup= wins
    const [, pw, pn] = /^\/h\/([a-z]{2,16})(?:-(\d{1,3}))?\/?$/.exec(window.location.pathname) || [];
    // how the visit came (by= and friend= themselves never leave: they hold an address)
    const src = p0.get("src") || ""; // (where the link was shared from: kept with every event, the address bar may drop it)
    register({ src: ["hole", "cup", "board", "duel"].includes(src) ? src : null, entry: p0.has("by") ? (p0.has("hole") || pn ? "dare_hole" : "dare_course") : p0.has("friend") ? "friend" : p0.has("hole") || pn ? "hole" : p0.has("cup") || pw ? "cup" : p0.has("screen") ? "screen" : "home" });
    if (pw && !p.has("hole") && !p.has("cup")) p.set(pn ? "hole" : "cup", pn ? `${pw}/${pn}` : pw);
    // the shop's pages (app/g): /g/ its gallery, /g/<id>/ a gnome, /g/<kind>/ an earned one; ?who= a player's gnomes
    const [, gp] = SHOP ? /^\/g(?:\/([a-z0-9]{1,16}))?\/?$/.exec(window.location.pathname) || [] : [];
    const onShop = SHOP && /^\/g(\/|$)/.test(window.location.pathname);
    const { rpc, web } = endpoints(window.location.search);
    setCfg({
      rpc,
      web,
      // a link to a hole: ?cup=island&hole=3 (its place in the cup), or its
      // id (?hole=garden/7/v2, a slot's current version ?hole=garden/7, a
      // community or realm hole's id); &gnome= the sharer's gnome
      hole: isHoleId(p.get("hole") || "") ? p.get("hole") || "" : "",
      cup: /^[a-z]{2,16}$/.test(p.get("cup") || "") ? p.get("cup") || "" : "",
      place: /^\d{1,3}$/.test(p.get("hole") || "") ? Number(p.get("hole")) : 0,
      gnome: /^[a-z]{2,16}$/.test(p.get("gnome") || "") ? p.get("gnome") || "" : "",
      // ?screen=modes, ?screen=rival, ?screen=cups, ?screen=community: the game's choice, a duel's rival, the cups, the
      // community's holes (a reload stays there); ?screen=pick: a cup hole's picker, not its play
      screen: onShop ? "shop" : p.get("screen") === "rival" ? "rival" : p.get("screen") === "modes" ? "modes" : p.get("screen") === "cups" ? "worlds" : p.get("screen") === "community" ? "community" : p.get("screen") === "pick" ? "pick" : "",
      shop: { open: gp || undefined, who: isAddress(p.get("who")) ? p.get("who") || undefined : undefined },
      shot: p.get("shot") || "",
      // ?play skips the title screen — for screenshots and smoke tests
      play: p.has("play") || p.has("shot"),
      // ?demo=angle,power;angle,power… plays those shots once the game starts
      demo: p.get("demo") || "",
      // ?weather=wind,rain,fog,storm shows the forecast HUD without the chain — for screenshots
      weather: p.get("weather") || "",
      // ?world=island|town dresses the hole in that world's look — for building one
      world: p.get("world") || "",
      won: Number(p.get("won")) || 0,
      clips: CLIPS || (DEV && p0.has("clips")),
      // ?traits=<hex> plays as a collection gnome, ?rivaltraits=<hex> dresses every rival's ghost in one
      // (a token's traits, lib/gnomes/codec.ts) — to see one in play before it is for sale
      traits: /^(?:[0-9a-f]{2}){1,64}$/.test(p.get("traits") || "") ? p.get("traits") || "" : "",
      rivalTraits: /^(?:[0-9a-f]{2}){1,64}$/.test(p.get("rivaltraits") || "") ? p.get("rivaltraits") || "" : "",
    });
  }, []);
  return cfg;
}
