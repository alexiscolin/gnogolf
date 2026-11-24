"use client";

import { useEffect, useRef } from "react";
import { makePreview, type Act, type Skin } from "@/lib/scene/gnome";

/** A gnome turning in its own WebGL canvas. Returns the ref of the box to draw it in. */
export function useGnomeStage<T extends HTMLElement = HTMLDivElement>(skin: Skin, { act = "hop", playing = true }: { act?: Act; playing?: boolean } = {}) {
  const box = useRef<T>(null);
  const preview = useRef<ReturnType<typeof makePreview> | null>(null);
  useEffect(() => {
    // A fresh canvas on every mount: a released WebGL context cannot be taken again on the same element.
    const el = document.createElement("canvas");
    el.className = "pick__canvas"; // sizing only; the locked look is the wrapper's CSS filter
    box.current!.appendChild(el);
    let p: ReturnType<typeof makePreview>;
    try { p = preview.current = makePreview(el, { act, still: !playing }); } catch { return () => el.remove(); } // no WebGL to spare: no stage
    const onResize = () => p.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      p.destroy();
      el.remove();
    };
  }, [act]); // eslint-disable-line react-hooks/exhaustive-deps -- playing has its own effect below
  useEffect(() => {
    preview.current && preview.current.show(skin);
  }, [skin]);
  useEffect(() => {
    preview.current && preview.current.play(playing);
  }, [playing]);
  return box;
}
