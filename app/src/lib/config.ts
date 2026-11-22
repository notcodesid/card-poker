import { PublicKey } from "@solana/web3.js";
import rawIdl from "../idl/card_poker.json";
import deployment from "./deployment.json";

const env: Record<string, string | undefined> = import.meta.env ?? {};

export const PROGRAM_ID = new PublicKey(env.VITE_PROGRAM_ID || rawIdl.address);

export const BASE_ENDPOINT: string =
  env.VITE_BASE_ENDPOINT || "https://rpc.magicblock.app/devnet";
export const TEE_ENDPOINT: string =
  env.VITE_TEE_ENDPOINT || "https://devnet-tee.magicblock.app";
export const TEE_WS_ENDPOINT: string =
  env.VITE_TEE_WS_ENDPOINT || TEE_ENDPOINT.replace(/^http/, "ws");

/** TEE validator the table PDAs are delegated to. */
export const ER_VALIDATOR = new PublicKey(
  env.VITE_VALIDATOR || "MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo",
);
export const VAULT_ID = new PublicKey(
  "MagicVau1t999999999999999999999999999999999",
);

export const SEEDS = {
  table: "table",
  deck: "deck",
  hand: "hand",
  vault: "vault",
  config: "config",
  price: "price",
} as const;

export const USDC_DECIMALS = 6;
export const USDC_MINT = new PublicKey(deployment.usdcMint);

export interface CardInfo {
  mint: PublicKey;
  name: string;
  rarity: "Common" | "Rare" | "Epic" | "Legendary";
  hue: number;
  glyph: string;
}

/** Demo collectible cards created by `yarn setup-devnet`. Prices live on-chain. */
export const CARDS: CardInfo[] = deployment.cards.map((c) => ({
  ...c,
  mint: new PublicKey(c.mint),
  rarity: c.rarity as CardInfo["rarity"],
}));

export const cardByMint = (mint: PublicKey): CardInfo | undefined =>
  CARDS.find((c) => c.mint.equals(mint));

export const PLAYER_STORAGE_KEY = "card-poker-player";
export const BOT_STORAGE_KEY = "card-poker-bot";

export const MIN_PLAY_SOL = 0.05;
export const BOT_FUND_SOL = 0.05;
export const POLL_MS = 1200;

export const STARTING_STACK = 100;
export const SMALL_BLIND = 1;

export const baseExplorerTxUrl = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
