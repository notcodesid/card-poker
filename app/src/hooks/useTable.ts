import { useCallback, useEffect, useRef, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import {
  PokerClient,
  isBetting,
  phaseOf,
  type ActionArg,
  type HandAccount,
  type TableAccount,
} from "../lib/poker";
import { POLL_MS } from "../lib/config";

export interface LogEntry {
  at: number;
  label: string;
  layer: "ER" | "Solana";
  ms?: number;
  sig?: string;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Polls one table (from the private rollup while delegated, else Solana), reads
 * my own hole cards through my TEE token, and drives the automatic steps:
 * dealing the next hand, the bot's moves, and settlement + payout.
 */
export function useTable(client: PokerClient, tableId: BN | null, bot: PokerClient | null) {
  const [table, setTable] = useState<TableAccount | null>(null);
  const [delegated, setDelegated] = useState(false);
  const [hand, setHand] = useState<HandAccount | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [opponentHidden, setOpponentHidden] = useState<boolean | null>(null);
  const busyRef = useRef(false);
  const autoRef = useRef("");

  const push = (e: LogEntry) => setLog((l) => [e, ...l].slice(0, 40));

  const run = useCallback(
    async (label: string, layer: LogEntry["layer"], fn: () => Promise<string | void>) => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      const start = performance.now();
      try {
        const sig = await fn();
        push({ at: Date.now(), label, layer, ms: Math.round(performance.now() - start), sig: sig || undefined });
        return true;
      } catch (e) {
        push({ at: Date.now(), label, layer, error: (e as Error).message.slice(0, 160) });
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [],
  );

  const poll = useCallback(async () => {
    if (!tableId) return;
    const base = await client.fetchTableBase(tableId).catch(() => null);
    if (!base) return;
    setDelegated(base.delegated);
    if (!base.delegated) {
      setTable(base.table);
      return;
    }
    const er = await client.fetchTableEr(tableId).catch(() => null);
    setTable(er ?? base.table);
    const mine = await client.fetchMyHand(tableId).catch(() => null);
    setHand(mine);
  }, [client, tableId]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  const me = client.publicKey;
  const seat = table ? (table.player1.equals(me) ? 0 : table.player2.equals(me) ? 1 : -1) : -1;
  const botSeat =
    table && bot ? (table.player1.equals(bot.publicKey) ? 0 : table.player2.equals(bot.publicKey) ? 1 : -1) : -1;

  // Privacy check: try to read the opponent's hand through my own TEE token.
  useEffect(() => {
    if (!table || !delegated || seat < 0 || !tableId) return;
    const opp = seat === 0 ? table.player2 : table.player1;
    client
      .peek(client.handPda(tableId, opp))
      .then((visible) => setOpponentHidden(!visible))
      .catch(() => {});
  }, [client, delegated, seat, table?.handNo, tableId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Automatic steps.
  useEffect(() => {
    if (!table || busyRef.current || seat < 0) return;
    const phase = phaseOf(table);
    const key = `${phase}-${table.handNo}-${table.toAct}-${table.bets.join()}-${table.paid}`;
    if (autoRef.current === key) return;

    const dealer = table.dealer;
    if (phase === "ready" && delegated) {
      // Any seated player may deal; the non-dealer waits longer so an absent dealer can't stall the match.
      const starter = dealer === botSeat && bot ? bot : client;
      const delay = dealer === seat || dealer === botSeat ? (table.handNo === 0 ? 300 : 2500) : 15000;
      autoRef.current = key;
      (async () => {
        await sleep(delay);
        const ok = await run(`Deal hand #${table.handNo + 1} (shuffle in TEE)`, "ER", () => starter.startHand(table));
        if (!ok && autoRef.current === key) autoRef.current = "";
      })();
      return;
    }
    if (isBetting(phase) && bot && table.toAct === botSeat) {
      autoRef.current = key;
      (async () => {
        await sleep(900);
        const action = botAction(table, botSeat);
        await run(`Bot: ${actionLabel(action)}`, "ER", () => bot.act(table, action));
      })();
      return;
    }
    if (phase === "finished" && !table.paid) {
      const winnerSeat = table.matchWinner;
      const actor = winnerSeat === seat ? client : bot && winnerSeat === botSeat ? client : null;
      if (!actor) return;
      autoRef.current = key;
      (async () => {
        if (delegated) {
          await run("Settle: wipe secrets, commit to Solana", "ER", () => actor.settle(table));
          await actor.waitUntilOnBase(table.tableId).catch(() => {});
        }
        await run("Pay out both cards + USDC", "Solana", () => actor.claimPot(table));
        await poll();
      })();
    }
  }, [table, delegated, seat, botSeat, bot, client, run, poll]);

  const act = (label: string, action: ActionArg) =>
    table && run(label, "ER", () => client.act(table, action)).then(poll);
  const claimTimeout = () =>
    table && run("Claim timeout (opponent folds)", "ER", () => client.claimTimeout(table)).then(poll);

  const cancel = async () =>
    !!table && (await run("Cancel table (card + USDC refunded)", "Base", () => client.cancelTable(table)));

  return { table, delegated, hand, seat, botSeat, log, busy, opponentHidden, act, claimTimeout, cancel, run, poll };
}

function toCall(t: TableAccount, seat: number) {
  return Math.max(0, t.bets[1 - seat].toNumber() - t.bets[seat].toNumber());
}

function botAction(t: TableAccount, seat: number): ActionArg {
  const owe = toCall(t, seat);
  const stack = t.stacks[seat].toNumber();
  const r = Math.random();
  if (owe === 0) {
    if (r < 0.2 && t.stacks[1 - seat].toNumber() > 0) {
      const to = t.bets[1 - seat].toNumber() + Math.max(t.lastRaise.toNumber(), 4);
      return to >= stack + t.bets[seat].toNumber() ? { allIn: {} } : { raise: { to: new BN(to) } };
    }
    return { check: {} };
  }
  if (owe > stack * 0.6 && r < 0.35) return { fold: {} };
  return { call: {} };
}

export function actionLabel(a: ActionArg): string {
  if ("raise" in a) return `raise to ${a.raise.to.toString()}`;
  if ("allIn" in a) return "all-in";
  return Object.keys(a)[0];
}
