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
    if (joining && c.mint.equals(joining.cardMints[0])) return { pay: 0, ok: false };
    const v = price(c) ?? 0;
    if (v <= creatorValue) return { pay: creatorValue - v, ok: true };
    return { pay: 0, ok: v - creatorValue <= creatorAllowance };
  };

  return (
    <div className="lobby">
      <section className="hero">
        <div>
          <div className="eyebrow">Heads-up Hold'em · Solana devnet</div>
          <h1>
            Stake a card.
            <br />
            <em>Win both.</em>
          </h1>
          <p>
            The buy-in is a trading card from your collection, value-matched with USDC. Hole cards are dealt
            inside a <b>MagicBlock Private Ephemeral Rollup</b>, so nobody but you can read them, not even your
            opponent's node.
          </p>
        </div>
        <div className="features">
          <div className="feature">
            <div className="feature-icon">◈</div>
            <div>
              <b>Private hands</b>
              <span>Shuffle and deal run in a TEE; each hand is readable only by its owner.</span>
            </div>
          </div>
          <div className="feature">
            <div className="feature-icon">⚡</div>
            <div>
              <b>Gasless, ~1 s actions</b>
              <span>Every bet runs on the rollup, with no wallet popups.</span>
            </div>
          </div>
          <div className="feature">
            <div className="feature-icon">↥</div>
            <div>
              <b>Instant settlement</b>
              <span>The winner gets both cards on Solana and can sell either at once.</span>
            </div>
          </div>
        </div>
      </section>

      {needsSol && (
        <section className="panel warn">
          <h2>Fund your wallet to play</h2>
          <p>This browser has its own devnet wallet. Send it a little devnet SOL (0.05 is plenty):</p>
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
        <div className="section-head">
          <h2>Your collection</h2>
          <small>
            {wallet.sol.toFixed(3)} SOL · ${wallet.usdc.toFixed(2)} test USDC
          </small>
        </div>
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
                dimmed={n === 0}
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
                        <span className={cost.ok ? "good" : "bad"}>
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
            <div className="play-grid">
            <div>
            <h2>Start a match</h2>
            <label className="field">
              Max USDC top-up if the opponent's card is worth more
              <input
                type="number"
                className="raise-input"
                value={allowance}
                min={0}
                onChange={(e) => setAllowance(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
            <div className="row">
              <button
                className="btn primary"
                disabled={!selected || !!busy || needsSol}
                onClick={() => selected && onBot(selected, allowance)}
              >
                {selected ? `Play the bot with ${selected.name}` : "Select a card above"}
              </button>
              <button
                className="btn"
                disabled={!selected || !!busy || needsSol}
                onClick={() => selected && onCreate(selected, allowance)}
              >
                Invite a friend
              </button>
            </div>
            </div>
            <div>
            <h2>Join a table</h2>
            <p>Got a table ID from a friend? Open it to pick your stake.</p>
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
            </div>
            </div>
          </>
        )}
        {busy && <div className="busy">{busy}</div>}
      </section>
    </div>
  );
}
