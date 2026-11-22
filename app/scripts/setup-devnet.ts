// One-time devnet setup: test USDC mint, demo card mints, price table, treasury.
// Mint authority is moved to the config PDA so `claim_starter_pack` can mint.
// Usage: yarn setup-devnet  (uses ~/.config/solana/id.json as admin)
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  AuthorityType,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
} from "@solana/spl-token";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

const RPC = process.env.RPC || "https://api.devnet.solana.com";
const idl = JSON.parse(readFileSync("src/idl/card_poker.json", "utf8"));
const admin = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8")),
  ),
);
const connection = new Connection(RPC, "confirmed");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), {
  commitment: "confirmed",
});
const program = new Program(idl, provider);
const pda = (...seeds: Buffer[]) =>
  PublicKey.findProgramAddressSync(seeds, program.programId)[0];
const config = pda(Buffer.from("config"));

const USDC = 1_000_000;
const CARDS = [
  { name: "Ember Drake", rarity: "Legendary", hue: 12, glyph: "✹", price: 120 },
  { name: "Tidal Leviathan", rarity: "Epic", hue: 200, glyph: "≋", price: 90 },
  { name: "Storm Owl", rarity: "Rare", hue: 265, glyph: "☾", price: 60 },
  { name: "Moss Golem", rarity: "Common", hue: 120, glyph: "◆", price: 40 },
  { name: "Void Fox", rarity: "Epic", hue: 300, glyph: "✦", price: 100 },
  { name: "Solar Phoenix", rarity: "Legendary", hue: 42, glyph: "☀", price: 150 },
];
const TREASURY_USDC = 1_000_000;

async function main() {
  console.log("admin", admin.publicKey.toBase58(), "program", program.programId.toBase58());
  const usdcMint = await createMint(connection, admin, admin.publicKey, null, 6);
  console.log("USDC mint", usdcMint.toBase58());

  const treasury = await getOrCreateAssociatedTokenAccount(
    connection, admin, usdcMint, config, true,
  );
  await mintTo(connection, admin, usdcMint, treasury.address, admin, TREASURY_USDC * USDC);
  await setAuthority(connection, admin, usdcMint, admin, AuthorityType.MintTokens, config);

  await program.methods
    .initConfig(usdcMint, true)
    .accountsPartial({ config, admin: admin.publicKey })
    .rpc();

  const out: object[] = [];
  for (const card of CARDS) {
    const mint = await createMint(connection, admin, admin.publicKey, null, 0);
    await setAuthority(connection, admin, mint, admin, AuthorityType.MintTokens, config);
    const ix = await program.methods
      .setCardPrice(new BN(card.price * USDC))
      .accountsPartial({
        config,
        cardMint: mint,
        cardPrice: pda(Buffer.from("price"), mint.toBuffer()),
        admin: admin.publicKey,
      })
      .instruction();
    await sendAndConfirmTransaction(connection, new Transaction().add(ix), [admin]);
    console.log(card.name, mint.toBase58());
    const { price: _price, ...meta } = card;
    out.push({ ...meta, mint: mint.toBase58() });
  }
  writeFileSync(
    "src/lib/deployment.json",
    JSON.stringify({ usdcMint: usdcMint.toBase58(), cards: out }, null, 2) + "\n",
  );
  console.log("wrote src/lib/deployment.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
