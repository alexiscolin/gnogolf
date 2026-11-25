# Architecture decisions

One decision a file: its context, what was chosen, what follows from it and
what was turned down. Each one's Status says what was built, and which
later decision amends it. A new decision takes the next number.

| | Decision | Status |
|---|---|---|
| [001](001-architecture.md) | On-chain mini-golf: engine, courses, and what the chain is for | Accepted as the first design; its Status says where the game went another way |
| [002](002-holes-as-data.md) | Holes as data | Accepted; amends 001 |
| [003](003-sharing.md) | Sharing a hole and a round | Accepted, built (the shot clip behind a flag) |
| [004](004-duels.md) | Ghost duels | Accepted; stages 0 and 1 built |
| [005](005-crystal-mines.md) | The Crystal Mines, an expert cup | Accepted, built |
| [006](006-hole-builder.md) | The hole builder's checks, in the browser | Accepted for the feasibility step; its Amendments say the Builder as built |
| [007](007-gnomes.md) | The gnomes realm, its catalogue as data, a sale a series | Accepted for the feasibility step; amended by 012 and 013 |
| [008](008-gnome-catalogue.md) | The gnome catalogue as data, in series and worlds | Accepted, built; amended by 013 |
| [009](009-gnome-traits.md) | A gnome's traits, encoded | Accepted, built |
| [010](010-gnome-looks.md) | How a collectible gnome looks, and what he costs | Accepted, built |
| [011](011-gnome-collection.md) | The collection as status: an album and a collector rank | Accepted, built |
| [012](012-earned-rules.md) | The rules the earned gnomes' proof reads: accepted, not compiled in | Accepted, built; corrects 007 |
| [013](013-one-sale.md) | One sale a series, no waves | Accepted, built; supersedes 007's waves |

The designs they implement are in [docs/specs/](../specs); the game as
it stands today, in [docs/](..).
