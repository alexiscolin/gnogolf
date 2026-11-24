// One static page per gnome (/g/94/) and per earned kind (/g/king/): link crawlers run no JavaScript.
import type { Metadata } from "next";
import Game from "@/app/game";
import Intro from "@/app/intro";
import { SITE } from "@/lib/site";
import { PAGES } from "../pages";

export const dynamicParams = false;
// Shop off: Next's static export needs one page, so a placeholder nothing links to.
export const generateStaticParams = () => (PAGES.length ? PAGES.map((p) => ({ id: p.slug })) : [{ id: "off" }]);

type Props = { params: Promise<{ id: string }> };
const pageOf = (id: string) => PAGES.find((p) => p.slug === id);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = pageOf((await params).id);
  if (!p) return { title: "Gnogolf", robots: { index: false } };
  const image = { url: p.image, type: "image/jpeg", width: 1200, height: 630, alt: p.title };
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: `/g/${p.slug}/` },
    openGraph: { type: "website", url: `/g/${p.slug}/`, siteName: "Gnogolf", title: p.title, description: p.description, images: [image], locale: "en_US" },
    twitter: { card: "summary_large_image", title: p.title, description: p.description, images: [image] },
  };
}

export default async function GnomePage({ params }: Props) {
  const p = pageOf((await params).id);
  const trail = [{ name: "Gnogolf", url: `${SITE}/` }, { name: "The gnomes", url: `${SITE}/g/` }, ...(p ? [{ name: p.heading, url: `${SITE}/g/${p.slug}/` }] : [])];
  const ld = { "@type": "BreadcrumbList", itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: t.url })) };
  return (
    <>
      <base href="/" />
      <Intro title={p ? p.heading : "Gnogolf"} text={p ? p.description : ""} web="" links={[{ href: "/g/", label: "The gnomes" }]} ld={ld} />
      <Game />
    </>
  );
}
