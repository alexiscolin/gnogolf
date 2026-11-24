// One static page per hole (/h/garden-3/) and per cup (/h/garden/): link crawlers run no JavaScript.
import fs from "node:fs";
import type { Metadata } from "next";
import Game from "@/app/game";
import Intro, { gnoweb } from "@/app/intro";
import { cupName, SITE } from "@/lib/site";
import { HARD } from "@/lib/card";
import { COURSE_CUPS, SLOTS } from "../slots";

// relative to web/, where next build runs
let known: Record<string, { name: string; par: number }> = {};
try { known = JSON.parse(fs.readFileSync("app/h/holes.json", "utf8")) as typeof known; } catch { /* no cards made yet: plain names */ }

export const dynamicParams = false;
export const generateStaticParams = () => [...SLOTS.map((s) => ({ slot: s.replace("/", "-") })), ...COURSE_CUPS.map((slot) => ({ slot }))];

type Props = { params: Promise<{ slot: string }> };

/** A hole's or a cup's title and description, unique per page. */
function about(slot: string) {
  const [world, n] = slot.split("-");
  const h = n ? known[`${world}/${n}`] : null;
  const cup = cupName(world);
  const place = `${cup} ${n}`;
  const name = h?.name || (n ? place : cup);
  const holes = SLOTS.filter((s) => s.startsWith(world + "/"));
  const hard = world === "mines" ? `, the expert cup: ${HARD}` : "";
  const heading = !n
    ? `${cup}: ${holes.length} holes of mini-golf on-chain`
    : h ? `${name}, ${cup} hole ${n}, par ${h.par}` : place;
  return {
    world, n, name, heading, holes,
    title: `${n ? (h ? `${name} · ${place}` : place) : heading} · Gnogolf`,
    description: n
      ? `${heading}: can you hole it in one? Free 3D mini-golf in your browser, every shot computed by the chain on gno.land.`
      : `${cup}: ${holes.length} holes of free 3D mini-golf in your browser${hard}. Every hole lives on gno.land, every shot is computed by the chain.`,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slot } = await params;
  const { title, description } = about(slot);
  const image = { url: `/og/${slot}.jpg`, type: "image/jpeg", width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    alternates: { canonical: `/h/${slot}/` },
    openGraph: { type: "website", url: `/h/${slot}/`, siteName: "Gnogolf", title, description, images: [image], locale: "en_US" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function HolePage({ params }: Props) {
  const { slot } = await params;
  const { world, n, name, heading, description, holes } = about(slot);
  // the breadcrumb search results show: Gnogolf › Garden Cup › The Shelf
  const trail = [
    { name: "Gnogolf", url: `${SITE}/` },
    ...(COURSE_CUPS.includes(world) ? [{ name: cupName(world), url: `${SITE}/h/${world}/` }] : []),
    ...(n ? [{ name, url: `${SITE}/h/${slot}/` }] : []),
  ];
  const ld = { "@type": "BreadcrumbList", itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: t.url })) };
  // a cup links its holes; a hole, its way back up
  const links = n
    ? trail.slice(0, -1).map((t) => ({ href: t.url, label: t.name }))
    : holes.map((s) => ({ href: `/h/${s.replace("/", "-")}/`, label: known[s]?.name || `${cupName(world)} ${s.split("/")[1]}` }));
  // base: the game's relative URLs (title/…, flags.json) are the site root's, not this folder's
  return (
    <>
      <base href="/" />
      <Intro title={heading} text={description} web={gnoweb(n ? `${world}/${n}` : world)} links={links} ld={ld} />
      <Game />
    </>
  );
}
