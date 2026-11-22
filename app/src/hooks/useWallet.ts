import { useCallback, useEffect, useMemo, useState } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PokerClient } from "../lib/poker";
import { loadOrCreateKeypair } from "../lib/wallet";
import { CARDS, USDC_DECIMALS, USDC_MINT } from "../lib/config";

export interface WalletState {
  sol: number;
  usdc: number;
  cards: Record<string, number>;
  prices: Record<string, number>;
}

/** Burner wallet stored in localStorage, with balances refreshed periodically. */
export function useWallet(storageKey: string) {
  const client = useMemo(
    () => new PokerClient(loadOrCreateKeypair(storageKey)),
    [storageKey],
  );
  const [state, setState] = useState<WalletState>({
    sol: 0,
    usdc: 0,
    cards: {},
    prices: {},
  });

  const refresh = useCallback(async () => {
    const [lamports, usdc, prices, ...cards] = await Promise.all([
      client.solBalance(),
      client.tokenBalance(USDC_MINT),
      client.fetchPrices(),
      ...CARDS.map((c) => client.tokenBalance(c.mint)),
    ]);
    setState({
      sol: lamports / LAMPORTS_PER_SOL,
      usdc: usdc / 10 ** USDC_DECIMALS,
      cards: Object.fromEntries(CARDS.map((c, i) => [c.mint.toBase58(), cards[i]])),
      prices: Object.fromEntries(
        [...prices.entries()].map(([k, v]) => [k, v.toNumber() / 10 ** USDC_DECIMALS]),
      ),
    });
  }, [client]);

  useEffect(() => {
    refresh().catch(() => {});
    const t = setInterval(() => refresh().catch(() => {}), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  return { client, ...state, refresh };
}
