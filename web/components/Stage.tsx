"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GNOMES, makePreview, portraitOf, type Skin } from "@/lib/scene/gnome";

const srcOf = (skin: Skin | "ghost") => (skin === "ghost" ? "/portraits/ghost.webp" : portraitOf(skin));

/** A gnome's picture, there at once: no WebGL, a card can show as many as it needs. ghost: a duel's, whoever he is. */
export function Portrait({ skin, className = "" }: { skin: Skin | "ghost"; className?: string }) {
  const src = srcOf(skin);
  // not fetched yet (a link straight past the title): his stage pulses, then he fades in
  const [at, setAt] = useState<"" | "wait" | "late">("");
  const img = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => setAt(img.current!.complete ? "" : "wait"), [src]);
  // (said by the card he is on: the picture adds nothing for a reader)
  return <img ref={img} className={`portrait${src.startsWith("/gnomes/") ? " portrait--thumb" : ""}${at && (at === "wait" ? " portrait--wait" : " late")} ${className}`.trim()} src={src} alt="" width="512" height="512" draggable={false}
    onLoad={() => setAt((was) => (was === "wait" ? "late" : was))} onError={() => setAt("")} />;
}

const warm = new Map<string, HTMLImageElement>(); // (kept: a decoded picture stays decoded)
/** These gnomes' pictures fetched ahead (all the game's by default): a card's are there as its screen opens. Resolves once they are in (one that fails too). */
export function warmPortraits(skins: readonly (Skin | "ghost")[] = ["ghost", ...GNOMES]) {
  return Promise.all(skins.map(srcOf).map((src) => {
    let im = warm.get(src);
    if (!im) warm.set(src, (im = Object.assign(new Image(), { src })));
    return im.decode().catch(() => {});
  }));
}

/** A gnome hopping in its own WebGL canvas, over his Portrait if the box holds one. Returns the ref of the box to draw it in. */
export function useGnomeStage<T extends HTMLElement = HTMLDivElement>(skin: Skin) {
  const box = useRef<T>(null);
  const preview = useRef<ReturnType<typeof makePreview> | null>(null);
  useEffect(() => {
    // A fresh canvas on every mount: a released WebGL context cannot be taken again on the same element.
    const at = box.current!, el = document.createElement("canvas");
    el.className = "pick__canvas"; // sizing only; the locked look is the wrapper's CSS filter
    at.appendChild(el);
    let p: ReturnType<typeof makePreview>;
    try { p = preview.current = makePreview(el); } catch { return () => el.remove(); } // no WebGL to spare: his picture stays
    // his picture goes as the canvas draws its first frame (asked after the preview's own: the same frame)
    const drawn = requestAnimationFrame(() => (at.dataset.live = ""));
    const onResize = () => p.resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(drawn);
      delete at.dataset.live;
      window.removeEventListener("resize", onResize);
      p.destroy();
      el.remove();
    };
  }, []);
  useEffect(() => {
    preview.current && preview.current.show(skin);
  }, [skin]);
  return box;
}
