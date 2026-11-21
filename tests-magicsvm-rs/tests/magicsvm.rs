//! End-to-end heads-up match on an in-process MagicSVM (base layer + private ER).

use {
    anchor_lang::{
        prelude::Pubkey, system_program, AccountDeserialize, Id, InstructionData, ToAccountMetas,
    },
    anchor_spl::{
        associated_token::{get_associated_token_address, spl_associated_token_account},
        token::spl_token,
    },
    card_poker::{
        accounts, instruction, AccountType, Action, Deck, Hand, Phase, Table, CONFIG_SEED,
        DECK_SEED, HAND_SEED, PRICE_SEED, TABLE_SEED, VAULT_SEED,
    },
    ephemeral_rollups_sdk::{
        access_control::structs::EphemeralPermission,
        anchor::{DelegationProgram, MagicProgram},
        consts::{EPHEMERAL_VAULT_ID, MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID},
        pda::{
            delegate_buffer_pda_from_delegated_account_and_owner_program,
            delegation_metadata_pda_from_delegated_account,
            delegation_record_pda_from_delegated_account,
        },
    },
    magicsvm::{MagicSVM, TransactionTarget},
    solana_address::Address,
    solana_instruction::{AccountMeta, Instruction},
    solana_keypair::Keypair,
    solana_native_token::LAMPORTS_PER_SOL,
    solana_signer::Signer,
    std::path::PathBuf,
    test_utils::{as_address, as_pubkey, client_ix, program_so_path, send_ixs},
};

const STAKE: u64 = LAMPORTS_PER_SOL / 10;
const STACK: u64 = 100;
const SMALL_BLIND: u64 = 1;

const USDC: u64 = 1_000_000;
const CARD1_PRICE: u64 = 50 * USDC;
const CARD2_PRICE: u64 = 80 * USDC;
const MAX_TOP_UP: u64 = 40 * USDC;
const START_USDC: u64 = 1_000 * USDC;
const TREASURY_USDC: u64 = 10_000 * USDC;

const BASE: TransactionTarget = TransactionTarget::Base;
const ER: TransactionTarget = TransactionTarget::Ephemeral;

fn program_so() -> PathBuf {
    program_so_path(env!("CARGO_MANIFEST_DIR"), "card_poker")
}

fn ix(data: impl InstructionData, accounts: impl ToAccountMetas) -> Instruction {
    client_ix(as_address(card_poker::ID), data, accounts)
}

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &card_poker::ID).0
}

/// Converts an instruction built by another solana-instruction version.
fn conv(program_id: [u8; 32], metas: Vec<(Pubkey, bool, bool)>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: Address::new_from_array(program_id),
        accounts: metas
            .into_iter()
            .map(|(k, is_signer, is_writable)| AccountMeta {
                pubkey: as_address(k),
                is_signer,
                is_writable,
            })
            .collect(),
        data,
    }
}

macro_rules! foreign {
    ($ix:expr) => {{
        let i = $ix;
        conv(
            i.program_id.to_bytes(),
            i.accounts
                .iter()
                .map(|m| {
                    (
                        Pubkey::new_from_array(m.pubkey.to_bytes()),
                        m.is_signer,
                        m.is_writable,
                    )
                })
                .collect(),
            i.data,
        )
    }};
}

fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address(owner, mint)
}

struct Tokens {
    config: Pubkey,
    usdc: Pubkey,
    cards: [Pubkey; 2],
}

struct Match {
    svm: MagicSVM,
    admin: Keypair,
    tok: Tokens,
    p1: Keypair,
    p2: Keypair,
    id: u64,
    table: Pubkey,
    deck: Pubkey,
    hand1: Pubkey,
    hand2: Pubkey,
    vault: Pubkey,
}

impl Match {
    fn send(
        &mut self,
        target: TransactionTarget,
        signer: usize,
        ixs: Vec<Instruction>,
        label: &str,
    ) {
        let kp = if signer == 0 { &self.p1 } else { &self.p2 };
        send_ixs(&mut self.svm, target, &[kp], &ixs, label);
    }

    fn send_kps(&mut self, signers: &[&Keypair], ixs: Vec<Instruction>, label: &str) {
        send_ixs(&mut self.svm, BASE, signers, &ixs, label);
    }

    fn token_balance(&self, account: &Pubkey) -> u64 {
        self.svm
            .get_account_for(BASE, &as_address(*account))
            .map(|a| u64::from_le_bytes(a.data[64..72].try_into().unwrap()))
            .unwrap_or(0)
    }

    fn try_send(&mut self, signer: usize, ixs: Vec<Instruction>) -> bool {
        self.try_send_to(ER, signer, ixs)
    }

    fn try_send_to(
        &mut self,
        target: TransactionTarget,
        signer: usize,
        ixs: Vec<Instruction>,
    ) -> bool {
        let kp = if signer == 0 { &self.p1 } else { &self.p2 };
        let tx = test_utils::sign_tx(&[kp], &ixs, self.svm.latest_blockhash_for(target));
        let ok = self.svm.send_transaction_to(target, tx).is_ok();
        self.svm.expire_blockhash_for(target);
        ok
    }

    fn key(&self, seat: usize) -> Pubkey {
        as_pubkey(&if seat == 0 { &self.p1 } else { &self.p2 }.pubkey())
    }

    fn read<T: AccountDeserialize>(
        &mut self,
        target: TransactionTarget,
        viewer: Option<usize>,
        addr: &Pubkey,
    ) -> Option<T> {
        let viewer = viewer.map(|s| {
            if s == 0 {
                self.p1.pubkey()
            } else {
                self.p2.pubkey()
            }
        });
        self.svm.set_authorized_user(viewer);
        let acc = self.svm.get_account_for(target, &as_address(*addr));
        self.svm.set_authorized_user(None);
        acc.map(|a| T::try_deserialize(&mut a.data.as_slice()).expect("deserialize"))
    }

    fn table(&mut self) -> Table {
        let t = self.table;
        self.read(ER, Some(0), &t).expect("table readable")
    }

    fn delegate_ix(&self, addr: Pubkey, payer: Pubkey, account_type: AccountType) -> Instruction {
        ix(
            instruction::DelegatePda { account_type },
            accounts::DelegatePda {
                buffer_pda: delegate_buffer_pda_from_delegated_account_and_owner_program(
                    &addr,
                    &card_poker::ID,
                ),
                delegation_record_pda: delegation_record_pda_from_delegated_account(&addr),
                delegation_metadata_pda: delegation_metadata_pda_from_delegated_account(&addr),
                pda: addr,
                payer,
                validator: Some(as_pubkey(&self.svm.validator_identity())),
                owner_program: card_poker::ID,
                delegation_program: DelegationProgram::id(),
                system_program: system_program::ID,
            },
        )
    }

    fn permission_ix(
        &self,
        addr: Pubkey,
        authority: Pubkey,
        account_type: AccountType,
    ) -> Instruction {
        ix(
            instruction::InitPermission { account_type },
            accounts::InitPermission {
                permissioned_account: addr,
                permission: EphemeralPermission::find_pda(&addr).0,
                authority,
                permission_program: PERMISSION_PROGRAM_ID,
                ephemeral_vault: EPHEMERAL_VAULT_ID,
                magic_program: MAGIC_PROGRAM_ID,
            },
        )
    }

    fn table_action(&self, seat: usize) -> accounts::TableAction {
        accounts::TableAction {
            table: self.table,
            deck: self.deck,
            hand1: self.hand1,
            hand2: self.hand2,
            player: self.key(seat),
        }
    }

    fn start_hand(&mut self, seat: usize) {
        let i = ix(instruction::StartHand {}, self.table_action(seat));
        self.send(ER, seat, vec![i], "start hand");
    }

    fn act_ix(&self, seat: usize, action: Action) -> Instruction {
        ix(instruction::Act { action }, self.table_action(seat))
    }

    fn act(&mut self, seat: usize, action: Action) {
        let i = self.act_ix(seat, action);
        self.send(ER, seat, vec![i], &format!("seat {seat} {action:?}"));
    }

    fn to_act(&mut self) -> usize {
        self.table().to_act as usize
    }
}

/// Creates USDC and two single-copy card mints, lists both cards, funds the
/// sell-back treasury and gives each player one card and some USDC.
fn setup_tokens(m: &mut Match) {
    let admin = m.admin.insecure_clone();
    let ka = as_pubkey(&admin.pubkey());
    let mints = [Keypair::new(), Keypair::new(), Keypair::new()];
    let rent = 1_461_600; // rent-exempt minimum for an 82-byte mint
    for (i, mint) in mints.iter().enumerate() {
        let km = as_pubkey(&mint.pubkey());
        let ixs = vec![
            foreign!(solana_system_interface::instruction::create_account(
                &ka.to_bytes().into(),
                &km.to_bytes().into(),
                rent,
                82,
                &spl_token::ID.to_bytes().into(),
            )),
            foreign!(spl_token::instruction::initialize_mint2(
                &spl_token::ID,
                &km,
                &ka,
                None,
                if i == 0 { 6 } else { 0 },
            )
            .unwrap()),
        ];
        m.send_kps(&[&admin, mint], ixs, "create mint");
    }
    let usdc = as_pubkey(&mints[0].pubkey());
    let cards = [as_pubkey(&mints[1].pubkey()), as_pubkey(&mints[2].pubkey())];
    m.tok.usdc = usdc;
    m.tok.cards = cards;

    let config = m.tok.config;
    let mut ixs = vec![ix(
        instruction::InitConfig { usdc_mint: usdc },
        accounts::InitConfig {
            config,
            admin: ka,
            system_program: system_program::ID,
        },
    )];
    for (card, price) in cards.iter().zip([CARD1_PRICE, CARD2_PRICE]) {
        ixs.push(ix(
            instruction::SetCardPrice { price },
            accounts::SetCardPrice {
                config,
                card_mint: *card,
                card_price: pda(&[PRICE_SEED, card.as_ref()]),
                admin: ka,
                system_program: system_program::ID,
            },
        ));
    }
    m.send_kps(&[&admin], ixs, "config + prices");

    let fund = |owner: Pubkey, mint: Pubkey, amount: u64, m: &mut Match| {
        let ixs = vec![
            foreign!(
                spl_associated_token_account::instruction::create_associated_token_account(
                    &ka,
                    &owner,
                    &mint,
                    &spl_token::ID,
                )
            ),
            foreign!(spl_token::instruction::mint_to(
                &spl_token::ID,
                &mint,
                &ata(&owner, &mint),
                &ka,
                &[],
                amount,
            )
            .unwrap()),
        ];
        m.send_kps(&[&admin], ixs, "fund");
    };
    let (k1, k2) = (m.key(0), m.key(1));
    fund(config, usdc, TREASURY_USDC, m);
    fund(k1, usdc, START_USDC, m);
    fund(k2, usdc, START_USDC, m);
    fund(k1, cards[0], 1, m);
    fund(k2, cards[1], 1, m);
}

/// Creates a table, joins it, delegates everything to the ER and sets permissions.
fn setup(id: u64) -> Match {
    let mut svm = MagicSVM::new();
    svm.add_program_from_file(as_address(card_poker::ID), program_so())
        .expect("load program");
    let (p1, p2, admin) = (Keypair::new(), Keypair::new(), Keypair::new());
    svm.airdrop(&p1.pubkey(), 2 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&p2.pubkey(), 2 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&admin.pubkey(), 2 * LAMPORTS_PER_SOL).unwrap();
    let idb = id.to_le_bytes();
    let k1 = as_pubkey(&p1.pubkey());
    let k2 = as_pubkey(&p2.pubkey());
    let mut m = Match {
        table: pda(&[TABLE_SEED, &idb]),
        deck: pda(&[DECK_SEED, &idb]),
        hand1: pda(&[HAND_SEED, &idb, k1.as_ref()]),
        hand2: pda(&[HAND_SEED, &idb, k2.as_ref()]),
        vault: pda(&[VAULT_SEED, &idb]),
        svm,
        tok: Tokens {
            config: pda(&[CONFIG_SEED]),
            usdc: Pubkey::default(),
            cards: [Pubkey::default(); 2],
        },
        admin,
        p1,
        p2,
        id,
    };
    setup_tokens(&mut m);
    let (usdc, card1, card2) = (m.tok.usdc, m.tok.cards[0], m.tok.cards[1]);

    let create = ix(
        instruction::CreateTable {
            table_id: id,
            stake: STAKE,
            starting_stack: STACK,
            small_blind: SMALL_BLIND,
            max_top_up: MAX_TOP_UP,
        },
        accounts::CreateTable {
            table: m.table,
            deck: m.deck,
            hand: m.hand1,
            vault: m.vault,
            player1: k1,
            config: m.tok.config,
            card_mint: card1,
            card_price: pda(&[PRICE_SEED, card1.as_ref()]),
            player_card: ata(&k1, &card1),
            vault_card: ata(&m.vault, &card1),
            usdc_mint: usdc,
            player_usdc: ata(&k1, &usdc),
            vault_usdc: ata(&m.vault, &usdc),
            token_program: spl_token::ID,
            associated_token_program: spl_associated_token_account::program::ID,
            system_program: system_program::ID,
        },
    );
    let ixs = vec![
        create,
        m.delegate_ix(m.deck, k1, AccountType::Deck { table_id: id }),
        m.delegate_ix(
            m.hand1,
            k1,
            AccountType::Hand {
                table_id: id,
                player: k1,
            },
        ),
    ];
    m.send(BASE, 0, ixs, "create table");

    // Nobody can delegate the table before both players are seated.
    let early = m.delegate_ix(m.table, k2, AccountType::Table { table_id: id });
    assert!(
        !m.try_send_to(BASE, 1, vec![early]),
        "table delegation before join must fail"
    );

    let join = ix(
        instruction::JoinTable { _table_id: id },
        accounts::JoinTable {
            table: m.table,
            hand: m.hand2,
            vault: m.vault,
            player2: k2,
            config: m.tok.config,
            card_mint: card2,
            card_price: pda(&[PRICE_SEED, card2.as_ref()]),
            player_card: ata(&k2, &card2),
            vault_card: ata(&m.vault, &card2),
            usdc_mint: usdc,
            player_usdc: ata(&k2, &usdc),
            vault_usdc: ata(&m.vault, &usdc),
            token_program: spl_token::ID,
            associated_token_program: spl_associated_token_account::program::ID,
            creator_usdc: ata(&k1, &usdc),
            system_program: system_program::ID,
        },
    );
    let ixs = vec![
        join,
        m.delegate_ix(m.table, k2, AccountType::Table { table_id: id }),
        m.delegate_ix(
            m.hand2,
            k2,
            AccountType::Hand {
                table_id: id,
                player: k2,
            },
        ),
    ];
    m.send(BASE, 1, ixs, "join table");
    assert_eq!(m.svm.get_balance(&as_address(m.vault)).unwrap(), 2 * STAKE);

    // Card 2 is worth 30 USDC more: the creator's 40 USDC allowance covers the gap and 10 is refunded.
    let gap = CARD2_PRICE - CARD1_PRICE;
    assert_eq!(m.token_balance(&ata(&m.vault, &card1)), 1);
    assert_eq!(m.token_balance(&ata(&m.vault, &card2)), 1);
    assert_eq!(m.token_balance(&ata(&m.vault, &usdc)), gap);
    assert_eq!(m.token_balance(&ata(&k1, &usdc)), START_USDC - gap);
    assert_eq!(m.token_balance(&ata(&k2, &usdc)), START_USDC);
    let t: Table = m.read(BASE, None, &m.table.clone()).unwrap();
    assert_eq!(t.top_ups, [gap, 0]);
    assert_eq!(t.card_values, [CARD1_PRICE, CARD2_PRICE]);

    let ixs = vec![
        m.permission_ix(m.table, k1, AccountType::Table { table_id: id }),
        m.permission_ix(m.deck, k1, AccountType::Deck { table_id: id }),
        m.permission_ix(
            m.hand1,
            k1,
            AccountType::Hand {
                table_id: id,
                player: k1,
            },
        ),
        m.permission_ix(
            m.hand2,
            k1,
            AccountType::Hand {
                table_id: id,
                player: k2,
            },
        ),
    ];
    m.send(ER, 0, ixs, "init permissions");

    for seat in 0..2 {
        let hand = if seat == 0 { m.hand1 } else { m.hand2 };
        let i = ix(
            instruction::CommitSeed {
                seed: [seat as u8 + 7; 32],
            },
            accounts::CommitSeed {
                hand,
                player: m.key(seat),
            },
        );
        m.send(ER, seat, vec![i], "commit seed");
    }
    m
}

fn settle_and_claim(m: &mut Match) {
    let t = m.table();
    assert_eq!(t.phase, Phase::Finished);
    assert_eq!(t.stacks[t.match_winner as usize], 2 * STACK);
    let settle = ix(
        instruction::Settle {},
        accounts::Settle {
            payer: m.key(0),
            table: m.table,
            deck: m.deck,
            hand1: m.hand1,
            hand2: m.hand2,
            magic_program: MagicProgram::id(),
            magic_context: MAGIC_CONTEXT_ID,
        },
    );
    m.send(ER, 0, vec![settle], "settle");
    let base_owner = m
        .svm
        .get_account_for(BASE, &as_address(m.table))
        .unwrap()
        .owner;
    assert_eq!(base_owner, as_address(card_poker::ID), "table back on base");

    // Settlement must not publish the deck, hole cards or seeds on Solana.
    let (deck, hand1, hand2) = (m.deck, m.hand1, m.hand2);
    let deck: Deck = m.read(BASE, None, &deck).expect("deck on base");
    assert!(
        deck.cards.iter().all(|&c| c == u8::MAX),
        "deck wiped before commit"
    );
    for hand in [hand1, hand2] {
        let hand: Hand = m.read(BASE, None, &hand).expect("hand on base");
        assert!(hand.cards.iter().all(|&c| c == u8::MAX), "hole cards wiped");
        assert_eq!(hand.seed, [0; 32], "seed wiped");
    }

    let winner = m.key(t.match_winner as usize);
    let before = m.svm.get_balance(&as_address(winner)).unwrap();
    let claim = ix(
        instruction::ClaimPot {},
        accounts::ClaimPot {
            table: m.table,
            vault: m.vault,
            winner,
            payer: m.key(1 - t.match_winner as usize),
            config: m.tok.config,
            card_mint1: m.tok.cards[0],
            card_mint2: m.tok.cards[1],
            usdc_mint: m.tok.usdc,
            vault_card1: ata(&m.vault, &m.tok.cards[0]),
            vault_card2: ata(&m.vault, &m.tok.cards[1]),
            vault_usdc: ata(&m.vault, &m.tok.usdc),
            winner_card1: ata(&winner, &m.tok.cards[0]),
            winner_card2: ata(&winner, &m.tok.cards[1]),
            winner_usdc: ata(&winner, &m.tok.usdc),
            token_program: spl_token::ID,
            associated_token_program: spl_associated_token_account::program::ID,
            system_program: system_program::ID,
        },
    );
    let usdc_before = m.token_balance(&ata(&winner, &m.tok.usdc));
    // The loser triggers the payout so the winner's balance delta excludes fees.
    m.send(BASE, 1 - t.match_winner as usize, vec![claim], "claim pot");
    let after = m.svm.get_balance(&as_address(winner)).unwrap();
    assert_eq!(after - before, 2 * STAKE, "winner receives both stakes");
    assert_eq!(m.svm.get_balance(&as_address(m.vault)).unwrap_or(0), 0);
    let (usdc, cards) = (m.tok.usdc, m.tok.cards);
    assert_eq!(
        m.token_balance(&ata(&winner, &cards[0])),
        1,
        "winner gets card 1"
    );
    assert_eq!(
        m.token_balance(&ata(&winner, &cards[1])),
        1,
        "winner gets card 2"
    );
    let gap = CARD2_PRICE - CARD1_PRICE;
    assert_eq!(
        m.token_balance(&ata(&winner, &usdc)) - usdc_before,
        gap,
        "winner gets the top-up"
    );
    assert_eq!(m.token_balance(&ata(&m.vault, &usdc)), 0);

    // Instant sell-back of the more valuable card.
    let config = m.tok.config;
    let sell = ix(
        instruction::SellCard {},
        accounts::SellCard {
            config,
            card_mint: cards[1],
            card_price: pda(&[PRICE_SEED, cards[1].as_ref()]),
            seller_card: ata(&winner, &cards[1]),
            treasury_card: ata(&config, &cards[1]),
            usdc_mint: usdc,
            treasury_usdc: ata(&config, &usdc),
            seller_usdc: ata(&winner, &usdc),
            seller: winner,
            token_program: spl_token::ID,
            associated_token_program: spl_associated_token_account::program::ID,
            system_program: system_program::ID,
        },
    );
    let before = m.token_balance(&ata(&winner, &usdc));
    m.send(BASE, t.match_winner as usize, vec![sell], "sell card");
    assert_eq!(m.token_balance(&ata(&winner, &usdc)) - before, CARD2_PRICE);
    assert_eq!(m.token_balance(&ata(&winner, &cards[1])), 0);
    assert_eq!(m.token_balance(&ata(&config, &cards[1])), 1);
}

#[test]
fn hole_cards_are_private_and_all_in_match_settles() {
    let mut m = setup(1);
    let (deck, hand1, hand2) = (m.deck, m.hand1, m.hand2);

    m.start_hand(0);
    let t = m.table();
    assert_eq!(t.phase, Phase::PreFlop);
    assert_eq!(t.board_len, 0);

    // Each player reads only their own hole cards; nobody can read the deck.
    let own1: Hand = m.read(ER, Some(0), &hand1).expect("p1 reads own hand");
    let own2: Hand = m.read(ER, Some(1), &hand2).expect("p2 reads own hand");
    assert!(own1.cards.iter().chain(own2.cards.iter()).all(|&c| c < 52));
    assert!(
        m.read::<Hand>(ER, Some(0), &hand2).is_none(),
        "p1 must not see p2's hand"
    );
    assert!(
        m.read::<Hand>(ER, Some(1), &hand1).is_none(),
        "p2 must not see p1's hand"
    );
    assert!(
        m.read::<Deck>(ER, Some(0), &deck).is_none(),
        "deck hidden from p1"
    );
    assert!(
        m.read::<Deck>(ER, Some(1), &deck).is_none(),
        "deck hidden from p2"
    );

    // Out-of-turn actions are rejected.
    let waiting = 1 - m.to_act();
    let bad = m.act_ix(waiting, Action::Check);
    assert!(
        !m.try_send(waiting, vec![bad]),
        "acting out of turn must fail"
    );

    // Shove and call every hand until someone has all the chips.
    let mut hands = 0;
    loop {
        let seat = m.to_act();
        m.act(seat, Action::AllIn);
        m.act(1 - seat, Action::Call);
        let t = m.table();
        hands += 1;
        assert_eq!(t.board_len, 5, "board runs out when all-in");
        assert!(
            t.showdown.iter().all(|&c| c < 52),
            "showdown reveals both hands"
        );
        assert_eq!(t.stacks[0] + t.stacks[1], 2 * STACK, "chips conserved");
        if t.phase == Phase::Finished {
            break;
        }
        assert!(hands < 50);
        m.start_hand(seat);
    }
    settle_and_claim(&mut m);
}

#[test]
fn betting_rounds_fold_and_blinds() {
    let mut m = setup(2);
    m.start_hand(0);
    let t = m.table();
    let dealer = t.dealer as usize;
    assert_eq!(t.to_act as usize, dealer, "dealer acts first pre-flop");
    assert_eq!(t.bets[dealer], SMALL_BLIND);
    assert_eq!(t.bets[1 - dealer], 2 * SMALL_BLIND);

    // Pre-flop: dealer limps, big blind checks its option.
    m.act(dealer, Action::Call);
    assert_eq!(
        m.table().phase,
        Phase::PreFlop,
        "big blind still has the option"
    );
    m.act(1 - dealer, Action::Check);
    let t = m.table();
    assert_eq!((t.phase, t.board_len, t.pot), (Phase::Flop, 3, 4));
    assert_eq!(
        t.to_act as usize,
        1 - dealer,
        "non-dealer acts first post-flop"
    );

    // Flop: check, bet below minimum fails, bet 4, raise to 12, call.
    m.act(1 - dealer, Action::Check);
    let small = m.act_ix(dealer, Action::Raise { to: 1 });
    assert!(
        !m.try_send(dealer, vec![small]),
        "bet below big blind must fail"
    );
    m.act(dealer, Action::Raise { to: 4 });
    m.act(1 - dealer, Action::Raise { to: 12 });
    m.act(dealer, Action::Call);
    let t = m.table();
    assert_eq!((t.phase, t.board_len, t.pot), (Phase::Turn, 4, 28));

    // Turn: check-check; river: bet and fold.
    m.act(1 - dealer, Action::Check);
    m.act(dealer, Action::Check);
    assert_eq!(m.table().phase, Phase::River);
    m.act(1 - dealer, Action::Raise { to: 10 });
    m.act(dealer, Action::Fold);
    let t = m.table();
    assert_eq!(t.phase, Phase::Ready);
    assert_eq!(t.last_hand_winner as usize, 1 - dealer);
    assert_eq!(t.stacks[1 - dealer], STACK + 14);
    assert_eq!(t.stacks[dealer], STACK - 14);
    assert!(
        t.showdown.iter().all(|&c| c == u8::MAX),
        "folded hands stay hidden"
    );
    assert_eq!(t.dealer as usize, 1 - dealer, "button moves");

    // Claiming before the match is decided fails.
    let early = ix(
        instruction::Settle {},
        accounts::Settle {
            payer: m.key(0),
            table: m.table,
            deck: m.deck,
            hand1: m.hand1,
            hand2: m.hand2,
            magic_program: MagicProgram::id(),
            magic_context: MAGIC_CONTEXT_ID,
        },
    );
    assert!(!m.try_send(0, vec![early]), "cannot settle mid-match");
    let _ = m.id;
}
