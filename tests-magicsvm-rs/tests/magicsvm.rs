//! End-to-end heads-up match on an in-process MagicSVM (base layer + private ER).

use {
    anchor_lang::{
        prelude::Pubkey, system_program, AccountDeserialize, Id, InstructionData, ToAccountMetas,
    },
    card_poker::{
        accounts, instruction, AccountType, Action, Deck, Hand, Phase, Table, DECK_SEED, HAND_SEED,
        TABLE_SEED, VAULT_SEED,
    },
    ephemeral_rollups_sdk::{
        access_control::structs::{EphemeralPermission, Member, AUTHORITY_FLAG, TX_LOGS_FLAG},
        anchor::{DelegationProgram, MagicProgram},
        consts::{EPHEMERAL_VAULT_ID, MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID},
        pda::{
            delegate_buffer_pda_from_delegated_account_and_owner_program,
            delegation_metadata_pda_from_delegated_account,
            delegation_record_pda_from_delegated_account,
        },
    },
    magicsvm::{MagicSVM, TransactionTarget},
    solana_instruction::Instruction,
    solana_keypair::Keypair,
    solana_native_token::LAMPORTS_PER_SOL,
    solana_signer::Signer,
    std::path::PathBuf,
    test_utils::{as_address, as_pubkey, client_ix, program_so_path, send_ixs},
};

const STAKE: u64 = LAMPORTS_PER_SOL / 10;
const STACK: u64 = 100;
const SMALL_BLIND: u64 = 1;

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

fn member(pubkey: Pubkey) -> Member {
    Member {
        flags: AUTHORITY_FLAG | TX_LOGS_FLAG,
        pubkey,
    }
}

struct Match {
    svm: MagicSVM,
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

    fn try_send(&mut self, signer: usize, ixs: Vec<Instruction>) -> bool {
        let kp = if signer == 0 { &self.p1 } else { &self.p2 };
        let tx = test_utils::sign_tx(&[kp], &ixs, self.svm.latest_blockhash_for(ER));
        let ok = self.svm.send_transaction_to(ER, tx).is_ok();
        self.svm.expire_blockhash_for(ER);
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
        members: Option<Vec<Member>>,
    ) -> Instruction {
        ix(
            instruction::InitPermission {
                account_type,
                members,
            },
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

/// Creates a table, joins it, delegates everything to the ER and sets permissions.
fn setup(id: u64) -> Match {
    let mut svm = MagicSVM::new();
    svm.add_program_from_file(as_address(card_poker::ID), program_so())
        .expect("load program");
    let (p1, p2) = (Keypair::new(), Keypair::new());
    svm.airdrop(&p1.pubkey(), 2 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&p2.pubkey(), 2 * LAMPORTS_PER_SOL).unwrap();
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
        p1,
        p2,
        id,
    };

    let create = ix(
        instruction::CreateTable {
            table_id: id,
            stake: STAKE,
            starting_stack: STACK,
            small_blind: SMALL_BLIND,
        },
        accounts::CreateTable {
            table: m.table,
            deck: m.deck,
            hand: m.hand1,
            vault: m.vault,
            player1: k1,
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

    let join = ix(
        instruction::JoinTable { _table_id: id },
        accounts::JoinTable {
            table: m.table,
            hand: m.hand2,
            vault: m.vault,
            player2: k2,
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

    let ixs = vec![
        m.permission_ix(m.table, k1, AccountType::Table { table_id: id }, None),
        m.permission_ix(m.deck, k1, AccountType::Deck { table_id: id }, Some(vec![])),
        m.permission_ix(
            m.hand1,
            k1,
            AccountType::Hand {
                table_id: id,
                player: k1,
            },
            Some(vec![member(k1)]),
        ),
        m.permission_ix(
            m.hand2,
            k1,
            AccountType::Hand {
                table_id: id,
                player: k2,
            },
            Some(vec![member(k2)]),
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

    let winner = m.key(t.match_winner as usize);
    let before = m.svm.get_balance(&as_address(winner)).unwrap();
    let claim = ix(
        instruction::ClaimPot {},
        accounts::ClaimPot {
            table: m.table,
            vault: m.vault,
            winner,
            system_program: system_program::ID,
        },
    );
    // The loser triggers the payout so the winner's balance delta excludes fees.
    m.send(BASE, 1 - t.match_winner as usize, vec![claim], "claim pot");
    let after = m.svm.get_balance(&as_address(winner)).unwrap();
    assert_eq!(after - before, 2 * STAKE, "winner receives both stakes");
    assert_eq!(m.svm.get_balance(&as_address(m.vault)).unwrap_or(0), 0);
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
