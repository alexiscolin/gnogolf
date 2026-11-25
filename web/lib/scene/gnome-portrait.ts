// The game's own gnomes and a duel's ghost as the stage first shows them (gnome.ts makePreview's first frame), on
// no background: what the cards' portraits are drawn with (media/gnomes/portraits.mjs).
import { GNOMES, makeBall, makeGhost, onStage, stageCamera } from "./gnome";
import { disposeCourse } from "./materials";
import { makeStudio } from "./studio";

/** The portraits' studio, size px square: ids (who it draws), shot(id) for a picture. */
export function makePortraits(size = 1024) {
  const studio = makeStudio(size), camera = stageCamera();
  return {
    ids: [...GNOMES.map((g) => g.id), "ghost"],
    /** A WebP data URL of the gnome named ("ghost": the duel's), px square. */
    shot(id: string, px: number, quality: number) {
      const g = onStage(id === "ghost" ? makeGhost(0.55).ball : makeBall(GNOMES.find((k) => k.id === id)));
      studio.scene.add(g);
      const url = studio.snap(camera, px, quality);
      studio.scene.remove(g);
      disposeCourse(g);
      return url;
    },
  };
}
