// Work put off to the browser's idle moments: what a later screen will show, fetched while this one is read.

/** Runs the jobs one after the other, each in an idle moment (4 s at most apart): never in the way of a frame. A job that throws is left behind. Returns a stop: the jobs not started yet are dropped. */
export function whenIdle(jobs: readonly (() => unknown)[]): () => void {
  const later = typeof requestIdleCallback === "function" ? (f: () => void) => void requestIdleCallback(f, { timeout: 4000 }) : (f: () => void) => void setTimeout(f, 200);
  let on = true;
  const run = (i: number) => {
    if (i >= jobs.length) return;
    later(() => {
      if (!on) return;
      try { void jobs[i](); } catch {}
      run(i + 1);
    });
  };
  run(0);
  return () => void (on = false);
}
