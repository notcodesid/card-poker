# card-poker

Heads-up Texas Hold'em on Solana where each player's hole cards stay hidden inside a
[MagicBlock Private Ephemeral Rollup](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/how-to-guide/quickstart)
(PER). Built for Solana Blitz v10 ("Card poker" idea).

## How it works

| Layer | What happens |
| --- | --- |
| Solana (base) | `create_table` / `join_table` escrow each player's stake in a vault PDA. `claim_pot` pays the match winner. |
| Private ER (TEE) | `commit_seed`, `start_hand` (shuffle + deal), `act` (check / call / raise / all-in / fold), showdown. `settle` commits and undelegates everything back to Solana. |

Accounts per table:

- `Table` — **public**: stacks, bets, pot, board, whose turn, revealed hands after showdown.
- `Deck` — **private, no members**: the shuffled deck. Nobody, including the players, can read it.
- `Hand` (one per player) — **private to its owner**: hole cards and that player's shuffle seed.

The shuffle seed is `sha256(seed_p1, seed_p2, table_id, hand_no, slot)`. Each seed lives in its
owner's private `Hand`, so neither player can predict or bias the deck. Folded hands are never
revealed; showdown hands are copied to the public `Table`.

A match starts both players with the same chip stack (`starting_stack`, blinds
`small_blind`/`2*small_blind`) and runs hand after hand, alternating the button, until one player
has all the chips. That player wins the whole escrow.

## Lifecycle

1. Base: `create_table` + `delegate_pda(Deck)` + `delegate_pda(Hand p1)` (player 1).
2. Base: `join_table` + `delegate_pda(Table)` + `delegate_pda(Hand p2)` (player 2).
3. ER: `init_permission` — Table public, Deck private `[]`, each Hand private `[owner]`.
4. ER: each player `commit_seed`.
5. ER: `start_hand`, then `act` until the hand ends; repeat `start_hand` until `phase == Finished`.
6. ER: `settle` (commit + undelegate). Base: `claim_pot`.

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

- Trading-card (NFT) stakes with value matching and stablecoin top-up.
- Instant sell-back vault for won cards.
- Web app (wallet, TEE auth token, table UI).
- Turn timeouts via MagicBlock cranks.
