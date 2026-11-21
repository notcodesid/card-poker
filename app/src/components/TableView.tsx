import { useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PlayingCard } from "./PlayingCard";
import { TradingCard } from "./TradingCard";
import { useTable } from "../hooks/useTable";
import { PokerClient, isBetting, phaseOf } from "../lib/poker";
import { cardByMint, USDC_DECIMALS, TEE_ENDPOINT, baseExplorerTxUrl } from "../lib/config";
import { handName, NO_CARD } from "../lib/cards";
import { shortKey } from "../lib/wallet";

const PHASE_LABEL: Record<string, string> = {
  waiting: "Waiting for an opponent",
  ready: "Dealing…",
  preFlop: "Pre-flop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
  finished: "Match over",
};

export function TableView({
  client,
  tableId,
  bot,
  onLeave,
  onJoin,
}: {
  client: PokerClient;
  tableId: BN;
  bot: PokerClient | null;
  onLeave: () => void;
  onJoin: () => void;
}) {
  const t = useTable(client, tableId, bot);
  const [raiseTo, setRaiseTo] = useState("");
  const table = t.table;
  if (!table) return <div className="panel">Loading table #{tableId.toString()}…</div>;

  const phase = phaseOf(table);
  const seat = t.seat;
  const spectator = seat < 0;
  const mySeat = spectator ? 0 : seat;
  const opp = 1 - mySeat;
  const board = table.board.slice(0, 5);
  const showdownKnown = table.showdown[0] !== NO_CARD;
  const myCards = showdownKnown
    ? table.showdown.slice(mySeat * 2, mySeat * 2 + 2)
    : t.hand?.cards ?? [NO_CARD, NO_CARD];
  const oppCards = showdownKnown ? table.showdown.slice(opp * 2, opp * 2 + 2) : [NO_CARD, NO_CARD];
  const bet = (i: number) => table.bets[i].toNumber();
  const stack = (i: number) => table.stacks[i].toNumber();
  const owe = Math.max(0, bet(opp) - bet(mySeat));
  const myTurn = !spectator && isBetting(phase) && table.toAct === mySeat;
  const minRaise = bet(opp) + Math.max(table.lastRaise.toNumber(), table.smallBlind.toNumber() * 2);
  const maxTo = stack(mySeat) + bet(mySeat);
  const timedOut =
    isBetting(phase) &&
    !spectator &&
    table.toAct !== mySeat &&
    Date.now() / 1000 > table.turnStartedAt.toNumber() + 60;
  const usdc = (b: BN) => b.toNumber() / 10 ** USDC_DECIMALS;
  const players = [table.player1, table.player2];
  const name = (i: number) =>
    i === seat ? "You" : t.botSeat === i ? "Bot" : players[i].equals(PublicKey.default) ? "—" : shortKey(players[i]);
  const winnerName =
    table.lastHandWinner === 2 ? "Split pot" : table.lastHandWinner < 2 ? `${name(table.lastHandWinner)} won the hand` : "";
  const myHandName = handName([...myCards, ...board]);

  return (
    <div className="table-page">
      <div className="table-head">
        <button className="btn ghost" onClick={onLeave}>← Lobby</button>
        <div>
          <b>Table #{table.tableId.toString()}</b> · {PHASE_LABEL[phase]}
          {table.handNo > 0 && ` · hand ${table.handNo}`}
        </div>
        <span className={`layer ${t.delegated ? "er" : "base"}`}>
          {t.delegated ? "Private Ephemeral Rollup (TEE)" : "Solana devnet"}
        </span>
      </div>

      <div className="stakes">
        {[0, 1].map((i) => {
          const mint = table.cardMints[i];
          const info = cardByMint(mint);
          return (
            <div key={i} className="stake">
              <div className="stake-label">{name(i)} staked</div>
              {info ? <TradingCard card={info} price={usdc(table.cardValues[i])} /> : <div className="tcard empty">?</div>}
              {table.topUps[i].gtn(0) && <div className="topup">+ ${usdc(table.topUps[i])} USDC top-up</div>}
            </div>
          );
        })}
      </div>

      {phase === "waiting" ? (
        <div className="panel center">
          {seat === 0 ? (
            <>
              <p>Share this link with your opponent:</p>
              <code className="share">{window.location.href}</code>
            </>
          ) : (
            <button className="btn primary" onClick={onJoin}>Join this table with one of my cards</button>
          )}
        </div>
      ) : (
        <div className="felt">
          <Seat
            label={name(opp)}
            stack={stack(opp)}
            bet={bet(opp)}
            active={isBetting(phase) && table.toAct === opp}
            dealer={table.dealer === opp}
          >
            {oppCards.map((c, i) => (
              <PlayingCard key={i} card={c} hidden={c === NO_CARD} />
            ))}
          </Seat>

          <div className="board">
            <div className="pot">Pot {table.pot.toNumber() + bet(0) + bet(1)}</div>
            <div className="board-cards">
              {[0, 1, 2, 3, 4].map((i) => (
                <PlayingCard key={i} card={i < table.boardLen ? board[i] : undefined} />
              ))}
            </div>
            {winnerName && (phase === "ready" || phase === "finished") && <div className="result">{winnerName}</div>}
            {phase === "finished" && (
              <div className="result big">
                {table.matchWinner === seat ? "You win both cards!" : `${name(table.matchWinner)} wins the match`}
                {table.paid ? " · paid out on Solana" : " · settling…"}
              </div>
            )}
          </div>

          <Seat
            label={name(mySeat)}
            stack={stack(mySeat)}
            bet={bet(mySeat)}
            active={myTurn}
            dealer={table.dealer === mySeat}
          >
            {myCards.map((c, i) => (
              <PlayingCard key={i} card={c} highlight />
            ))}
            {myHandName && <div className="hand-name">{myHandName}</div>}
          </Seat>

          {myTurn && (
            <div className="actions">
              <button className="btn" disabled={t.busy} onClick={() => t.act("Fold", { fold: {} })}>Fold</button>
              {owe === 0 ? (
                <button className="btn" disabled={t.busy} onClick={() => t.act("Check", { check: {} })}>Check</button>
              ) : (
                <button className="btn" disabled={t.busy} onClick={() => t.act(`Call ${Math.min(owe, stack(mySeat))}`, { call: {} })}>
                  Call {Math.min(owe, stack(mySeat))}
                </button>
              )}
              {stack(opp) > 0 && maxTo > bet(opp) && (
                <>
                  <input
                    className="raise-input"
                    type="number"
                    min={Math.min(minRaise, maxTo)}
                    max={maxTo}
                    placeholder={`${Math.min(minRaise, maxTo)}`}
                    value={raiseTo}
                    onChange={(e) => setRaiseTo(e.target.value)}
                  />
                  <button
                    className="btn"
                    disabled={t.busy}
                    onClick={() => {
                      const to = Math.min(Math.max(Number(raiseTo) || minRaise, minRaise), maxTo);
                      t.act(`${owe === 0 ? "Bet" : "Raise"} to ${to}`, to === maxTo ? { allIn: {} } : { raise: { to: new BN(to) } });
                      setRaiseTo("");
                    }}
                  >
                    {owe === 0 ? "Bet" : "Raise"}
                  </button>
                </>
              )}
              <button className="btn primary" disabled={t.busy} onClick={() => t.act("All-in", { allIn: {} })}>All-in</button>
            </div>
          )}
          {timedOut && (
            <div className="actions">
              <button className="btn" onClick={t.claimTimeout}>Opponent timed out: fold them</button>
            </div>
          )}
        </div>
      )}

      <div className="side">
        <div className="panel privacy">
          <h3>What the private rollup lets you see</h3>
          <ul>
            <li>✓ Your hole cards: readable with your TEE auth token</li>
            <li>
              {t.opponentHidden === null ? "…" : t.opponentHidden ? "✕" : "!"} Opponent's hole cards:{" "}
              {t.opponentHidden === null ? "checking" : t.opponentHidden ? "the TEE refused to return them" : "visible"}
            </li>
            <li>✕ Deck: private with no members, so nobody can read it</li>
            <li>↥ At settlement, the deck and hands are wiped before the state is committed to Solana</li>
          </ul>
          <small>TEE: {TEE_ENDPOINT}</small>
        </div>
        <div className="panel log">
          <h3>Transactions</h3>
          {t.log.length === 0 && <small>Actions appear here with their latency.</small>}
          {t.log.map((e, i) => (
            <div key={i} className={`log-row ${e.error ? "err" : ""}`}>
              <span className={`tag ${e.layer === "ER" ? "er" : "base"}`}>{e.layer}</span>
              <span className="what">{e.label}</span>
              {e.ms !== undefined && <span className="ms">{e.ms} ms</span>}
              {e.sig && e.layer === "Solana" && (
                <a href={baseExplorerTxUrl(e.sig)} target="_blank" rel="noreferrer">tx</a>
              )}
              {e.error && <div className="errmsg">{e.error}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Seat({
  label,
  stack,
  bet,
  active,
  dealer,
  children,
}: {
  label: string;
  stack: number;
  bet: number;
  active: boolean;
  dealer: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`seat${active ? " active" : ""}`}>
      <div className="seat-info">
        <b>{label}</b> {dealer && <span className="dealer">D</span>}
        <span>{stack} chips</span>
        {bet > 0 && <span className="bet">bet {bet}</span>}
      </div>
      <div className="seat-cards">{children}</div>
    </div>
  );
}
