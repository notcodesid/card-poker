import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import {
  permissionPdaFromAccount,
  getAuthToken,
  waitUntilPermissionActive,
  PERMISSION_PROGRAM_ID,
  MAGIC_PROGRAM_ID,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import rawIdl from "../idl/card_poker.json";
import type { CardPoker } from "../idl/card_poker";
import { walletAdapterFrom } from "./wallet";
import {
  BASE_ENDPOINT,
  TEE_ENDPOINT,
  TEE_WS_ENDPOINT,
  PROGRAM_ID,
  ER_VALIDATOR,
  VAULT_ID,
  SEEDS,
  USDC_MINT,
  CARDS,
  STARTING_STACK,
  SMALL_BLIND,
} from "./config";

export const NO_CARD = 255;

export type PhaseName =
  | "waiting"
  | "ready"
  | "preFlop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "finished";

export type ActionArg =
  | { fold: Record<string, never> }
  | { check: Record<string, never> }
  | { call: Record<string, never> }
  | { raise: { to: BN } }
  | { allIn: Record<string, never> };

export interface TableAccount {
  tableId: BN;
  player1: PublicKey;
  player2: PublicKey;
  stake: BN;
  startingStack: BN;
  smallBlind: BN;
  phase: Record<string, object>;
  handNo: number;
  dealer: number;
  toAct: number;
  stacks: BN[];
  bets: BN[];
  acted: boolean[];
  pot: BN;
  lastRaise: BN;
  board: number[];
  boardLen: number;
  showdown: number[];
  lastHandWinner: number;
  matchWinner: number;
  paid: boolean;
  turnStartedAt: BN;
  cardMints: PublicKey[];
  cardValues: BN[];
  topUps: BN[];
}

export interface HandAccount {
  tableId: BN;
  player: PublicKey;
  cards: number[];
  seedSet: boolean;
}

export const phaseOf = (t: TableAccount): PhaseName =>
  Object.keys(t.phase)[0] as PhaseName;

export const isBetting = (p: PhaseName) =>
  p === "preFlop" || p === "flop" || p === "turn" || p === "river";

const idl = { ...(rawIdl as object), address: PROGRAM_ID.toBase58() } as CardPoker;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const randomTableId = (): BN => {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return new BN(Array.from(bytes).reduce((a, b) => a * 256 + b, 0));
};

/**
 * One client per identity (player or bot): a base-layer connection plus a TEE
 * connection authenticated with this identity's token. The TEE only returns
 * private accounts (our own hand) to the member that owns them.
 */
export class PokerClient {
  readonly keypair: Keypair;
  readonly base: Connection;
  readonly program: Program<CardPoker>;
  private tee: Connection | null = null;
  private teeExpiry = 0;

  constructor(keypair: Keypair) {
    this.keypair = keypair;
    this.base = new Connection(BASE_ENDPOINT, "confirmed");
    const provider = new anchor.AnchorProvider(
      this.base,
      walletAdapterFrom(keypair) as anchor.Wallet,
      { commitment: "confirmed" },
    );
    this.program = new Program<CardPoker>(idl, provider);
  }

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  // ---------- PDAs ----------

  private pda(seeds: (Buffer | Uint8Array)[]): PublicKey {
    return PublicKey.findProgramAddressSync(seeds, this.program.programId)[0];
  }
  private idSeed = (id: BN) => id.toArrayLike(Buffer, "le", 8);
  tablePda = (id: BN) => this.pda([Buffer.from(SEEDS.table), this.idSeed(id)]);
  deckPda = (id: BN) => this.pda([Buffer.from(SEEDS.deck), this.idSeed(id)]);
  vaultPda = (id: BN) => this.pda([Buffer.from(SEEDS.vault), this.idSeed(id)]);
  handPda = (id: BN, player: PublicKey) =>
    this.pda([Buffer.from(SEEDS.hand), this.idSeed(id), player.toBuffer()]);
  configPda = () => this.pda([Buffer.from(SEEDS.config)]);
  pricePda = (mint: PublicKey) =>
    this.pda([Buffer.from(SEEDS.price), mint.toBuffer()]);
  ata = (owner: PublicKey, mint: PublicKey) =>
    getAssociatedTokenAddressSync(mint, owner, true);

  // ---------- connections ----------

  async teeConn(): Promise<Connection> {
    if (this.tee && Date.now() < this.teeExpiry - 60_000) return this.tee;
    const cacheKey = `card-poker-tee-${TEE_ENDPOINT}-${this.publicKey.toBase58()}`;
    let auth: { token: string; expiresAt: number } | null = null;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) auth = JSON.parse(cached);
    } catch {
      auth = null;
    }
    const expMs = (a: { expiresAt: number }) =>
      a.expiresAt > 1e12 ? a.expiresAt : a.expiresAt * 1000;
    if (!auth || expMs(auth) - Date.now() < 60_000) {
      auth = await getAuthToken(TEE_ENDPOINT, this.publicKey, (message) =>
        Promise.resolve(nacl.sign.detached(message, this.keypair.secretKey)),
      );
      localStorage.setItem(cacheKey, JSON.stringify(auth));
    }
    const base = TEE_ENDPOINT.replace(/\/$/, "");
    const ws = TEE_WS_ENDPOINT.replace(/\/$/, "");
    this.tee = new Connection(`${base}?token=${auth.token}`, {
      wsEndpoint: `${ws}?token=${auth.token}`,
      commitment: "confirmed",
    });
    this.teeExpiry = expMs(auth);
    return this.tee;
  }

  private async sendBase(ixs: TransactionInstruction[]): Promise<string> {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = this.publicKey;
    return sendAndConfirmTransaction(this.base, tx, [this.keypair], {
      skipPreflight: true,
      commitment: "confirmed",
    });
  }

  private async sendEr(ixs: TransactionInstruction[]): Promise<string> {
    const conn = await this.teeConn();
    const tx = new Transaction().add(...ixs);
    tx.feePayer = this.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(this.keypair);
    const sig = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
    });
    const res = await conn.confirmTransaction(sig, "confirmed");
    if (res.value.err) {
      throw new Error(`ER transaction failed: ${JSON.stringify(res.value.err)}`);
    }
    return sig;
  }

  private async waitOnEr(pda: PublicKey, timeoutMs = 20_000): Promise<void> {
    const conn = await this.teeConn();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await conn.getAccountInfo(pda).catch(() => null)) return;
      await sleep(500);
    }
    throw new Error(`${pda.toBase58()} did not appear on the rollup in time`);
  }

  // ---------- instruction builders ----------

  private delegateIx(pda: PublicKey, accountType: object) {
    return this.program.methods
      .delegatePda(accountType as never)
      .accountsPartial({ payer: this.publicKey, validator: ER_VALIDATOR, pda })
      .instruction();
  }

  private permissionIx(account: PublicKey, accountType: object) {
    return this.program.methods
      .initPermission(accountType as never)
      .accountsPartial({
        permissionedAccount: account,
        permission: permissionPdaFromAccount(account),
        authority: this.publicKey,
        permissionProgram: PERMISSION_PROGRAM_ID,
        ephemeralVault: VAULT_ID,
        magicProgram: MAGIC_PROGRAM_ID,
      })
      .instruction();
  }

  private commitSeedIx(id: BN) {
    const seed = Array.from(crypto.getRandomValues(new Uint8Array(32)));
    return this.program.methods
      .commitSeed(seed)
      .accountsPartial({
        hand: this.handPda(id, this.publicKey),
        player: this.publicKey,
      })
      .instruction();
  }

  private cardAccounts(id: BN, cardMint: PublicKey) {
    const vault = this.vaultPda(id);
    return {
      vault,
      config: this.configPda(),
      cardMint,
      cardPrice: this.pricePda(cardMint),
      playerCard: this.ata(this.publicKey, cardMint),
      vaultCard: this.ata(vault, cardMint),
      usdcMint: USDC_MINT,
      playerUsdc: this.ata(this.publicKey, USDC_MINT),
      vaultUsdc: this.ata(vault, USDC_MINT),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    };
  }

  private tableAccounts(t: TableAccount) {
    const id = t.tableId;
    return {
      table: this.tablePda(id),
      deck: this.deckPda(id),
      hand1: this.handPda(id, t.player1),
      hand2: this.handPda(id, t.player2),
      player: this.publicKey,
    };
  }

  // ---------- table lifecycle ----------

  /** Base: create table, escrow card + top-up allowance, delegate deck and my hand.
   *  Then ER: make my hand private to me, hide the deck from everyone, commit my seed. */
  async createTable(id: BN, cardMint: PublicKey, maxTopUp: BN): Promise<void> {
    const me = this.publicKey;
    const hand = this.handPda(id, me);
    const deck = this.deckPda(id);
    const create = await this.program.methods
      .createTable(id, new BN(0), new BN(STARTING_STACK), new BN(SMALL_BLIND), maxTopUp)
      .accountsPartial({
        table: this.tablePda(id),
        deck,
        hand,
        player1: me,
        ...this.cardAccounts(id, cardMint),
      })
      .instruction();
    await this.sendBase([
      create,
      await this.delegateIx(deck, { deck: { tableId: id } }),
      await this.delegateIx(hand, { hand: { tableId: id, player: me } }),
    ]);
    await this.waitOnEr(deck);
    await this.waitOnEr(hand);
    await this.sendEr([
      await this.permissionIx(deck, { deck: { tableId: id } }),
      await this.permissionIx(hand, { hand: { tableId: id, player: me } }),
      await this.commitSeedIx(id),
    ]);
    await waitUntilPermissionActive(TEE_ENDPOINT, hand);
  }

  /** Base: join, escrow my card (+ any top-up), delegate the table and my hand. Then ER setup. */
  async joinTable(id: BN, cardMint: PublicKey, creator: PublicKey): Promise<void> {
    const me = this.publicKey;
    const hand = this.handPda(id, me);
    const table = this.tablePda(id);
    const join = await this.program.methods
      .joinTable(id)
      .accountsPartial({
        table,
        hand,
        player2: me,
        creatorUsdc: this.ata(creator, USDC_MINT),
        ...this.cardAccounts(id, cardMint),
      })
      .instruction();
    await this.sendBase([
      join,
      await this.delegateIx(table, { table: { tableId: id } }),
      await this.delegateIx(hand, { hand: { tableId: id, player: me } }),
    ]);
    await this.waitOnEr(table);
    await this.waitOnEr(hand);
    await this.sendEr([
      await this.permissionIx(table, { table: { tableId: id } }),
      await this.permissionIx(hand, { hand: { tableId: id, player: me } }),
      await this.commitSeedIx(id),
    ]);
    await waitUntilPermissionActive(TEE_ENDPOINT, hand);
  }

  async cancelTable(t: TableAccount): Promise<string> {
    const id = t.tableId;
    const vault = this.vaultPda(id);
    const ix = await this.program.methods
      .cancelTable()
      .accountsPartial({
        table: this.tablePda(id),
        vault,
        player1: this.publicKey,
        config: this.configPda(),
        playerCard: this.ata(this.publicKey, t.cardMints[0]),
        vaultCard: this.ata(vault, t.cardMints[0]),
        playerUsdc: this.ata(this.publicKey, USDC_MINT),
        vaultUsdc: this.ata(vault, USDC_MINT),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
    return this.sendBase([ix]);
  }

  async startHand(t: TableAccount): Promise<string> {
    const ix = await this.program.methods
      .startHand()
      .accountsPartial(this.tableAccounts(t))
      .instruction();
    return this.sendEr([ix]);
  }

  async act(t: TableAccount, action: ActionArg): Promise<string> {
    const ix = await this.program.methods
      .act(action as never)
      .accountsPartial(this.tableAccounts(t))
      .instruction();
    return this.sendEr([ix]);
  }

  async claimTimeout(t: TableAccount): Promise<string> {
    const ix = await this.program.methods
      .claimTimeout()
      .accountsPartial(this.tableAccounts(t))
      .instruction();
    return this.sendEr([ix]);
  }

  /** ER: wipe secrets, commit and return all table accounts to Solana. */
  async settle(t: TableAccount): Promise<string> {
    const id = t.tableId;
    const ix = await this.program.methods
      .settle()
      .accountsPartial({
        payer: this.publicKey,
        table: this.tablePda(id),
        deck: this.deckPda(id),
        hand1: this.handPda(id, t.player1),
        hand2: this.handPda(id, t.player2),
      })
      .instruction();
    return this.sendEr([ix]);
  }

  /** Base: pay both cards, the USDC top-up and the SOL stake to the winner. */
  async claimPot(t: TableAccount): Promise<string> {
    const id = t.tableId;
    const vault = this.vaultPda(id);
    const winner = t.matchWinner === 0 ? t.player1 : t.player2;
    const [m1, m2] = t.cardMints;
    const ix = await this.program.methods
      .claimPot()
      .accountsPartial({
        table: this.tablePda(id),
        vault,
        winner,
        payer: this.publicKey,
        config: this.configPda(),
        cardMint1: m1,
        cardMint2: m2,
        usdcMint: USDC_MINT,
        vaultCard1: this.ata(vault, m1),
        vaultCard2: this.ata(vault, m2),
        vaultUsdc: this.ata(vault, USDC_MINT),
        winnerCard1: this.ata(winner, m1),
        winnerCard2: this.ata(winner, m2),
        winnerUsdc: this.ata(winner, USDC_MINT),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .instruction();
    return this.sendBase([ix]);
  }

  async waitUntilOnBase(id: BN, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const info = await this.base.getAccountInfo(this.tablePda(id)).catch(() => null);
      if (info && info.owner.equals(this.program.programId)) return;
      await sleep(1000);
    }
    throw new Error("Table did not return to Solana in time");
  }

  // ---------- collection ----------

  async claimStarterPack(cardMint: PublicKey): Promise<string> {
    const ix = await this.program.methods
      .claimStarterPack()
      .accountsPartial({
        config: this.configPda(),
        cardMint,
        cardPrice: this.pricePda(cardMint),
        userCard: this.ata(this.publicKey, cardMint),
        usdcMint: USDC_MINT,
        userUsdc: this.ata(this.publicKey, USDC_MINT),
        user: this.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .instruction();
    return this.sendBase([ix]);
  }

  async sellCard(cardMint: PublicKey): Promise<string> {
    const config = this.configPda();
    const ix = await this.program.methods
      .sellCard()
      .accountsPartial({
        config,
        cardMint,
        cardPrice: this.pricePda(cardMint),
        sellerCard: this.ata(this.publicKey, cardMint),
        treasuryCard: this.ata(config, cardMint),
        usdcMint: USDC_MINT,
        treasuryUsdc: this.ata(config, USDC_MINT),
        sellerUsdc: this.ata(this.publicKey, USDC_MINT),
        seller: this.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .instruction();
    return this.sendBase([ix]);
  }

  /** Card prices (USDC base units) keyed by mint. */
  async fetchPrices(): Promise<Map<string, BN>> {
    const infos = await this.base.getMultipleAccountsInfo(
      CARDS.map((c) => this.pricePda(c.mint)),
    );
    const out = new Map<string, BN>();
    infos.forEach((info, i) => {
      if (!info) return;
      const p = this.program.coder.accounts.decode("cardPrice", info.data);
      out.set(CARDS[i].mint.toBase58(), p.price as BN);
    });
    return out;
  }

  async tokenBalance(mint: PublicKey): Promise<number> {
    const res = await this.base
      .getTokenAccountBalance(this.ata(this.publicKey, mint))
      .catch(() => null);
    return res ? Number(res.value.amount) : 0;
  }

  async solBalance(): Promise<number> {
    return this.base.getBalance(this.publicKey);
  }

  // ---------- reads ----------

  private decodeTable(data: Buffer): TableAccount {
    return this.program.coder.accounts.decode("table", data) as TableAccount;
  }

  async fetchTableBase(id: BN): Promise<{ table: TableAccount; delegated: boolean } | null> {
    const info = await this.base.getAccountInfo(this.tablePda(id));
    if (!info) return null;
    return {
      table: this.decodeTable(info.data),
      delegated: !info.owner.equals(this.program.programId),
    };
  }

  async fetchTableEr(id: BN): Promise<TableAccount | null> {
    const conn = await this.teeConn();
    const info = await conn.getAccountInfo(this.tablePda(id));
    return info ? this.decodeTable(info.data) : null;
  }

  /** Reads my own hole cards through my authenticated TEE connection. */
  async fetchMyHand(id: BN): Promise<HandAccount | null> {
    const conn = await this.teeConn();
    const info = await conn.getAccountInfo(this.handPda(id, this.publicKey));
    if (!info) return null;
    return this.program.coder.accounts.decode("hand", info.data) as HandAccount;
  }

  /** Tries to read someone else's private account — used to show it's hidden. */
  async peek(account: PublicKey): Promise<boolean> {
    const conn = await this.teeConn();
    const info = await conn.getAccountInfo(account).catch(() => null);
    return !!info;
  }
}
