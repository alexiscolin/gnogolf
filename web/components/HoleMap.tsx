// Flat SVG, no WebGL: a screen can show as many as it needs.
import { useEffect, useId, useState } from "react";
import type { Chain } from "@/lib/chain";
import { Frame } from "@/components/ui";
import { mapFit, mapView, mapZone, pathD, railRuns, type MapHole, type MapKind } from "@/lib/duel";
import { BALL_R, cupRadius, inSea } from "@/lib/terrain";
import type { Vec2, Zone } from "@/lib/types";

/** A hole from above in a round window, in its cup's colours. path: a ghost's path, drawn over it. */
export function HoleMap({ hole, path = [], className = "rival__map" }: { hole: MapHole; path?: readonly Vec2[]; className?: string }) {
  const lane = useId(), { at, k } = mapView(mapFit(hole, path), hole), line = pathD(path, at);
  const [cx, cy] = at(hole.cup), [tx, ty] = at(hole.start);
  // the mines' board frame, out in the void, is the chain's and not drawn
  const rails = (moving: boolean) => railRuns(hole.walls.filter((w) => !!w.every === moving && !(hole.world === "mines" && inSea(w, hole.zones))));
  const [still, gates] = [rails(false), rails(true)].map((runs) => runs.map((run) => pathD(run, at)).join(""));
  // the lane: the rails' closed runs, and the outline of a lane without rails
  const closed = (run: readonly Vec2[]) => run.length > 3 && at(run[0]).join() === at(run[run.length - 1]).join();
  const outside = hole.zones.filter((z) => z.outside && z.poly);
  const felt = [...rails(false).filter(closed), ...outside.map((z) => [...z.poly!, z.poly![0]])].map((run) => pathD(run, at)).join("");
  const zones = hole.zones.filter((z) => !z.outside).map((z) => ({ z, kind: mapZone(z) }));
  return (
    <Frame className={`${className} tint--${hole.world}`}>
      <defs><clipPath id={lane}><path d={felt} clipRule="evenodd" /></clipPath></defs>
      <rect width="120" height="120" className="map__turf" />
      {/* a lane without rails: what surrounds it first, then the lane over it */}
      {outside.map((z, i) => <ZoneShape key={i} z={{ ...z, poly: undefined }} kind={mapZone(z) || "pond"} at={at} />)}
      <path d={felt} className="map__felt" />
      <g clipPath={felt ? `url(#${lane})` : undefined}>
        {zones.map(({ z, kind }, i) => kind && <ZoneShape key={i} z={z} kind={kind} at={at} />)}
      </g>
      {/* the rails: ink, then paper on top */}
      <path d={still + gates} className="map__walls" />
      <path d={still} className="map__rails" />
      <path d={gates} className="map__rails map__rails--moving" />
      {hole.posts.map((p, i) => <circle key={i} cx={at(p.c)[0]} cy={at(p.c)[1]} r={Math.max(p.r * k, 1.5)} className="map__post" />)}
      <circle cx={tx} cy={ty} r="2.6" className="map__tee" />
      <circle cx={cx} cy={cy} r={Math.max(cupRadius(hole) * k, 2.5)} className="map__cup" />
      {path.length > 0 && (
        <>
          <path d={line} pathLength={100} className="map__line" />
          <circle r={Math.max(BALL_R * k, 2.4)} className="map__ball" style={{ offsetPath: `path("${line}")` }} />
        </>
      )}
      <path d={`M${cx} ${cy}V${cy - 16}`} className="w__pole" />
      <path d={`M${cx} ${cy - 16}l10 3.5l-10 3.5z`} className="w__flag" />
    </Frame>
  );
}

/** A zone on a map, filled as what it does. A slope gets a chevron pointing down its fall. */
function ZoneShape({ z, kind, at }: { z: Zone; kind: MapKind; at: (p: Vec2) => Vec2 }) {
  const [x0, y0] = at(z.min), [x1, y1] = at(z.max), box = { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
  const cls = `map__${kind}`;
  const shape = z.poly ? <path d={pathD([...z.poly, z.poly[0]], at)} className={cls} />
    : <rect {...box} rx={z.round ? box.width / 2 : 2} ry={z.round ? box.height / 2 : 2} className={cls} />;
  if (kind !== "slope") return shape;
  // a chevron at the zone's middle, pointing the way of the fall
  const c: Vec2 = [(z.min[0] + z.max[0]) / 2, (z.min[1] + z.max[1]) / 2], [mx, my] = at(c), [fx, fy] = at([c[0] + z.vec[0], c[1] + z.vec[1]]);
  const l = Math.hypot(fx - mx, fy - my) || 1, [ux, uy] = [(fx - mx) / l, (fy - my) / l], r = Math.min(4, box.width / 3, box.height / 3);
  return (<>{shape}{r >= 1.5 && <path d={`M${mx - r * (ux + uy)} ${my - r * (uy - ux)}L${mx + r * ux} ${my + r * uy}L${mx - r * (ux - uy)} ${my - r * (uy + ux)}`} className="map__fall" />}</>);
}

// A version's map never changes: read once a session. A failed read is asked again.
const read = new Map<string, Promise<MapHole>>();
/** The maps of the holes asked for, by id, as each read comes in. */
export function useHoleMaps(chain: Pick<Chain, "state"> | null, ids: readonly string[]): ReadonlyMap<string, MapHole> {
  const [maps, setMaps] = useState<ReadonlyMap<string, MapHole>>(new Map());
  const key = ids.join(" ");
  useEffect(() => {
    if (!chain) return;
    let live = true;
    for (const id of key.split(" ").filter(Boolean)) {
      let p = read.get(id);
      if (!p) read.set(id, (p = chain.state(id))), p.catch(() => read.delete(id));
      void p.then((m) => live && setMaps((was) => (was.has(id) ? was : new Map(was).set(id, m))), () => {});
    }
    return () => void (live = false);
  }, [chain, key]);
  return maps;
}

/** A map's window, empty: while it reads, or without one. */
export const NoMap = ({ className = "rival__map" }: { className?: string }) => <Frame className={className}><rect width="120" height="120" className="map__turf" /></Frame>;
