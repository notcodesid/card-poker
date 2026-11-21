# card-poker

Heads-up Texas Hold'em on Solana where each player's hole cards stay hidden inside a
[MagicBlock Private Ephemeral Rollup](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/how-to-guide/quickstart)
(PER). Built for Solana Blitz v10 ("Card poker" idea).

## How it works

| Layer | What happens |
| --- | --- |
| Solana (base) | `create_table` / `join_table` escrow each player's trading card (SPL mint, amount 1), the USDC top-up and an optional SOL stake in a vault PDA. `claim_pot` sends both cards, the USDC and the SOL to the match winner. `sell_card` sells a card to the treasury instantly. |
| Private ER (TEE) | `commit_seed`, `start_hand` (shuffle + deal), `act` (check / call / raise / all-in / fold), showdown. `settle` commits and undelegates everything back to Solana. |

Accounts per table:

- `Table` — **public**: stacks, bets, pot, board, whose turn, revealed hands after showdown.
- `Deck` — **private, no members**: the shuffled deck. Nobody, including the players, can read it.
- `Hand` (one per player) — **private to its owner**: hole cards and that player's shuffle seed.

The shuffle seed is `sha256(seed_p1, seed_p2, table_id, hand_no, slot)`, and each Fisher-Yates swap uses `sha256(seed || i)`. `settle` wipes the deck, hole cards and seeds before committing them to Solana. Each seed lives in its
owner's private `Hand`, so neither player can predict or bias the deck. Folded hands are never
revealed; showdown hands are copied to the public `Table`.

A match starts both players with the same chip stack (`starting_stack`, blinds
`small_blind`/`2*small_blind`) and runs hand after hand, alternating the button, until one player
has all the chips. That player wins the whole escrow.

## Card stakes and value matching

The admin runs `init_config(usdc_mint)` once, then `set_card_price(price)` for each card mint. The
price is in USDC base units and is used for stake matching and sell-back.

- `create_table(.., max_top_up)`: the creator escrows their card plus up to `max_top_up` USDC as a
  top-up allowance.
- `join_table`: the joiner escrows their card. The cheaper side covers the value gap:
  - joiner's card is cheaper: the joiner pays the gap in USDC;
  - joiner's card is more valuable: the gap comes out of the creator's allowance. The join fails
    with `TopUpAllowanceTooLow` if the allowance is too small;
  - any unused allowance goes back to the creator in the same transaction.
- `claim_pot`: the winner receives both cards, all escrowed USDC and the SOL stake.
- `sell_card`: the winner (or anyone holding a listed card) sells it to the treasury for its listed
  price. The treasury is the USDC token account owned by the `config` PDA.

## Lifecycle

0. Base (admin, once): `init_config`, `set_card_price` per card, fund the treasury USDC account.
1. Base: `create_table` + `delegate_pda(Deck)` + `delegate_pda(Hand p1)` (player 1).
2. Base: `join_table` + `delegate_pda(Table)` + `delegate_pda(Hand p2)` (player 2).
3. ER: `init_permission` per account. Membership is fixed by the program: Table public, Deck private to nobody, each Hand private to its owner. Only the owning player can delegate their Hand or the Deck, and the Table only after both players are seated.
4. ER: each player `commit_seed`.
5. ER: `start_hand`, then `act` until the hand ends; repeat `start_hand` until `phase == Finished`.
6. ER: `settle` (commit + undelegate). Base: `claim_pot`, then optionally `sell_card`.

## Build and test

Requires Solana 3.1.9 and Rust stable.

```sh
cargo test -p card-poker --lib                       # hand evaluator + shuffle unit tests
cargo build-sbf --manifest-path programs/card-poker/Cargo.toml --sbf-out-dir target/deploy
cd tests-magicsvm-rs && cargo test                   # full match on in-process MagicSVM
```

The MagicSVM suite (`tests-magicsvm-rs/`) runs the base layer and the private ER in one process.
It checks that each player can read only their own hand, that the deck is unreadable, betting
rules (blinds, min-raise, turn order, fold), all-in run-outs to showdown, chip conservation,
commit/undelegate, and the escrow payout.

`test-utils/rust` is vendored from
[magicblock-engine-examples](https://github.com/magicblock-labs/magicblock-engine-examples).

## Roadmap

- Oracle or marketplace pricing instead of the admin price table.
- Web app (wallet, TEE auth token, table UI).
- Turn timeouts via MagicBlock cranks.
