import { useCallback, useEffect, useMemo, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Lobby } from "./components/Lobby";
import { TableView } from "./components/TableView";
import { useWallet } from "./hooks/useWallet";
import { PokerClient, randomTableId, type TableAccount } from "./lib/poker";
import { loadOrCreateKeypair, shortKey, transferSol } from "./lib/wallet";
import {
  BOT_FUND_SOL,
  BOT_STORAGE_KEY,
  CARDS,
  PLAYER_STORAGE_KEY,
  USDC_DECIMALS,
  type CardInfo,
} from "./lib/config";

const tableFromUrl = (): BN | null => {
  const v = new URLSearchParams(window.location.search).get("table");
  return v && /^\d+$/.test(v) ? new BN(v) : null;
};

export default function App() {
  const wallet = useWallet(PLAYER_STORAGE_KEY);
  const client = wallet.client;
  const bot = useMemo(() => new PokerClient(loadOrCreateKeypair(BOT_STORAGE_KEY)), []);
  const [tableId, setTableId] = useState<BN | null>(tableFromUrl);
  const [withBot, setWithBot] = useState(() => localStorage.getItem("card-poker-bot-table") === tableFromUrl()?.toString());
  const [joining, setJoining] = useState<TableAccount | null>(null);
  const [showLobby, setShowLobby] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = (id: BN | null) => {
    setTableId(id);
    setShowLobby(false);
    window.history.pushState({}, "", id ? `?table=${id.toString()}` : window.location.pathname);
  };

  const step = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(null);
      wallet.refresh().catch(() => {});
    }
  }, [wallet]);

  const allowanceUnits = (usd: number) => new BN(Math.round(usd * 10 ** USDC_DECIMALS));

  const create = async (card: CardInfo, allowance: number) => {
    const id = randomTableId();
    await step("Escrowing your card and moving the table into the private rollup…", () =>
      client.createTable(id, card.mint, allowanceUnits(allowance)),
    );
    go(id);
  };

  const playBot = async (card: CardInfo, allowance: number) => {
    const myPrice = wallet.prices[card.mint.toBase58()] ?? 0;
    // Bot stakes a different card it can afford to match: prefer one of equal or lower value.
    const candidates = CARDS.filter((c) => !c.mint.equals(card.mint));
    const botCard =
      candidates.find((c) => (wallet.prices[c.mint.toBase58()] ?? 0) <= myPrice) ??
      candidates.find((c) => (wallet.prices[c.mint.toBase58()] ?? 0) - myPrice <= allowance) ??
      candidates[0];
    const id = randomTableId();
    await step("Funding the bot and giving it a starter card…", async () => {
      if ((await bot.solBalance()) < BOT_FUND_SOL * LAMPORTS_PER_SOL * 0.6) {
        await transferSol(client.base, client.keypair, bot.publicKey, BOT_FUND_SOL);
      }
      if ((await bot.tokenBalance(botCard.mint)) === 0) await bot.claimStarterPack(botCard.mint);
      else await bot.claimStarterPack(botCard.mint).catch(() => {});
    });
    await step("Escrowing your card and opening a private table…", () =>
      client.createTable(id, card.mint, allowanceUnits(allowance)),
    );
    await step(`Bot stakes ${botCard.name} and joins…`, () => bot.joinTable(id, botCard.mint, client.publicKey));
    localStorage.setItem("card-poker-bot-table", id.toString());
    setWithBot(true);
    go(id);
  };

  const join = async (card: CardInfo) => {
    if (!joining) return;
    const id = joining.tableId;
    await step("Escrowing your card, matching value, joining the private rollup…", () =>
      client.joinTable(id, card.mint, joining.player1),
    );
    setJoining(null);
    go(id);
  };

  // Opening someone else's waiting table → show the lobby in "join" mode.
  useEffect(() => {
    if (!tableId) return;
    client.fetchTableBase(tableId).then((r) => {
      if (r && !r.delegated && Object.keys(r.table.phase)[0] === "waiting" && !r.table.player1.equals(client.publicKey)) {
        setJoining(r.table);
      }
    });
  }, [client, tableId]);

  const inLobby = !tableId || showLobby || !!joining;

  return (
    <div className="page">
      <header className="top">
        <div className="brand" onClick={() => go(null)}>♠ Card Poker</div>
        <div className="wallet">
          <span title={client.publicKey.toBase58()}>{shortKey(client.publicKey)}</span>
          <span>{wallet.sol.toFixed(3)} SOL</span>
          <span>${wallet.usdc.toFixed(0)} USDC</span>
        </div>
      </header>
      {error && (
        <div className="panel error" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {inLobby ? (
        <Lobby
          wallet={wallet}
          joining={joining}
          busy={busy}
          onCreate={(c, a) => create(c, a).catch(() => {})}
          onBot={(c, a) => playBot(c, a).catch(() => {})}
          onJoin={(c) => join(c).catch(() => {})}
          onClaim={(c) => step(`Minting ${c.name}…`, () => client.claimStarterPack(c.mint)).catch(() => {})}
          onSell={(c) => step(`Selling ${c.name} to the treasury…`, () => client.sellCard(c.mint)).catch(() => {})}
          onAirdrop={() =>
            step("Requesting 1 devnet SOL…", async () => {
              const sig = await client.base.requestAirdrop(client.publicKey, LAMPORTS_PER_SOL);
              await client.base.confirmTransaction(sig, "confirmed");
            }).catch(() => {})
          }
        />
      ) : (
        <TableView
          client={client}
          tableId={tableId!}
          bot={withBot ? bot : null}
          onLeave={() => go(null)}
          onJoin={() => setShowLobby(true)}
        />
      )}
      <footer className="foot">
        Built on Solana devnet with MagicBlock Private Ephemeral Rollups · Solana Blitz v10
      </footer>
    </div>
  );
}
