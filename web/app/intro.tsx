// What a page says without JavaScript, for search engines: an off-screen heading, a <noscript> card and JSON-LD.
import { REALM_PATH } from "@/lib/chain";

/** The gnoweb page of the course, or of one of its paths ("garden", "garden/3"). */
export const gnoweb = (path = "") => (process.env.NEXT_PUBLIC_WEB ? `${process.env.NEXT_PUBLIC_WEB.replace(/\/$/, "")}${REALM_PATH}${path && ":" + path}` : "");

export default function Intro({ title, text, web, links = [], ld }: { title: string; text: string; web: string; links?: { href: string; label: string }[]; ld?: object }) {
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      <noscript>
        <div className="noscript">
          <p>{text}</p>
          <p>
            The 3D game needs JavaScript.{web && <> <a href={web}>Play it as text on gno.land</a>.</>}
          </p>
          {links.length > 0 && (
            <ul>
              {links.map((l) => (
                <li key={l.href}><a href={l.href}>{l.label}</a></li>
              ))}
            </ul>
          )}
        </div>
      </noscript>
      {/* "<" escaped: a name cannot close the script */}
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", ...ld }).replace(/</g, "\\u003c") }} />}
    </>
  );
}
