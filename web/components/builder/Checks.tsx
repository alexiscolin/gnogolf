"use client";

// The checks, docked under the board: quiet while all is well (the header
// already says the difficulty and why Play waits). It opens on a problem:
// each thing to fix in the player's words (a click frames its piece; Move it
// where the piece can simply move), a round an edit broke, a limit as it nears.
import { Button } from "@/components/ui";
import type { Issue } from "@/lib/builder/checks";
import { dials, problems, type Gauge } from "@/lib/builder/editor";

export default function Checks({ broken, gauges, issues, busy, onShow, onFix }: {
  /** a round an edit broke, said calm ("" none) */
  broken: string;
  gauges: readonly Gauge[];
  issues: readonly Issue[];
  /** the checks are running again */
  busy: boolean;
  /** select a piece and frame it on the board */
  onShow: (piece: string) => void;
  onFix: (issue: Issue) => void;
}) {
  const d = dials(gauges), rows = problems(issues);
  return (
    <section className={`checks${!broken && !rows.length && !d.dials.length ? " checks--quiet" : ""}`} aria-label="Checks" aria-busy={busy}>
      {broken && <p className="verdict verdict--warn" role="status">{broken}</p>}
      {/* (kept in the page when empty: a live region only speaks of what changes in it) */}
      <ul className="issues" aria-live="polite" aria-label="What to fix, errors first">
        {rows.map((r, k) => (
          <li key={k} className={`issue issue--${r.bad ? "error" : "warn"}`} title={r.rule}>
            {r.piece ? <button type="button" className="issue__why" title="Show me" onClick={() => onShow(r.piece!)}>{r.text}</button> : <span className="issue__why">{r.text}</span>}
            {r.fix && <Button size="s" type="button" onClick={() => onFix(issues[k])}>Move it</Button>}
          </li>
        ))}
      </ul>
      {d.dials.length > 0 && (
        <div className="gauges" role="group" aria-label="Limits near">
          {d.dials.map((g) => (
            <div key={g.name} className={`gauge gauge--${g.level}`} title={g.title}>
              <span>{g.label}</span><em>{g.shown}</em>
              <i><b style={{ width: `${g.fill}%` }} /></i>
            </div>
          ))}
        </div>
      )}
      <p className="checks__near" aria-live="polite">{d.reached.join(" · ")}</p>
    </section>
  );
}
