// Plays a full match on devnet + the MagicBlock TEE with two burner keypairs,
// exercising the same PokerClient the web app uses.
// Usage: yarn e2e-devnet   (funds both players from ~/.config/solana/id.json)
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
(globalThis as Record<string, unknown>).window = globalThis;

const { PokerClient, randomTableId, phaseOf, isBetting } = await import("../src/lib/poker.ts");
const { CARDS } = await import("../src/lib/config.ts");
const { transferSol } = await import("../src/lib/wallet.ts");
const { BN } = await import("@coral-xyz/anchor");

const funder = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))),
);
const p1 = new PokerClient(Keypair.generate());
const p2 = new PokerClient(Keypair.generate());
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

for (const p of [p1, p2]) await transferSol(p1.base, funder, p.publicKey, 0.06);
log("funded", p1.publicKey.toBase58(), p2.publicKey.toBase58());
const [c1, c2] = [CARDS[2], CARDS[0]]; // 60 vs 120 USDC: creator's allowance covers 60
await p1.claimStarterPack(c1.mint);
await p2.claimStarterPack(c2.mint);
log("starter packs claimed");

const id = randomTableId();
await p1.createTable(id, c1.mint, new BN(70_000_000));
log("table created + delegated", id.toString());
const creator = (await p1.fetchTableBase(id))!.table.player1;
await p2.joinTable(id, c2.mint, creator);
log("joined + delegated");

const hidden = !(await p1.peek(p1.handPda(id, p2.publicKey)));
const deckHidden = !(await p1.peek(p1.deckPda(id))) && !(await p2.peek(p2.deckPda(id)));
log("opponent hand hidden from p1:", hidden, "deck hidden:", deckHidden);

for (let guard = 0; guard < 200; guard++) {
  const t = await p1.fetchTableEr(id);
  if (!t) throw new Error("table missing on ER");
  const phase = phaseOf(t);
  if (phase === "finished") break;
  if (phase === "ready") {
    const starter = t.dealer === 0 ? p1 : p2;
    const s = Date.now();
    await starter.startHand(t);
    const h = await p1.fetchMyHand(id);
    log(`hand ${t.handNo + 1} dealt in ${Date.now() - s} ms; p1 sees`, h?.cards);
    continue;
  }
  if (isBetting(phase)) {
    const actor = t.toAct === 0 ? p1 : p2;
    const s = Date.now();
    await actor.act(t, { allIn: {} }).catch(() => actor.act(t, { call: {} }));
    log(`seat ${t.toAct} acted in ${Date.now() - s} ms`);
  }
}
const t = (await p1.fetchTableEr(id))!;
log("match winner seat", t.matchWinner, "stacks", t.stacks.map(String), "showdown", t.showdown);
await p1.settle(t);
await p1.waitUntilOnBase(id);
log("settled to Solana");
await p1.claimPot(t);
const winner = t.matchWinner === 0 ? p1 : p2;
log("claimed; winner card balances", await winner.tokenBalance(c1.mint), await winner.tokenBalance(c2.mint));
await winner.sellCard(c2.mint);
log("winner sold", c2.name, "USDC now", (await winner.tokenBalance((await import("../src/lib/config.ts")).USDC_MINT)) / 1e6);
log("done in", (Date.now() - t0) / 1000, "s; SOL left", (await p1.solBalance()) / LAMPORTS_PER_SOL);
