"use client";

// The gnome shop as the game holds it: whether it is offered here, its sale, what the player holds and wears.
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Game } from "@/lib/engine";
import { GNOMES } from "@/lib/scene/gnome";
import type { Account } from "@/lib/adena";
import { savedGnome } from "@/lib/prefs";
import type { Screen } from "@/lib/screens";
import { SHOP, pickOf } from "@/lib/gnomes/door";
import { shopInRegion, shopShown } from "@/lib/gnomes/geo";
import type { Worn } from "@/lib/gnomes/shop";
import { askWorn, shopPart, useSale, useShopPart, useShopSkin } from "@/components/gnomes/Door";
import type { ShopView } from "@/components/gnomes/Shop";

export function useShop({ game, screen, setScreen, playing, holedNow, account, gnome, setGnome, unlockedRef, dare, chainUp }: {
  game: RefObject<Game | null>;
  screen: Screen;
  setScreen: (screen: Screen) => void;
  playing: boolean;
  holedNow: boolean;
  account: Account | null;
  gnome: string;
  setGnome: (id: string) => void;
  /** whether a gnome of the game's is the player's to play, as of the last render */
  unlockedRef: RefObject<(id: string) => boolean>;
  /** the rival, "" for none */
  dare: string;
  /** the game is made: its chain can be read */
  chainUp: boolean;
}) {
  // The gnome played is the player's pick while it is theirs, else the one they wear.
  const [region, setRegion] = useState<boolean | null>(null); // null: not read yet, or could not be; asked again on the next screen
  // one gate for every door to the shop
  const shopOn = shopShown(SHOP, region);
  const [held, setHeld] = useState<{ id: string; tier: string; traits: string; name: string; home: string }[]>([]);
  const [worn, setWorn] = useState<Worn | null>(null);
  const [shopView, setShopView] = useState<ShopView>({});
  const shopFrom = useRef<Screen>("modes"); // the screen the shop's Back returns to
  const gnomeNow = useRef(gnome);
  gnomeNow.current = gnome;
  useEffect(() => void (SHOP && region === null && shopInRegion().then(setRegion)), [screen]); // eslint-disable-line react-hooks/exhaustive-deps -- asked while unanswered
  // The sale is read once a visit, from the first screen that shows it. Never the title: the catalogue and the wardrobe wait for it.
  const saleHere = shopOn && (screen === "modes" || screen === "worlds" || screen === "pick" || screen === "shop" || (playing && holedNow));
  const [saleShown, setSaleShown] = useState(false);
  useEffect(() => void (saleHere && setSaleShown(true)), [saleHere]);
  const saleChain = shopOn && (saleHere || saleShown) ? (game.current && game.current.chain) || null : null;
  const { promo, now: promoNow } = useSale(saleChain);
  const shopSkin = useShopSkin(saleChain, promo);
  const shopBits = useShopPart(!!saleChain); // the panel's line with its price, once the shop's part is in
  // the shop's chunk is fetched as soon as a door to it shows, so opening it draws at once
  useEffect(() => void (shopOn && (screen === "modes" || screen === "worlds" || screen === "pick") && shopPart()?.then((m) => m.prefetchShop(), () => {})), [shopOn, screen]);
  // whose gnomes are shown: another account's answer landing late is dropped
  const heldOf = useRef("");
  const readWorn = () => {
    const c = game.current && game.current.chain, part = SHOP && c && account ? shopPart() : null;
    if (!c || !account || !part) return ((heldOf.current = ""), setHeld([]), setWorn(null));
    const me = account.address;
    if (heldOf.current !== me) ((heldOf.current = me), setHeld([]), setWorn(null));
    void part.then(async (m) => {
      const { mine, worn: w, skins } = await m.readHeld(c, me);
      if (heldOf.current !== me) return;
      setHeld(mine);
      setWorn(w);
      if (!skins) return; // the wardrobe is not fetched: the gnome played stays until the next read
      // theirs while it is theirs, else the one everyone sees, else the browser's own
      const want = m.playing({ pick: pickOf(me), held: new Set(skins.map((k) => k.id)), worn: w, saved: savedGnome(), free: (id) => GNOMES.some((g) => g.id === id) && unlockedRef.current(id) });
      if (want !== gnomeNow.current) (setGnome(want), game.current && game.current.setGnome(want));
    }).catch(() => {});
  };
  useEffect(readWorn, [account, game.current]); // eslint-disable-line react-hooks/exhaustive-deps -- readWorn changes with the account
  // a rival's ghost wears the gnome they wear for everyone, read as they are picked
  useEffect(() => {
    const c = game.current && game.current.chain;
    if (SHOP && c && dare) askWorn(c, dare);
  }, [dare, chainUp, game]);
  const openShop = (v: ShopView = {}) => {
    if (!shopOn) return; // no shop where it is not offered, nor before the region has answered
    if (screen !== "shop") shopFrom.current = screen === "title" ? "modes" : screen;
    setShopView(v);
    setScreen("shop");
  };
  return { region, shopOn, held, worn, shopView, setShopView, shopFrom, promo, promoNow, shopSkin, shopBits, readWorn, openShop };
}
