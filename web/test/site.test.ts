// lib/site.ts: the public address a link card or a share carries, and the
// cups' names as the pages say them (the Crystal Mines among them); and
// netlify.toml serving the game's own address of a hole as that hole's page.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SITE, siteURL, siteHost, cupName, CUPS, ISSUES, reportHole } from "../lib/site.ts";

const w = globalThis as { window?: unknown };
const at = (href: string) => {
  const u = new URL(href);
  w.window = { location: { origin: u.origin, pathname: u.pathname, hostname: u.hostname } };
};
afterEach(() => void delete w.window);

test("siteURL: the page's own site, from its root (a hole's page too)", () => {
  at("https://gnogolf.xyz/");
  assert.equal(siteURL(), "https://gnogolf.xyz");
  assert.equal(siteURL("?cup=mines&hole=mines/3"), "https://gnogolf.xyz/?cup=mines&hole=mines/3");
  at("https://gnogolf.xyz/h/mines-3/");
  assert.equal(siteURL("/h/mines/"), "https://gnogolf.xyz/h/mines/", "a hole's page links from the site's root");
  assert.equal(siteHost(), "gnogolf.xyz");
  at("https://ipfs.io/ipfs/bafy/");
  assert.equal(siteURL("?hole=garden/1"), "https://ipfs.io/ipfs/bafy/?hole=garden/1", "under a path: kept");
  at("https://gnogolf.xyz/build/");
  assert.equal(siteURL("?hole=x/v1"), "https://gnogolf.xyz/?hole=x/v1", "so does the Builder");
  at("https://ipfs.io/ipfs/bafy/build/");
  assert.equal(siteURL("?hole=x/v1"), "https://ipfs.io/ipfs/bafy/?hole=x/v1");
  at("https://gnogolf.xyz/g/12/");
  assert.equal(siteURL("g/12/"), "https://gnogolf.xyz/g/12/", "so does the shop");
  at("https://gnogolf.xyz/g/");
  assert.equal(siteURL("g/?who=x"), "https://gnogolf.xyz/g/?who=x");
});

test("siteURL: never a local dev address, the public one instead", () => {
  at("http://localhost:3335/?rpc=http://127.0.0.1:46657");
  assert.equal(siteURL("?hole=mines/7"), `${SITE}/?hole=mines/7`);
  at("http://127.0.0.1:3300/h/garden-1/");
  assert.equal(siteURL(), SITE);
});

test("cupName: the course's cups by their names, the mines last; any other world by its own", () => {
  assert.deepEqual([...CUPS], ["garden", "island", "town", "mountain", "mines"]);
  assert.deepEqual(CUPS.map(cupName), ["Garden Cup", "Island Cup", "Mushroom Town", "Mountain Cup", "Crystal Mines"]);
  assert.equal(cupName("extras"), "Extras");
});

test("netlify.toml: a cup's hole, as a link or the address bar has it, is served as its page; a cup, as the cup's", () => {
  const toml = fs.readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
  const rules = toml.split("[[redirects]]").slice(1).map((r) => ({
    from: /from = "([^"]*)"/.exec(r)?.[1],
    to: /to = "([^"]*)"/.exec(r)?.[1],
    keys: [...(/query = \{([^}]*)\}/.exec(r)?.[1] || "").matchAll(/(\w+) =/g)].map((m) => m[1]).sort().join(),
  }));
  // Netlify takes a rule with a query only for a request with exactly its keys
  const page = (q: string) => rules.find((r) => r.from === "/" && r.keys === [...new URLSearchParams(q).keys()].sort().join())?.to;
  const by = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
  assert.equal(page("cup=garden&hole=4"), "/h/:cup-:hole/", "a link's");
  assert.equal(page("cup=garden&hole=4&gnome=pip"), "/h/:cup-:hole/", "in play");
  assert.equal(page(`cup=garden&hole=4&gnome=pip&by=${by}`), "/h/:cup-:hole/", "a dare raced");
  assert.equal(page("cup=garden&hole=4&screen=pick&gnome=pip"), "/h/:cup-:hole/", "its picker");
  assert.equal(page(`cup=garden&hole=4&screen=pick&gnome=pip&by=${by}`), "/h/:cup-:hole/", "its picker, dared");
  assert.equal(page("cup=garden"), "/h/:cup/", "a cup's link");
  assert.equal(page("cup=garden&gnome=pip"), "/h/:cup/", "the picker of its first hole");
  assert.equal(page("screen=cups"), undefined, "any other screen: the home page");
});

test("reportHole: an issue titled with the hole's id, its body a link that plays it and why left to say", () => {
  at("https://gnogolf.xyz/");
  const id = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5/avalanche/v1", u = new URL(reportHole(id));
  assert.equal(u.origin + u.pathname, ISSUES);
  assert.equal(u.searchParams.get("title"), `Report: ${id}`);
  const body = u.searchParams.get("body") || "";
  assert.ok(body.includes(`Play it: https://gnogolf.xyz/?hole=${id}`) && body.includes("Why?"));
});
