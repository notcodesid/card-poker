import { useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { TradingCard } from "./TradingCard";
import { CARDS, MIN_PLAY_SOL, type CardInfo } from "../lib/config";
import type { useWallet } from "../hooks/useWallet";
import type { TableAccount } from "../lib/poker";

type Wallet = ReturnType<typeof useWallet>;

export function Lobby({
  wallet,
  joining,
  busy,
  onCreate,
  onBot,
  onJoin,
  onClaim,
  onSell,
  onAirdrop,
}: {
  wallet: Wallet;
  joining: TableAccount | null;
  busy: string | null;
  onCreate: (card: CardInfo, allowance: number) => void;
  onBot: (card: CardInfo, allowance: number) => void;
  onJoin: (card: CardInfo) => void;
  onClaim: (card: CardInfo) => void;
  onSell: (card: CardInfo) => void;
  onAirdrop: () => void;
}) {
  const [selected, setSelected] = useState<CardInfo | null>(null);
  const [joinId, setJoinId] = useState("");
  const [allowance, setAllowance] = useState(60);
  const owned = (c: CardInfo) => wallet.cards[c.mint.toBase58()] ?? 0;
  const price = (c: CardInfo) => wallet.prices[c.mint.toBase58()];
  const needsSol = wallet.sol < MIN_PLAY_SOL;

  // Value matching preview when joining someone's table.
  const creatorValue = joining ? joining.cardValues[0].toNumber() / 1e6 : 0;
  const creatorAllowance = joining ? joining.topUps[0].toNumber() / 1e6 : 0;
  const joinCost = (c: CardInfo) => {
    const v = price(c) ?? 0;
    if (v <= creatorValue) return { pay: creatorValue - v, ok: true };
    return { pay: 0, ok: v - creatorValue <= creatorAllowance };
  };

  return (
    <div className="lobby">
      <section className="hero">
        <h1>Card Poker</h1>
        <p>
          Heads-up Texas Hold'em where the buy-in is a trading card from your collection. The winner walks
          away with both. Hole cards are dealt inside a <b>MagicBlock Private Ephemeral Rollup</b>: they stay
          encrypted in a TEE, so not even your opponent's node can read them.
        </p>
      </section>

      {needsSol && (
        <section className="panel warn">
          <b>Fund your burner wallet with devnet SOL to play</b>
          <code className="share">{wallet.client.publicKey.toBase58()}</code>
          <div className="row">
            <button className="btn" onClick={onAirdrop} disabled={!!busy}>Request airdrop</button>
            <a className="btn ghost" href="https://faucet.solana.com" target="_blank" rel="noreferrer">
              faucet.solana.com
            </a>
          </div>
        </section>
      )}

      {joining && (
        <section className="panel">
          <h2>Join table #{joining.tableId.toString()}</h2>
          <p>
            The opponent staked a card worth <b>${creatorValue}</b> and set aside up to <b>${creatorAllowance}</b> to
            match a more valuable card. Pick your stake:
          </p>
        </section>
      )}

      <section>
        <h2>Your collection</h2>
        <div className="grid">
          {CARDS.map((c) => {
            const n = owned(c);
            const cost = joining ? joinCost(c) : null;
            return (
              <TradingCard
                key={c.mint.toBase58()}
                card={c}
                price={price(c)}
                selected={selected?.mint.equals(c.mint)}
                onClick={n > 0 ? () => setSelected(c) : undefined}
                footer={
                  n > 0 ? (
                    <div className="row">
                      <span>Owned ×{n}</span>
                      <button
                        className="btn tiny ghost"
                        disabled={!!busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSell(c);
                        }}
                      >
                        Sell ${price(c)}
                      </button>
                      {cost && (
                        <span className={cost.ok ? "" : "bad"}>
                          {cost.ok ? (cost.pay > 0 ? `+$${cost.pay} top-up` : "no top-up") : "too valuable"}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      className="btn tiny"
                      disabled={!!busy || needsSol}
                      onClick={(e) => {
                        e.stopPropagation();
                        onClaim(c);
                      }}
                    >
                      Claim starter card
                    </button>
                  )
                }
              />
            );
          })}
        </div>
        <small>Balance: {wallet.sol.toFixed(3)} SOL · ${wallet.usdc.toFixed(2)} test USDC</small>
      </section>

      <section className="panel">
        {joining ? (
          <button
            className="btn primary"
            disabled={!selected || !!busy || needsSol || !(selected && joinCost(selected).ok)}
            onClick={() => selected && onJoin(selected)}
          >
            {selected ? `Stake ${selected.name} and join` : "Select a card to stake"}
          </button>
        ) : (
          <>
            <h2>Play</h2>
            <label className="row">
              Max top-up if the opponent's card is worth more: $
              <input
                type="number"
                className="raise-input"
                value={allowance}
                min={0}
                onChange={(e) => setAllowance(Number(e.target.value))}
              />
            </label>
            <div className="row">
              <button
                className="btn primary"
                disabled={!selected || !!busy || needsSol}
                onClick={() => selected && onBot(selected, allowance)}
              >
                {selected ? `Play vs bot with ${selected.name}` : "Select a card to stake"}
              </button>
              <button
                className="btn"
                disabled={!selected || !!busy || needsSol}
                onClick={() => selected && onCreate(selected, allowance)}
              >
                Create table and invite a friend
              </button>
            </div>
            <div className="row">
              <input
                className="raise-input wide"
                placeholder="Table ID"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
              />
              <button
                className="btn ghost"
                disabled={!joinId}
                onClick={() => {
                  const id = new BN(joinId);
                  window.location.search = `?table=${id.toString()}`;
                }}
              >
                Open table
              </button>
            </div>
          </>
        )}
        {busy && <div className="busy">… {busy}</div>}
      </section>
    </div>
  );
}
