"use client";

// The gnome's picker: the game's gnomes turning on a stage, one at a time, the collection under the tile, the aim,
// and the button that plays.
import type { ReactNode } from "react";
import { GNOMES, gnomeById } from "@/lib/scene/gnome";
import type { Mode } from "@/lib/types";
import { UNLOCKS } from "@/lib/card";
import { sound } from "@/lib/feel";
import { AboutButton, BackButton } from "@/components/About";
import { useGnomeStage } from "@/components/Stage";
import { Button } from "@/components/ui";
import { AimSetting } from "@/components/game/Hud";

interface PickerProps {
  /** the cup picked: the screen takes its colours */
  world: string;
  /** the hole a shared link opened, named over the gnomes ("Hole 3 · Down the Tunnel") */
  hole?: string;
  /** that link's dare, said under it: the duel it arms, or who dares with no round here */
  dare?: ReactNode;
  gnome: string;
  onChange: (id: string) => void;
  onPick: () => void;
  unlocked: (id: string) => boolean;
  /** the gnome really chosen: a locked one on show plays as it */
  chosen: string;
  onPlayAs: (id: string) => void;
  onBack: () => void;
  /** the Back button's words (a duel's goes to their ghosts) */
  backLabel?: string;
  onAbout: () => void;
  aim: Mode;
  onAim: (m: Mode) => void;
  /** the collection, under the tile (components/gnomes/Promo CollectionSection: the gnomes a player holds first) */
  owned?: ReactNode;
}

export function Picker({ world, gnome, onChange, onPick, unlocked, chosen, onPlayAs, onBack, backLabel = "Back to the cups", onAbout, aim, onAim, hole = "", dare = "", owned = null }: PickerProps) {
  const i = Math.max(0, GNOMES.findIndex((g) => g.id === gnome));
  // the game's gnomes, or one of the collection a player holds (picked in its row: owned)
  const skin = GNOMES.find((g) => g.id === gnome) || gnomeById(gnome);
  const canvas = useGnomeStage(skin);

  const step = (d: number) => (sound("blip"), onChange(GNOMES[(i + d + GNOMES.length) % GNOMES.length].id));

  return (
    <div className={`screen screen--pick front tint--${world}`}>
      <BackButton label={backLabel} onClick={onBack} />
      <AboutButton onClick={onAbout} />
      <div className="pick">
        <span className="eyebrow">{hole ? <>{hole}<span className="pick__ask"> · pick your gnome</span></> : "Pick your gnome"}</span>
        {dare && (typeof dare === "string" ? <p className="dare">{dare}</p> : dare)}
        <h2 className="pick__name" tabIndex={-1}>{skin.name}</h2>
        <div className="pick__stage">
          <button className="round" aria-label="Previous gnome" onClick={() => step(-1)}>‹</button>
          {/* the tile: the gnome's own renderer (its canvas mount) and his dots along its foot */}
          <div className="pick__tile">
            <div ref={canvas} className={"pick__canvas" + (unlocked(skin.id) ? "" : " pick__canvas--locked")} />
            {/* a locked gnome: what earns him, on a band across him */}
            {!unlocked(skin.id) && <p className="pick__lock">🔒 {skin.unlock ? UNLOCKS[skin.unlock].need : "Keep playing"}</p>}
            <div className="pick__dots">
              {GNOMES.map((g) => (
                <span key={g.id} aria-current={g.id === skin.id} />
              ))}
            </div>
          </div>
          <button className="round" aria-label="Next gnome" onClick={() => step(1)}>›</button>
        </div>
        {/* the collection between the tile and the aim card, the aim card's width */}
        {owned}
        <AimSetting aim={aim} onChange={onAim} compact />
        {/* a locked gnome on show: the button still plays, as the gnome really chosen */}
        <Button variant="gold" className="btn--play btn--cta btn--pop" onClick={() => (sound("start"), unlocked(skin.id) ? onPick() : onPlayAs(chosen))}>
          {unlocked(skin.id) ? "Choose this gnome" : `Play as ${gnomeById(chosen).name}`}
        </Button>
        <i className="front__veil" aria-hidden="true" />
      </div>
    </div>
  );
}
