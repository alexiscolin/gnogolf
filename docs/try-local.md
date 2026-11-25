# Try it all locally / Tout essayer en local

```sh
scripts/try-local.sh          # start (Ctrl+C stops it all)
scripts/try-local.sh close 30 # set the genesis sale's closing date, 30 days off (or bring it forward; then only earlier)
scripts/try-local.sh rebuild  # build the site again, served without a break
scripts/try-local.sh down     # clean up after a crash
```

**English.** One command starts a local chain with the game (its 90 holes:
the four classic cups and the Crystal Mines), the gnome shop and the
Builder deployed, two throwaway wallets, and the site built as the real one
is, with `NEXT_PUBLIC_GNOMES`, `NEXT_PUBLIC_BUILDER` and
`NEXT_PUBLIC_COMMUNITY` on (it writes `web/out`, as `npm run build` does).
In a few minutes it prints the links, the wallets' seed phrases (made
for this run, printed here and written nowhere), the network to add to
Adena and what to try. It needs the onyx toolchain
([docs/development.md](development.md#the-toolchain)) and `cd web && npm ci`.

Every server listens on 127.0.0.1 alone, and the links work on this
machine. To open them to your other devices, set `TAILNET_PREVIEW` to a
script of your own that opens Tailscale Serve entries (`up NAME PORT...`,
`down NAME`, `list`): with Tailscale up, the run opens them on the tailnet
only (never Funnel) and removes them on Ctrl+C.

- `https://<machine>.<tailnet>.ts.net:<port>/`: the link to use, a secure
  page (copying and sharing links need one). If it does not open on a
  device, turn on *Use Tailscale DNS* in that device's Tailscale app.
- `http://<tailscale-ip>:<port>/`: the fallback, plain http: all of it
  works but copying and sharing links.
- The page reads the chain on its own origin (`/rpc`, streamed to the node
  by `scripts/playground-server.mjs`), so both links behave alike. Adena
  signs straight to the node: add a custom network with the printed RPC
  (`http://<tailscale-ip>:<port>`) and chain id `gnogolf-local`, then
  import a printed seed phrase (a Chrome profile of its own keeps your real
  wallet apart).

Where to click: "Click to start", then "How do we play?": Solo (the cups),
Duel, "Builder" (on a computer) and "Gnomes", the collection (also atop the
gnome picker and on the cups screen). `p1` has a record (the players'
window lets it buy) and a few gnomes; `p0` has neither. All 720 gnomes are
on sale at once, in the genesis's one sale, its players' window one hour.
The genesis sale has no closing date: it sells until sold out.
`close [days]` sets one, 30 days off by default and 7 at least (a close is
announced a week ahead); after that it only brings it earlier. `rebuild`
builds the site anew with the code as it is now, beside the one served,
then swaps them in one step: the chain and the links never stop, and a
failed build leaves the site as it was. The region gate: `/g/?geo=blocked`.
