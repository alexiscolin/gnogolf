"use client";

// A client module of its own: a dynamic import with ssr:false can only be made from one.
import dynamic from "next/dynamic";
import { useEffect } from "react";
import Title from "@/components/Title";
import { FrontScreen } from "@/components/About";
import { MENU_HEAD, onMenuLink } from "@/lib/menu";
import { start } from "@/lib/analytics";
import { watchClicks } from "@/lib/uitrack";

// ssr off: WebGL cannot run during a build.
const Golf = dynamic(() => import("@/components/Golf"), {
  ssr: false,
  // the title while the game loads; on the menu's address, the menu's head
  loading: () => (onMenuLink() ? <MenuFrame /> : <Title loading />),
});

/** The menu's head while the game loads; its cards come with the game. */
const MenuFrame = () => <FrontScreen className="modes" back={MENU_HEAD.back} eyebrow={MENU_HEAD.eyebrow} title={MENU_HEAD.title} />;

export default function Game() {
  useEffect(() => (void start(), watchClicks()), []);
  return <Golf />;
}
