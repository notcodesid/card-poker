//! Heads-up Texas Hold'em on MagicBlock Private Ephemeral Rollups.
//!
//! Base layer: trading-card escrow with USDC value matching, optional SOL stake,
//! payout of both cards to the winner, and an instant sell-back treasury.
//! Private ER: shuffle, private hole cards, betting, showdown.
//!
//! Accounts per table:
//! - `Table` (public): betting state, community cards, revealed showdown hands.
//! - `Deck` (private, no members): the shuffled deck. Nobody can read it.
//! - `Hand` x2 (private, owner only): hole cards and the player's shuffle entropy.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use ephemeral_rollups_sdk::access_control::instructions::CreateEphemeralPermissionCpi;
use ephemeral_rollups_sdk::access_control::structs::{
    EphemeralMembersArgs, EphemeralPermission, Member, AUTHORITY_FLAG, TX_LOGS_FLAG,
};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;

pub mod poker;

use poker::{evaluate7, shuffle, DECK_SIZE, NO_CARD};

declare_id!("8inTx3PzfmU6iYqbTxikJ6PYWcrui9JzaWGuYRTu2zuP");

pub const TABLE_SEED: &[u8] = b"table";
pub const DECK_SEED: &[u8] = b"deck";
pub const HAND_SEED: &[u8] = b"hand";
pub const VAULT_SEED: &[u8] = b"vault";
pub const CONFIG_SEED: &[u8] = b"config";
pub const PRICE_SEED: &[u8] = b"price";
/// Test USDC (6 decimals) the demo faucet tops each wallet up to.
pub const FAUCET_USDC: u64 = 500_000_000;

pub const NO_WINNER: u8 = u8::MAX;
/// Seconds a player has to act before the opponent can fold them with `claim_timeout`.
pub const TURN_TIMEOUT_SECS: i64 = 60;
pub const SPLIT_POT: u8 = 2;

#[ephemeral]
#[program]
pub mod card_poker {
    use super::*;

    /// Base layer. Creates the table, deck and the creator's hand, and escrows the stake.
    pub fn create_table(
        ctx: Context<CreateTable>,
        table_id: u64,
        stake: u64,
        starting_stack: u64,
        small_blind: u64,
        max_top_up: u64,
    ) -> Result<()> {
        require!(small_blind > 0, PokerError::InvalidConfig);
        require!(
            stake == 0 || stake >= Rent::get()?.minimum_balance(0),
            PokerError::StakeBelowRent
        );
        require!(
            starting_stack >= small_blind.checked_mul(4).ok_or(PokerError::MathOverflow)?,
            PokerError::InvalidConfig
        );
        let player = &ctx.accounts.player1;
        let sys = &ctx.accounts.system_program;
        fund(
            sys,
            player,
            &ctx.accounts.table.to_account_info(),
            permission_rent(0),
        )?;
        fund(
            sys,
            player,
            &ctx.accounts.deck.to_account_info(),
            permission_rent(0),
        )?;
        fund(
            sys,
            player,
            &ctx.accounts.hand.to_account_info(),
            permission_rent(1),
        )?;
        if stake > 0 {
            fund(sys, player, &ctx.accounts.vault.to_account_info(), stake)?;
        }

        let a = &ctx.accounts;
        token_transfer(
            &a.token_program,
            &a.player_card,
            &a.vault_card,
            player,
            1,
            None,
        )?;
        token_transfer(
            &a.token_program,
            &a.player_usdc,
            &a.vault_usdc,
            player,
            max_top_up,
            None,
        )?;

        let table = &mut ctx.accounts.table;
        table.card_mints[0] = ctx.accounts.card_mint.key();
        table.card_values[0] = ctx.accounts.card_price.price;
        table.top_ups[0] = max_top_up;
        table.table_id = table_id;
        table.player1 = player.key();
        table.player2 = Pubkey::default();
        table.stake = stake;
        table.starting_stack = starting_stack;
        table.small_blind = small_blind;
        table.stacks = [starting_stack, starting_stack];
        table.phase = Phase::Waiting;
        table.board = [NO_CARD; 5];
        table.showdown = [NO_CARD; 4];
        table.last_hand_winner = NO_WINNER;
        table.match_winner = NO_WINNER;

        ctx.accounts.deck.table_id = table_id;
        ctx.accounts.deck.player1 = player.key();
        ctx.accounts.deck.cards = [NO_CARD; DECK_SIZE];
        init_hand(&mut ctx.accounts.hand, table_id, player.key());
        Ok(())
    }

    /// Base layer. Second player joins and escrows the same stake.
    pub fn join_table(ctx: Context<JoinTable>, _table_id: u64) -> Result<()> {
        let table = &ctx.accounts.table;
        let player = &ctx.accounts.player2;
        require!(table.phase == Phase::Waiting, PokerError::TableFull);
        require_keys_neq!(table.player1, player.key(), PokerError::CannotJoinOwnTable);
        let sys = &ctx.accounts.system_program;
        fund(
            sys,
            player,
            &ctx.accounts.hand.to_account_info(),
            permission_rent(1),
        )?;
        if table.stake > 0 {
            fund(
                sys,
                player,
                &ctx.accounts.vault.to_account_info(),
                table.stake,
            )?;
        }
        let a = &ctx.accounts;
        require_keys_neq!(a.card_mint.key(), table.card_mints[0], PokerError::SameCard);
        token_transfer(
            &a.token_program,
            &a.player_card,
            &a.vault_card,
            player,
            1,
            None,
        )?;

        // Value matching: the cheaper card's owner tops up the gap in USDC.
        // The creator pre-escrowed `top_ups[0]` as an allowance; unused allowance is refunded now.
        let creator_value = table.card_values[0];
        let joiner_value = a.card_price.price;
        let allowance = table.top_ups[0];
        let (creator_top_up, joiner_top_up) = if joiner_value > creator_value {
            let gap = joiner_value - creator_value;
            require!(gap <= allowance, PokerError::TopUpAllowanceTooLow);
            (gap, 0)
        } else {
            (0, creator_value - joiner_value)
        };
        token_transfer(
            &a.token_program,
            &a.player_usdc,
            &a.vault_usdc,
            player,
            joiner_top_up,
            None,
        )?;
        let id = table.table_id.to_le_bytes();
        let seeds: &[&[&[u8]]] = &[&[VAULT_SEED, &id, &[ctx.bumps.vault]]];
        token_transfer(
            &a.token_program,
            &a.vault_usdc,
            &a.creator_usdc,
            &a.vault,
            allowance - creator_top_up,
            Some(seeds),
        )?;

        let table_id = table.table_id;
        let table = &mut ctx.accounts.table;
        table.card_mints[1] = ctx.accounts.card_mint.key();
        table.card_values[1] = joiner_value;
        table.top_ups = [creator_top_up, joiner_top_up];
        table.player2 = player.key();
        table.phase = Phase::Ready;
        init_hand(&mut ctx.accounts.hand, table_id, player.key());
        Ok(())
    }

    /// Base layer. Creator takes their stake back if nobody joined.
    pub fn cancel_table(ctx: Context<CancelTable>) -> Result<()> {
        let table = &mut ctx.accounts.table;
        require!(table.phase == Phase::Waiting, PokerError::AlreadyStarted);
        let stake = table.stake;
        table.phase = Phase::Finished;
        table.paid = true;
        let id = table.table_id.to_le_bytes();
        let seeds: &[&[&[u8]]] = &[&[VAULT_SEED, &id, &[ctx.bumps.vault]]];
        table.top_ups[0] = 0;
        let a = &ctx.accounts;
        token_transfer(
            &a.token_program,
            &a.vault_card,
            &a.player_card,
            &a.vault,
            a.vault_card.amount,
            Some(seeds),
        )?;
        token_transfer(
            &a.token_program,
            &a.vault_usdc,
            &a.player_usdc,
            &a.vault,
            a.vault_usdc.amount,
            Some(seeds),
        )?;
        let rent_to = a.player1.to_account_info();
        close_vault_token_account(&a.token_program, &a.vault_card, &rent_to, &a.vault, seeds)?;
        close_vault_token_account(&a.token_program, &a.vault_usdc, &rent_to, &a.vault, seeds)?;
        pay_from_vault(
            &a.vault,
            &a.player1.to_account_info(),
            stake,
            &a.system_program,
            seeds,
        )
    }

    /// Private ER. Each player mixes secret entropy into every shuffle.
    /// The hand account is private to its owner, so the opponent never sees it.
    pub fn commit_seed(ctx: Context<CommitSeed>, seed: [u8; 32]) -> Result<()> {
        let hand = &mut ctx.accounts.hand;
        require_keys_eq!(
            hand.player,
            ctx.accounts.player.key(),
            PokerError::NotAPlayer
        );
        hand.seed = seed;
        hand.seed_set = true;
        Ok(())
    }

    /// Private ER. Shuffles the deck from both players' secret seeds, deals hole
    /// cards into the private hand accounts and posts the blinds.
    pub fn start_hand(ctx: Context<TableAction>) -> Result<()> {
        let TableAction {
            table,
            deck,
            hand1,
            hand2,
            player,
        } = ctx.accounts;
        table.seat_of(&player.key())?;
        require!(table.phase == Phase::Ready, PokerError::WrongPhase);
        require!(hand1.seed_set && hand2.seed_set, PokerError::SeedMissing);

        table.hand_no = table
            .hand_no
            .checked_add(1)
            .ok_or(PokerError::MathOverflow)?;
        let clock = Clock::get()?;
        let seed = solana_sha256_hasher::hashv(&[
            hand1.seed.as_ref(),
            hand2.seed.as_ref(),
            &table.table_id.to_le_bytes(),
            &table.hand_no.to_le_bytes(),
            &clock.slot.to_le_bytes(),
        ])
        .to_bytes();
        deck.cards = shuffle(seed);
        hand1.cards = [deck.cards[0], deck.cards[2]];
        hand2.cards = [deck.cards[1], deck.cards[3]];
        deck.next = 4;

        table.board = [NO_CARD; 5];
        table.board_len = 0;
        table.showdown = [NO_CARD; 4];
        table.last_hand_winner = NO_WINNER;
        table.pot = 0;
        table.bets = [0, 0];
        table.acted = [false, false];
        table.last_raise = table.big_blind();
        table.phase = Phase::PreFlop;

        // Heads-up: the dealer posts the small blind and acts first pre-flop.
        let dealer = table.dealer as usize;
        let sb = table.small_blind;
        let bb = table.big_blind();
        table.put(dealer, sb);
        table.put(1 - dealer, bb);
        table.to_act = table.dealer;
        table.turn_started_at = Clock::get()?.unix_timestamp;
        progress(table, deck, hand1, hand2)
    }

    /// Private ER. The player whose turn it is checks, calls, raises, goes all-in or folds.
    pub fn act(ctx: Context<TableAction>, action: Action) -> Result<()> {
        let TableAction {
            table,
            deck,
            hand1,
            hand2,
            player,
        } = ctx.accounts;
        let seat = table.seat_of(&player.key())?;
        require!(table.phase.is_betting(), PokerError::WrongPhase);
        require!(table.to_act as usize == seat, PokerError::NotYourTurn);
        let opp = 1 - seat;
        let to_call = table.bets[opp].saturating_sub(table.bets[seat]);

        match action {
            Action::Fold => {
                table.collect_bets();
                table.award(opp as u8);
                return end_hand(table);
            }
            Action::Check => require!(to_call == 0, PokerError::CannotCheck),
            Action::Call => {
                require!(to_call > 0, PokerError::NothingToCall);
                let amount = to_call.min(table.stacks[seat]);
                table.put(seat, amount);
            }
            Action::Raise { to } => {
                let max = table.stacks[seat] + table.bets[seat];
                require!(to <= max, PokerError::InsufficientChips);
                raise_to(table, seat, to, to == max)?;
            }
            Action::AllIn => {
                let max = table.stacks[seat] + table.bets[seat];
                if max > table.bets[opp] {
                    raise_to(table, seat, max, true)?;
                } else {
                    let amount = table.stacks[seat];
                    table.put(seat, amount);
                }
            }
        }
        table.acted[seat] = true;
        table.to_act = opp as u8;
        table.turn_started_at = Clock::get()?.unix_timestamp;
        progress(table, deck, hand1, hand2)
    }

    /// Private ER. If the player to act has stalled for `TURN_TIMEOUT_SECS`, their
    /// opponent folds them.
    pub fn claim_timeout(ctx: Context<TableAction>) -> Result<()> {
        let table = &mut ctx.accounts.table;
        let seat = table.seat_of(&ctx.accounts.player.key())?;
        require!(table.phase.is_betting(), PokerError::WrongPhase);
        require!(table.to_act as usize != seat, PokerError::NotTimedOut);
        let now = Clock::get()?.unix_timestamp;
        require!(
            now >= table.turn_started_at + TURN_TIMEOUT_SECS,
            PokerError::NotTimedOut
        );
        table.collect_bets();
        table.award(seat as u8);
        end_hand(table)
    }

    /// Private ER. Once the match is decided, commits all game accounts back to
    /// Solana and returns them to this program. Hole cards stay unrevealed unless
    /// the hand went to showdown.
    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        require!(
            ctx.accounts.table.phase == Phase::Finished,
            PokerError::MatchNotDecided
        );
        // Committed data becomes public on Solana: wipe the deck, hole cards and seeds first.
        // Showdown hands were already copied to the public table.
        let deck = &mut ctx.accounts.deck;
        deck.cards = [NO_CARD; DECK_SIZE];
        deck.next = 0;
        for hand in [&mut ctx.accounts.hand1, &mut ctx.accounts.hand2] {
            hand.cards = [NO_CARD; 2];
            hand.seed = [0; 32];
            hand.seed_set = false;
        }
        ctx.accounts.deck.exit(&crate::ID)?;
        ctx.accounts.hand1.exit(&crate::ID)?;
        ctx.accounts.hand2.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[
            ctx.accounts.table.to_account_info(),
            ctx.accounts.deck.to_account_info(),
            ctx.accounts.hand1.to_account_info(),
            ctx.accounts.hand2.to_account_info(),
        ])
        .build_and_invoke()?;
        Ok(())
    }

    /// Base layer. Pays the whole escrow to the match winner. Anyone can trigger it.
    pub fn claim_pot(ctx: Context<ClaimPot>) -> Result<()> {
        let table = &mut ctx.accounts.table;
        require!(table.phase == Phase::Finished, PokerError::MatchNotDecided);
        require!(!table.paid, PokerError::AlreadyPaid);
        let winner = match table.match_winner {
            0 => table.player1,
            1 => table.player2,
            _ => return err!(PokerError::MatchNotDecided),
        };
        require_keys_eq!(ctx.accounts.winner.key(), winner, PokerError::WrongWinner);
        table.paid = true;
        let amount = table.stake.checked_mul(2).ok_or(PokerError::MathOverflow)?;
        let id = table.table_id.to_le_bytes();
        let seeds: &[&[&[u8]]] = &[&[VAULT_SEED, &id, &[ctx.bumps.vault]]];
        let a = &ctx.accounts;
        token_transfer(
            &a.token_program,
            &a.vault_card1,
            &a.winner_card1,
            &a.vault,
            a.vault_card1.amount,
            Some(seeds),
        )?;
        token_transfer(
            &a.token_program,
            &a.vault_card2,
            &a.winner_card2,
            &a.vault,
            a.vault_card2.amount,
            Some(seeds),
        )?;
        token_transfer(
            &a.token_program,
            &a.vault_usdc,
            &a.winner_usdc,
            &a.vault,
            a.vault_usdc.amount,
            Some(seeds),
        )?;
        let rent_to = a.winner.to_account_info();
        for account in [&a.vault_card1, &a.vault_card2, &a.vault_usdc] {
            close_vault_token_account(&a.token_program, account, &rent_to, &a.vault, seeds)?;
        }
        pay_from_vault(
            &a.vault,
            &a.winner.to_account_info(),
            amount,
            &a.system_program,
            seeds,
        )
    }

    /// Base layer. One-time setup of the card price table admin and the stablecoin mint.
    pub fn init_config(
        ctx: Context<InitConfig>,
        usdc_mint: Pubkey,
        faucet_enabled: bool,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.usdc_mint = usdc_mint;
        config.faucet_enabled = faucet_enabled;
        Ok(())
    }

    /// Base layer. Admin sets the USDC value of a card mint (used for stake matching and sell-back).
    pub fn set_card_price(ctx: Context<SetCardPrice>, price: u64) -> Result<()> {
        let card_price = &mut ctx.accounts.card_price;
        card_price.mint = ctx.accounts.card_mint.key();
        card_price.price = price;
        Ok(())
    }

    /// Base layer. Instantly sells a card to the treasury at its listed price.
    pub fn sell_card(ctx: Context<SellCard>) -> Result<()> {
        let a = &ctx.accounts;
        require!(a.card_price.price > 0, PokerError::CardNotListed);
        token_transfer(
            &a.token_program,
            &a.seller_card,
            &a.treasury_card,
            &a.seller,
            1,
            None,
        )?;
        let seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[ctx.bumps.config]]];
        token_transfer(
            &a.token_program,
            &a.treasury_usdc,
            &a.seller_usdc,
            &a.config.to_account_info(),
            a.card_price.price,
            Some(seeds),
        )
    }

    /// Base layer, demo deployments only. Gives the caller one copy of a listed card
    /// (if they hold none) and tops their test USDC up to `FAUCET_USDC`. Both mints
    /// must have the config PDA as mint authority.
    pub fn claim_starter_pack(ctx: Context<ClaimStarterPack>) -> Result<()> {
        let a = &ctx.accounts;
        require!(a.config.faucet_enabled, PokerError::FaucetDisabled);
        require!(a.card_price.price > 0, PokerError::CardNotListed);
        let seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[ctx.bumps.config]]];
        if a.user_card.amount == 0 {
            mint_from_config(
                &a.token_program,
                &a.card_mint,
                &a.user_card,
                &a.config,
                1,
                seeds,
            )?;
        }
        if a.user_usdc.amount < FAUCET_USDC {
            let amount = FAUCET_USDC - a.user_usdc.amount;
            mint_from_config(
                &a.token_program,
                &a.usdc_mint,
                &a.user_usdc,
                &a.config,
                amount,
                seeds,
            )?;
        }
        Ok(())
    }

    /// Base layer. Delegates a table PDA to the (TEE) ER validator.
    /// Only the owning player may delegate their hand or the deck, and the table only
    /// after both players are seated.
    pub fn delegate_pda(ctx: Context<DelegatePda>, account_type: AccountType) -> Result<()> {
        let payer = ctx.accounts.payer.key();
        {
            let data = ctx.accounts.pda.try_borrow_data()?;
            match &account_type {
                AccountType::Table { .. } => {
                    let table = Table::try_deserialize(&mut &data[..])?;
                    require!(table.phase != Phase::Waiting, PokerError::WrongPhase);
                    table.seat_of(&payer)?;
                }
                AccountType::Deck { .. } => {
                    let deck = Deck::try_deserialize(&mut &data[..])?;
                    require_keys_eq!(deck.player1, payer, PokerError::NotAPlayer);
                }
                AccountType::Hand { player, .. } => {
                    require_keys_eq!(*player, payer, PokerError::NotAPlayer);
                }
            }
        }
        let seed_data = account_type.seeds();
        let seeds_refs: Vec<&[u8]> = seed_data.iter().map(|s| s.as_slice()).collect();
        let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &seeds_refs,
            DelegateConfig {
                validator,
                ..Default::default()
            },
        )?;
        Ok(())
    }

    /// Private ER. Creates the access-control permission for a delegated PDA.
    /// The PDA pays its own permission rent (pre-funded on the base layer).
    /// Membership is fixed per account type: table public, deck hidden from everyone,
    /// hand private to its owner.
    pub fn init_permission(ctx: Context<InitPermission>, account_type: AccountType) -> Result<()> {
        if ctx.accounts.permission.lamports() > 0 {
            return Ok(());
        }
        let mut seeds = account_type.seeds();
        let (expected, bump) = Pubkey::find_program_address(
            &seeds.iter().map(|s| s.as_slice()).collect::<Vec<_>>(),
            &crate::ID,
        );
        require_keys_eq!(
            expected,
            ctx.accounts.permissioned_account.key(),
            PokerError::WrongAccount
        );
        seeds.push(vec![bump]);
        let seed_refs: Vec<&[u8]> = seeds.iter().map(|s| s.as_slice()).collect();
        let (is_private, members) = match account_type {
            AccountType::Table { .. } => (false, vec![]),
            AccountType::Deck { .. } => (true, vec![]),
            AccountType::Hand { player, .. } => (
                true,
                vec![Member {
                    flags: AUTHORITY_FLAG | TX_LOGS_FLAG,
                    pubkey: player,
                }],
            ),
        };
        CreateEphemeralPermissionCpi {
            payer: ctx.accounts.permissioned_account.to_account_info(),
            permissioned_account: ctx.accounts.permissioned_account.to_account_info(),
            permission: ctx.accounts.permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            args: EphemeralMembersArgs {
                is_private,
                members,
            },
        }
        .invoke_signed(&[seed_refs.as_slice()])?;
        Ok(())
    }
}

fn raise_to(table: &mut Table, seat: usize, to: u64, all_in: bool) -> Result<()> {
    let opp = 1 - seat;
    require!(to > table.bets[opp], PokerError::RaiseTooSmall);
    require!(table.stacks[opp] > 0, PokerError::OpponentAllIn);
    let raise_by = to - table.bets[opp];
    require!(
        raise_by >= table.last_raise || all_in,
        PokerError::RaiseTooSmall
    );
    if raise_by >= table.last_raise {
        table.last_raise = raise_by;
    }
    let amount = to - table.bets[seat];
    table.put(seat, amount);
    table.acted[opp] = false;
    Ok(())
}

/// Advances streets while the current betting round is closed, and runs the
/// board out to showdown when a player is all-in.
fn progress(table: &mut Table, deck: &mut Deck, hand1: &Hand, hand2: &Hand) -> Result<()> {
    loop {
        if !table.street_done() {
            let seat = table.to_act as usize;
            if table.stacks[seat] == 0 {
                table.to_act = (1 - seat) as u8;
            }
            return Ok(());
        }
        table.collect_bets();
        let someone_all_in = table.stacks[0] == 0 || table.stacks[1] == 0;
        let next = match table.phase {
            Phase::PreFlop => Phase::Flop,
            Phase::Flop => Phase::Turn,
            Phase::Turn => Phase::River,
            _ => Phase::Showdown,
        };
        if next == Phase::Showdown {
            return showdown(table, hand1, hand2);
        }
        let cards = if next == Phase::Flop { 3 } else { 1 };
        for _ in 0..cards {
            table.board[table.board_len as usize] = deck.cards[deck.next as usize];
            table.board_len += 1;
            deck.next += 1;
        }
        table.phase = next;
        table.to_act = 1 - table.dealer;
        if someone_all_in {
            table.acted = [true, true];
        }
    }
}

fn showdown(table: &mut Table, hand1: &Hand, hand2: &Hand) -> Result<()> {
    let score = |h: &Hand| {
        let b = table.board;
        evaluate7(&[h.cards[0], h.cards[1], b[0], b[1], b[2], b[3], b[4]])
    };
    let (s1, s2) = (score(hand1), score(hand2));
    table.showdown = [
        hand1.cards[0],
        hand1.cards[1],
        hand2.cards[0],
        hand2.cards[1],
    ];
    table.phase = Phase::Showdown;
    let winner = match s1.cmp(&s2) {
        std::cmp::Ordering::Greater => 0,
        std::cmp::Ordering::Less => 1,
        std::cmp::Ordering::Equal => SPLIT_POT,
    };
    table.award(winner);
    end_hand(table)
}

fn end_hand(table: &mut Table) -> Result<()> {
    if table.stacks[0] == 0 || table.stacks[1] == 0 {
        table.match_winner = if table.stacks[0] == 0 { 1 } else { 0 };
        table.phase = Phase::Finished;
    } else {
        table.phase = Phase::Ready;
        table.dealer = 1 - table.dealer;
    }
    Ok(())
}

fn init_hand(hand: &mut Hand, table_id: u64, player: Pubkey) {
    hand.table_id = table_id;
    hand.player = player;
    hand.cards = [NO_CARD; 2];
}

fn token_transfer<'info>(
    token_program: &Program<'info, Token>,
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    authority: &impl ToAccountInfo<'info>,
    amount: u64,
    signer_seeds: Option<&[&[&[u8]]]>,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let accounts = token::Transfer {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: authority.to_account_info(),
    };
    let ctx = CpiContext::new(token_program.key(), accounts);
    token::transfer(
        match signer_seeds {
            Some(seeds) => ctx.with_signer(seeds),
            None => ctx,
        },
        amount,
    )
}

/// Closes an emptied vault-owned token account, returning its rent to `destination`.
fn close_vault_token_account<'info>(
    token_program: &Program<'info, Token>,
    account: &Account<'info, TokenAccount>,
    destination: &AccountInfo<'info>,
    vault: &SystemAccount<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    token::close_account(
        CpiContext::new(
            token_program.key(),
            token::CloseAccount {
                account: account.to_account_info(),
                destination: destination.clone(),
                authority: vault.to_account_info(),
            },
        )
        .with_signer(signer_seeds),
    )
}

fn mint_from_config<'info>(
    token_program: &Program<'info, Token>,
    mint: &Account<'info, Mint>,
    to: &Account<'info, TokenAccount>,
    config: &Account<'info, Config>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let accounts = token::MintTo {
        mint: mint.to_account_info(),
        to: to.to_account_info(),
        authority: config.to_account_info(),
    };
    token::mint_to(
        CpiContext::new(token_program.key(), accounts).with_signer(signer_seeds),
        amount,
    )
}

fn permission_rent(members: usize) -> u64 {
    ephemeral_rollups_sdk::ephemeral_accounts::rent(EphemeralPermission::size_of(members) as u32)
}

fn fund<'info>(
    system_program: &Program<'info, System>,
    from: &Signer<'info>,
    to: &AccountInfo<'info>,
    lamports: u64,
) -> Result<()> {
    transfer(
        CpiContext::new(
            system_program.key(),
            Transfer {
                from: from.to_account_info(),
                to: to.clone(),
            },
        ),
        lamports,
    )
}

fn pay_from_vault<'info>(
    vault: &SystemAccount<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
    system_program: &Program<'info, System>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    transfer(
        CpiContext::new_with_signer(
            system_program.key(),
            Transfer {
                from: vault.to_account_info(),
                to: to.clone(),
            },
            signer_seeds,
        ),
        amount,
    )
}

#[derive(Accounts)]
#[instruction(table_id: u64)]
pub struct CreateTable<'info> {
    #[account(init, payer = player1, space = 8 + Table::INIT_SPACE, seeds = [TABLE_SEED, &table_id.to_le_bytes()], bump)]
    pub table: Account<'info, Table>,
    #[account(init, payer = player1, space = 8 + Deck::INIT_SPACE, seeds = [DECK_SEED, &table_id.to_le_bytes()], bump)]
    pub deck: Account<'info, Deck>,
    #[account(init, payer = player1, space = 8 + Hand::INIT_SPACE, seeds = [HAND_SEED, &table_id.to_le_bytes(), player1.key().as_ref()], bump)]
    pub hand: Account<'info, Hand>,
    #[account(mut, seeds = [VAULT_SEED, &table_id.to_le_bytes()], bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub player1: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, Config>>,
    pub card_mint: Box<Account<'info, Mint>>,
    #[account(seeds = [PRICE_SEED, card_mint.key().as_ref()], bump)]
    pub card_price: Box<Account<'info, CardPrice>>,
    #[account(mut, token::mint = card_mint, token::authority = player1)]
    pub player_card: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = player1, associated_token::mint = card_mint, associated_token::authority = vault)]
    pub vault_card: Box<Account<'info, TokenAccount>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = usdc_mint, token::authority = player1)]
    pub player_usdc: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = player1, associated_token::mint = usdc_mint, associated_token::authority = vault)]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(table_id: u64)]
pub struct JoinTable<'info> {
    #[account(mut, seeds = [TABLE_SEED, &table_id.to_le_bytes()], bump)]
    pub table: Account<'info, Table>,
    #[account(init, payer = player2, space = 8 + Hand::INIT_SPACE, seeds = [HAND_SEED, &table_id.to_le_bytes(), player2.key().as_ref()], bump)]
    pub hand: Account<'info, Hand>,
    #[account(mut, seeds = [VAULT_SEED, &table_id.to_le_bytes()], bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub player2: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, Config>>,
    pub card_mint: Box<Account<'info, Mint>>,
    #[account(seeds = [PRICE_SEED, card_mint.key().as_ref()], bump)]
    pub card_price: Box<Account<'info, CardPrice>>,
    #[account(mut, token::mint = card_mint, token::authority = player2)]
    pub player_card: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = player2, associated_token::mint = card_mint, associated_token::authority = vault)]
    pub vault_card: Box<Account<'info, TokenAccount>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = usdc_mint, token::authority = player2)]
    pub player_usdc: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = player2, associated_token::mint = usdc_mint, associated_token::authority = vault)]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// Receives the creator's unused top-up allowance.
    #[account(mut, token::mint = usdc_mint, token::authority = table.player1)]
    pub creator_usdc: Box<Account<'info, TokenAccount>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelTable<'info> {
    #[account(mut, seeds = [TABLE_SEED, &table.table_id.to_le_bytes()], bump, has_one = player1)]
    pub table: Account<'info, Table>,
    #[account(mut, seeds = [VAULT_SEED, &table.table_id.to_le_bytes()], bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub player1: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, token::mint = table.card_mints[0], token::authority = player1)]
    pub player_card: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = table.card_mints[0], associated_token::authority = vault)]
    pub vault_card: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = player1)]
    pub player_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = config.usdc_mint, associated_token::authority = vault)]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitSeed<'info> {
    #[account(mut, seeds = [HAND_SEED, &hand.table_id.to_le_bytes(), player.key().as_ref()], bump)]
    pub hand: Account<'info, Hand>,
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct TableAction<'info> {
    #[account(mut, seeds = [TABLE_SEED, &table.table_id.to_le_bytes()], bump)]
    pub table: Account<'info, Table>,
    #[account(mut, seeds = [DECK_SEED, &table.table_id.to_le_bytes()], bump)]
    pub deck: Account<'info, Deck>,
    #[account(mut, seeds = [HAND_SEED, &table.table_id.to_le_bytes(), table.player1.as_ref()], bump)]
    pub hand1: Account<'info, Hand>,
    #[account(mut, seeds = [HAND_SEED, &table.table_id.to_le_bytes(), table.player2.as_ref()], bump)]
    pub hand2: Account<'info, Hand>,
    pub player: Signer<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [TABLE_SEED, &table.table_id.to_le_bytes()], bump)]
    pub table: Account<'info, Table>,
    #[account(mut, seeds = [DECK_SEED, &table.table_id.to_le_bytes()], bump)]
    pub deck: Account<'info, Deck>,
    #[account(mut, seeds = [HAND_SEED, &table.table_id.to_le_bytes(), table.player1.as_ref()], bump)]
    pub hand1: Account<'info, Hand>,
    #[account(mut, seeds = [HAND_SEED, &table.table_id.to_le_bytes(), table.player2.as_ref()], bump)]
    pub hand2: Account<'info, Hand>,
}

#[derive(Accounts)]
pub struct ClaimPot<'info> {
    #[account(mut, seeds = [TABLE_SEED, &table.table_id.to_le_bytes()], bump)]
    pub table: Account<'info, Table>,
    #[account(mut, seeds = [VAULT_SEED, &table.table_id.to_le_bytes()], bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: checked against the table's recorded match winner.
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(address = table.card_mints[0])]
    pub card_mint1: Box<Account<'info, Mint>>,
    #[account(address = table.card_mints[1])]
    pub card_mint2: Box<Account<'info, Mint>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(mut, associated_token::mint = card_mint1, associated_token::authority = vault)]
    pub vault_card1: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = card_mint2, associated_token::authority = vault)]
    pub vault_card2: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = vault)]
    pub vault_usdc: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, associated_token::mint = card_mint1, associated_token::authority = winner)]
    pub winner_card1: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, associated_token::mint = card_mint2, associated_token::authority = winner)]
    pub winner_card2: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, associated_token::mint = usdc_mint, associated_token::authority = winner)]
    pub winner_usdc: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetCardPrice<'info> {
    #[account(seeds = [CONFIG_SEED], bump, has_one = admin)]
    pub config: Account<'info, Config>,
    pub card_mint: Account<'info, Mint>,
    #[account(init_if_needed, payer = admin, space = 8 + CardPrice::INIT_SPACE, seeds = [PRICE_SEED, card_mint.key().as_ref()], bump)]
    pub card_price: Account<'info, CardPrice>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimStarterPack<'info> {
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, mint::authority = config)]
    pub card_mint: Box<Account<'info, Mint>>,
    #[account(seeds = [PRICE_SEED, card_mint.key().as_ref()], bump)]
    pub card_price: Box<Account<'info, CardPrice>>,
    #[account(init_if_needed, payer = user, associated_token::mint = card_mint, associated_token::authority = user)]
    pub user_card: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.usdc_mint, mint::authority = config)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(init_if_needed, payer = user, associated_token::mint = usdc_mint, associated_token::authority = user)]
    pub user_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SellCard<'info> {
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, Config>>,
    pub card_mint: Box<Account<'info, Mint>>,
    #[account(seeds = [PRICE_SEED, card_mint.key().as_ref()], bump)]
    pub card_price: Box<Account<'info, CardPrice>>,
    #[account(mut, token::mint = card_mint, token::authority = seller)]
    pub seller_card: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = seller, associated_token::mint = card_mint, associated_token::authority = config)]
    pub treasury_card: Box<Account<'info, TokenAccount>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = config)]
    pub treasury_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = usdc_mint, token::authority = seller)]
    pub seller_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    /// Lets anyone mint starter cards and test USDC (devnet demo only).
    pub faucet_enabled: bool,
}

/// USDC value (base units) of one card of `mint`.
#[account]
#[derive(InitSpace)]
pub struct CardPrice {
    pub mint: Pubkey,
    pub price: u64,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePda<'info> {
    /// CHECK: the PDA to delegate; seeds are derived from `account_type`.
    #[account(mut, del)]
    pub pda: UncheckedAccount<'info>,
    pub payer: Signer<'info>,
    /// CHECK: checked by the delegation program
    pub validator: Option<UncheckedAccount<'info>>,
}

#[derive(Accounts)]
pub struct InitPermission<'info> {
    /// CHECK: delegated PDA being gated; checked against `account_type` seeds.
    #[account(mut)]
    pub permissioned_account: UncheckedAccount<'info>,
    /// CHECK: verified by the permission program
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: permission program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: ephemeral vault
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: magic program
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Table {
    pub table_id: u64,
    pub player1: Pubkey,
    pub player2: Pubkey,
    /// Lamports escrowed by each player.
    pub stake: u64,
    pub starting_stack: u64,
    pub small_blind: u64,
    pub phase: Phase,
    pub hand_no: u32,
    /// Seat (0 or 1) holding the dealer button.
    pub dealer: u8,
    pub to_act: u8,
    pub stacks: [u64; 2],
    /// Chips put in during the current street.
    pub bets: [u64; 2],
    pub acted: [bool; 2],
    pub pot: u64,
    pub last_raise: u64,
    pub board: [u8; 5],
    pub board_len: u8,
    /// Both players' hole cards, public only after a showdown.
    pub showdown: [u8; 4],
    /// 0 / 1 = seat, 2 = split, 255 = none.
    pub last_hand_winner: u8,
    pub match_winner: u8,
    pub paid: bool,
    /// When the current player's turn began (ER clock).
    pub turn_started_at: i64,
    /// Escrowed trading cards, by seat.
    pub card_mints: [Pubkey; 2],
    /// USDC value of each card at the time it was staked.
    pub card_values: [u64; 2],
    /// USDC each seat escrowed to match the other card's value.
    pub top_ups: [u64; 2],
}

impl Table {
    pub fn big_blind(&self) -> u64 {
        self.small_blind * 2
    }

    pub fn seat_of(&self, key: &Pubkey) -> Result<usize> {
        if *key == self.player1 {
            Ok(0)
        } else if *key == self.player2 {
            Ok(1)
        } else {
            err!(PokerError::NotAPlayer)
        }
    }

    fn put(&mut self, seat: usize, amount: u64) {
        let amount = amount.min(self.stacks[seat]);
        self.stacks[seat] -= amount;
        self.bets[seat] += amount;
    }

    fn street_done(&self) -> bool {
        // A player has nothing left to decide once they acted, are all-in, or already
        // cover an all-in opponent (who cannot be raised).
        let settled = |i: usize| {
            self.acted[i]
                || self.stacks[i] == 0
                || (self.stacks[1 - i] == 0 && self.bets[i] >= self.bets[1 - i])
        };
        if !(settled(0) && settled(1)) {
            return false;
        }
        let (lo, hi) = if self.bets[0] < self.bets[1] {
            (0, 1)
        } else {
            (1, 0)
        };
        self.bets[lo] == self.bets[hi] || self.stacks[lo] == 0
    }

    /// Moves street bets into the pot, returning any uncalled excess.
    fn collect_bets(&mut self) {
        let matched = self.bets[0].min(self.bets[1]);
        for i in 0..2 {
            self.stacks[i] += self.bets[i] - matched;
        }
        self.pot += matched * 2;
        self.bets = [0, 0];
        self.acted = [false, false];
        self.last_raise = self.big_blind();
    }

    fn award(&mut self, winner: u8) {
        match winner {
            0 | 1 => self.stacks[winner as usize] += self.pot,
            _ => {
                let half = self.pot / 2;
                self.stacks[0] += half;
                self.stacks[1] += half;
                // Odd chip goes to the player out of position (non-dealer).
                self.stacks[1 - self.dealer as usize] += self.pot - 2 * half;
            }
        }
        self.pot = 0;
        self.last_hand_winner = winner;
    }
}

#[account]
#[derive(InitSpace)]
pub struct Deck {
    pub table_id: u64,
    pub player1: Pubkey,
    pub cards: [u8; 52],
    pub next: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Hand {
    pub table_id: u64,
    pub player: Pubkey,
    pub cards: [u8; 2],
    pub seed: [u8; 32],
    pub seed_set: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Phase {
    Waiting,
    Ready,
    PreFlop,
    Flop,
    Turn,
    River,
    Showdown,
    Finished,
}

impl Phase {
    pub fn is_betting(&self) -> bool {
        matches!(
            self,
            Phase::PreFlop | Phase::Flop | Phase::Turn | Phase::River
        )
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Action {
    Fold,
    Check,
    Call,
    /// Raise (or bet) so this player's total for the street is `to`.
    Raise {
        to: u64,
    },
    AllIn,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    Table { table_id: u64 },
    Deck { table_id: u64 },
    Hand { table_id: u64, player: Pubkey },
}

impl AccountType {
    pub fn seeds(&self) -> Vec<Vec<u8>> {
        match self {
            AccountType::Table { table_id } => {
                vec![TABLE_SEED.to_vec(), table_id.to_le_bytes().to_vec()]
            }
            AccountType::Deck { table_id } => {
                vec![DECK_SEED.to_vec(), table_id.to_le_bytes().to_vec()]
            }
            AccountType::Hand { table_id, player } => vec![
                HAND_SEED.to_vec(),
                table_id.to_le_bytes().to_vec(),
                player.to_bytes().to_vec(),
            ],
        }
    }
}

#[error_code]
pub enum PokerError {
    #[msg("Invalid table configuration.")]
    InvalidConfig,
    #[msg("Table already has two players.")]
    TableFull,
    #[msg("You cannot join your own table.")]
    CannotJoinOwnTable,
    #[msg("The match has already started.")]
    AlreadyStarted,
    #[msg("Only a seated player can do this.")]
    NotAPlayer,
    #[msg("Not allowed in the current phase.")]
    WrongPhase,
    #[msg("Both players must commit a shuffle seed first.")]
    SeedMissing,
    #[msg("It is not your turn.")]
    NotYourTurn,
    #[msg("Cannot check facing a bet.")]
    CannotCheck,
    #[msg("Nothing to call.")]
    NothingToCall,
    #[msg("Not enough chips.")]
    InsufficientChips,
    #[msg("Raise is below the minimum.")]
    RaiseTooSmall,
    #[msg("Opponent is all-in; you can only call or fold.")]
    OpponentAllIn,
    #[msg("The match is not decided yet.")]
    MatchNotDecided,
    #[msg("The pot has already been paid out.")]
    AlreadyPaid,
    #[msg("Payout account is not the match winner.")]
    WrongWinner,
    #[msg("Account does not match the given account type.")]
    WrongAccount,
    #[msg("Stake must be 0 or at least the rent-exempt minimum.")]
    StakeBelowRent,
    #[msg("Both players staked the same card mint.")]
    SameCard,
    #[msg("Creator's top-up allowance does not cover the card value gap.")]
    TopUpAllowanceTooLow,
    #[msg("This card has no sell-back price.")]
    CardNotListed,
    #[msg("The demo faucet is disabled.")]
    FaucetDisabled,
    #[msg("The opponent's turn has not timed out.")]
    NotTimedOut,
    #[msg("Arithmetic overflow.")]
    MathOverflow,
}
