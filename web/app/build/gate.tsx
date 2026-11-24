"use client";

// The Builder's one decision before anything of it loads: the editor on a
// computer; on a phone, a touch screen or under 900 px the phone's screen,
// and neither the editor's code nor builder.wasm is downloaded (each is its
// own chunk, reached only through next/dynamic here). A window narrowed later
// swaps the editor out; its draft is already kept in the browser.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { builderOn, onComputer, PHONE_QUERY } from "@/lib/builder/route";

const Builder = dynamic(() => import("@/components/builder/Builder"), { ssr: false });
const PhoneBuilder = dynamic(() => import("@/components/builder/PhoneBuilder"), { ssr: false });

export default function Gate() {
  const [where, setWhere] = useState<"computer" | "phone" | null>(null);
  useEffect(() => {
    const m = window.matchMedia(PHONE_QUERY);
    const say = () => setWhere(onComputer((q) => window.matchMedia(q).matches) ? "computer" : "phone");
    say();
    m.addEventListener("change", say);
    return () => m.removeEventListener("change", say);
  }, []);
  if (!builderOn()) {
    return (
      <main className="builder-off">
        <h1>The Builder isn&apos;t open yet.</h1>
        <p><a href="/">Play the course</a></p>
      </main>
    );
  }
  // the page's name, off screen: a screen's visible title is its h2, as in the game
  return (
    <>
      <h1 className="sr-only">The Builder</h1>
      {where === "computer" ? <Builder /> : where === "phone" ? <PhoneBuilder /> : null}
    </>
  );
}
