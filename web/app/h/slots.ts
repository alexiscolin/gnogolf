// The course's slots, read at build time from data/holes.txt (relative to web/, where next build runs).
import fs from "node:fs";
import { CUPS } from "@/lib/site";

export const SLOTS = fs.readFileSync("../data/holes.txt", "utf8").split("\n").filter(Boolean).map((l) => l.split(" ")[0]);
/** The cups that have holes in the data, in order. */
export const COURSE_CUPS = CUPS.filter((c) => SLOTS.some((s) => s.startsWith(c + "/")));
