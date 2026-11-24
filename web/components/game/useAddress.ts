"use client";

// The address bar follows the screen, and the browser's Back and Forward bring a screen, and its hole, back.
import { useEffect, useRef, type RefObject } from "react";
import type { Game } from "@/lib/engine";
import { isHoleId, isAddress } from "@/lib/chain";
import { chainQuery } from "@/lib/links";
import { isScreen, type Screen } from "@/lib/screens";
import type { ShopView } from "@/components/gnomes/Shop";
import type { Config } from "@/components/game/useConfig";

// place, world, idHere: the hole on screen (its place in its cup, 0 in none); dare, solo: the rival, and the duel dropped
// goToRef: the latest way to a hole of the course already built
export function useAddress({ game, cfg, screen, setScreen, place, world, idHere, gnome, dare, solo, shopView, setShopView, setMenu, goToRef }: {
  game: RefObject<Game | null>;
  cfg: Config | null;
  screen: Screen;
  setScreen: (screen: Screen) => void;
  place: number | null;
  world: string | null | undefined;
  idHere: string | null;
  gnome: string;
  dare: string;
  solo: boolean;
  shopView: ShopView;
  setShopView: (view: ShopView) => void;
  setMenu: (open: boolean) => void;
  goToRef: RefObject<(id: string) => void>;
}) {
  // The address bar follows the screen: the title is the bare page, the
  // game's choice, a duel's rival, the cups and the community's holes
  // ?screen=modes, rival, cups and community, the picker ?cup=<world>&gnome=
  // (past the cup's first hole, &hole= and &screen=pick), a hole
  // ?cup=&hole=&gnome=. A new screen is a new
  // history entry (Back returns to the one before); moving within a hole —
  // next hole, another gnome — only rewrites the current one.
  const lastScreen = useRef<Screen | null>(null);
  useEffect(() => {
    if (!cfg) return;
    const q = chainQuery();
    if (screen === "play" && idHere) {
      // a cup's hole by its place; one in no cup (community, archived) by its id
      if (place) (q.set("cup", world || "garden"), q.set("hole", String(place)));
      else q.set("hole", idHere);
      q.set("gnome", gnome);
    } else if (screen === "worlds") q.set("screen", "cups"); // (not ?cup=: that opens the cup)
    else if (screen === "modes" || screen === "rival" || screen === "community") q.set("screen", screen);
    // (an address of its own: a step Back returns from; a dare link's title keeps it, Start goes there)
    else if (screen === "ghosts" || (screen === "title" && dare && !solo)) q.set("by", dare);
    // (the picker of a hole past the cup's first: that hole, marked the picker's, so a reload or a copied link lands on it, not in play)
    else if (screen === "pick" && world) (q.set("cup", world), place && place > 1 && (q.set("hole", String(place)), q.set("screen", "pick")), q.set("gnome", gnome));
    // the shop's pages are its own (app/g): a gnome open at /g/<id>/, a player's gnomes by ?who=
    else if (screen === "shop") shopView.who && q.set("who", shopView.who);
    else if (screen === "play") return; // the hole is not known yet: wait for it
    // a dare stays in the address, with the hole, while it is raced: a reload, a copied link keep it
    if (dare && !solo && idHere && (screen === "play" || screen === "pick")) {
      if (screen === "pick") place ? q.set("hole", String(place)) : (q.delete("cup"), q.set("hole", idHere));
      q.set("by", dare);
    }
    // a hole's own page (/h/…) is left for the game's address once it moves on
    const base = screen === "shop" ? `/g/${shopView.open ? `${shopView.open}/` : ""}` : /^\/[hg]\//.test(window.location.pathname) ? "/" : window.location.pathname;
    const url = base + (String(q) ? `?${q}` : "");
    const here = window.location.pathname + window.location.search;
    // a link to a hole keeps its address while the title shows (the game on its way to it)
    if (screen === "title" && lastScreen.current === null && (cfg.hole || cfg.cup || cfg.screen)) return;
    const moved = lastScreen.current !== null && lastScreen.current !== screen;
    lastScreen.current = screen;
    // (a dare link's title and its ghosts share an address: the ghosts still get their step Back)
    if (url === here && !(moved && screen === "ghosts")) return;
    if (moved) window.history.pushState({ screen }, "", url);
    else window.history.replaceState({ screen }, "", url);
  }, [cfg, screen, place, world, gnome, idHere, dare, solo, shopView]);
  // Back and Forward: back to that screen, and that hole, without reloading the scene
  // (subscribed once: the latest goTo is read through its ref)
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const p = new URLSearchParams(window.location.search);
      const st: unknown = e.state; // a history entry's state: this page's own, or anyone's
      const was = st && typeof st === "object" && "screen" in st && isScreen(st.screen) ? st.screen : null;
      const sc: Screen = was || (p.get("hole") ? "play" : p.get("cup") ? "worlds" : p.get("screen") === "rival" ? "rival" : p.get("screen") === "modes" ? "modes" : p.get("screen") === "cups" ? "worlds" : p.get("screen") === "community" ? "community" : "title");
      // the shop's address says what it showed
      if (sc === "shop") setShopView({ open: (/^\/g\/([a-z0-9]{1,16})\/?$/.exec(window.location.pathname) || [])[1], who: isAddress(p.get("who")) ? p.get("who") || undefined : undefined });
      lastScreen.current = sc; // arriving here is not a new step
      setMenu(false);
      setScreen(sc);
      if (sc === "play" && game.current) {
        const cup = p.get("cup") || "", hv = p.get("hole") || "";
        const h = game.current.find(isHoleId(hv) ? { id: hv } : { cup, n: Number(hv) });
        if (h && h !== game.current.current()) goToRef.current(h);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [game, goToRef, setMenu, setScreen, setShopView]);
}
