# media

The scripts that make the game's pictures and videos, with the game's own
code in a headless Chrome, and the gnomes' pictures they made.

| | |
|---|---|
| [`lib/`](lib/) | what they share: Chrome over the DevTools protocol (`lib/cdp.mjs`), a page of the game's code (`lib/page.mjs`) |
| [`og/`](og/) | the link cards of the holes, the cups and the home page |
| [`promo/`](promo/) | the trailer: `promo/render.mjs`, its shot lists, the music's credits |
| [`gnomes/`](gnomes/) | the collection's thumbnails (`gnomes/thumbs/`) and turntables, their renderer, the gnomes' link cards, the shop's checks |
| [`gnomes/portrait/`](gnomes/portrait/) | the realm's portrait art (`gno.land/r/gnogolf/gnomes/art.gno`), traced from the client's gnome |
| [`builder/`](builder/) | the palette's pictures, and the Builder's video |

A script's first comment says what it takes and what must be running. From `web/`:
```sh
npm run og              # the link cards, into web/public/og/ (the dev server and a local chain running)
npm run gnomes:thumbs   # every gnome's thumbnail, into media/gnomes/thumbs/
npm run gnomes:cards    # the gnomes' link cards
npm run builder:tiles   # the palette's pictures, into web/public/builder/tiles/
```

Chrome is found by `lib/cdp.mjs` (`CHROME` says where). Git keeps the
scripts, the thumbnails and the turntables; renders and working screenshots
stay local ([.gitignore](../.gitignore)).
