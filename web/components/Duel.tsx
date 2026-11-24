"use client";

// A ghost duel's parts of the page: the dare on the picker, the fine print on the win card.
import type { ReactNode } from "react";
import { skyWord, type Duel } from "@/lib/duel";
import type { Mode } from "@/lib/types";
import { AIM_NAMES } from "@/lib/words";

/** The weather the ghost was played in and today's, when both are known ("" is clear). */
export type Sky = { theirs: string; mine: string } | null;
// fog plays as clear skies: it neither pushes nor slows the ball
const plays = (kind: string) => (kind === "fog" ? "" : kind);
const differs = (sky: Sky): sky is { theirs: string; mine: string } => !!sky && plays(sky.theirs) !== plays(sky.mine);

/** The picker's dare: who is raced, the strokes to beat, and what changes the race. mark: shown beside their name. */
export function DuelNote({ duel, mode, sky, onDrop, mark = null }: { duel: Duel; mode: Mode; sky: Sky; onDrop: () => void; mark?: ReactNode }) {
  const { ghost, name, self } = duel;
  const notes = [
    ghost.strokes === 1 && `${self ? "You" : name} aced it. Match it to tie.`,
    ghost.mode !== mode && `You: ${AIM_NAMES[mode]}. ${self ? "Your best" : "Them"}: ${AIM_NAMES[ghost.mode]}. Still a race, not a record.`,
    differs(sky) && `${self ? "You" : "They"} played in ${skyWord(plays(sky.theirs))}.`,
  ].filter(Boolean);
  return (
    <>
      <p>
        <span className="dare">{self ? "Racing your best" : <>Racing {name}{mark}</>} · {ghost.strokes} to beat</span>{" "}
        <button className="linkish" onClick={onDrop}>Play solo</button>
      </p>
      {notes.length > 0 && <p className="real__fine">{notes.join(" ")}</p>}
    </>
  );
}

/** The win card's duel fine print. round: the rival's round on gnoweb. */
export function DuelFine({ duel, mode, sky, round }: { duel: Duel; mode: Mode; sky: Sky; round?: string }) {
  return (
    <p className="real__fine">
      {differs(sky) && <>{duel.self ? "Your best had" : "They had"} {skyWord(plays(sky.theirs))}. You had {skyWord(plays(sky.mine))}. </>}
      {duel.ghost.mode !== mode && <>Your {AIM_NAMES[mode]} vs {duel.self ? "your best's" : "their"} {AIM_NAMES[duel.ghost.mode]}. </>}
      Duel records on-chain · soon
      {round && round !== "#" && !duel.self && <> · <a href={round} target="_blank" rel="noopener noreferrer">Their round on gno.land ↗</a></>}
    </p>
  );
}
