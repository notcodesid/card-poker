//! Pure poker helpers: card encoding, deterministic shuffle and 7-card hand evaluation.
//!
//! A card is a `u8` in `0..52`: `rank = card % 13` (0 = deuce .. 12 = ace),
//! `suit = card / 13`.

pub const DECK_SIZE: usize = 52;
pub const NO_CARD: u8 = u8::MAX;

pub const HIGH_CARD: u32 = 0;
pub const ONE_PAIR: u32 = 1;
pub const TWO_PAIR: u32 = 2;
pub const THREE_OF_A_KIND: u32 = 3;
pub const STRAIGHT: u32 = 4;
pub const FLUSH: u32 = 5;
pub const FULL_HOUSE: u32 = 6;
pub const FOUR_OF_A_KIND: u32 = 7;
pub const STRAIGHT_FLUSH: u32 = 8;

pub fn rank(card: u8) -> u8 {
    card % 13
}

pub fn suit(card: u8) -> u8 {
    card / 13
}

/// Fisher-Yates shuffle where swap `i` uses `sha256(seed || i)`, so the full
/// 256-bit seed drives every swap.
pub fn shuffle(seed: [u8; 32]) -> [u8; DECK_SIZE] {
    let mut deck = [0u8; DECK_SIZE];
    for (i, card) in deck.iter_mut().enumerate() {
        *card = i as u8;
    }
    for i in (1..DECK_SIZE).rev() {
        let digest = solana_sha256_hasher::hashv(&[&seed, &[i as u8]]).to_bytes();
        let r = u64::from_le_bytes(digest[..8].try_into().unwrap());
        let j = (r % (i as u64 + 1)) as usize;
        deck.swap(i, j);
    }
    deck
}

/// Score of the best 5-card hand out of 7 cards. Higher is better; equal scores tie.
/// Layout: `category << 20 | five 4-bit tiebreak ranks`.
pub fn evaluate7(cards: &[u8; 7]) -> u32 {
    let mut best = 0;
    for skip_a in 0..7 {
        for skip_b in (skip_a + 1)..7 {
            let mut hand = [0u8; 5];
            let mut n = 0;
            for (i, &c) in cards.iter().enumerate() {
                if i != skip_a && i != skip_b {
                    hand[n] = c;
                    n += 1;
                }
            }
            best = best.max(evaluate5(&hand));
        }
    }
    best
}

pub fn category(score: u32) -> u32 {
    score >> 20
}

pub fn evaluate5(cards: &[u8; 5]) -> u32 {
    let mut counts = [0u8; 13];
    for &c in cards {
        counts[rank(c) as usize] += 1;
    }
    let flush = cards.iter().all(|&c| suit(c) == suit(cards[0]));

    // Ranks ordered by (count desc, rank desc) for tiebreaks.
    let mut groups: Vec<(u8, u8)> = (0..13u8)
        .rev()
        .filter(|&r| counts[r as usize] > 0)
        .map(|r| (counts[r as usize], r))
        .collect();
    groups.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)));

    let straight_high = if groups.len() == 5 {
        let high = groups[0].1;
        let low = groups[4].1;
        if high - low == 4 {
            Some(high)
        } else if high == 12 && groups[1].1 == 3 {
            // A-2-3-4-5 wheel: the five plays high.
            Some(3)
        } else {
            None
        }
    } else {
        None
    };

    let cat = match (
        straight_high,
        flush,
        groups[0].0,
        groups.get(1).map(|g| g.0),
    ) {
        (Some(_), true, _, _) => STRAIGHT_FLUSH,
        (_, _, 4, _) => FOUR_OF_A_KIND,
        (_, _, 3, Some(2)) => FULL_HOUSE,
        (_, true, _, _) => FLUSH,
        (Some(_), _, _, _) => STRAIGHT,
        (_, _, 3, _) => THREE_OF_A_KIND,
        (_, _, 2, Some(2)) => TWO_PAIR,
        (_, _, 2, _) => ONE_PAIR,
        _ => HIGH_CARD,
    };

    let mut score = cat << 20;
    if let (Some(high), STRAIGHT | STRAIGHT_FLUSH) = (straight_high, cat) {
        return score | (high as u32) << 16;
    }
    for (i, &(_, r)) in groups.iter().enumerate() {
        score |= (r as u32) << (16 - 4 * i);
    }
    score
}

#[cfg(test)]
mod tests {
    use super::*;

    // Parse "As", "Td", "2c" ... (suits: c d h s).
    fn c(s: &str) -> u8 {
        let b = s.as_bytes();
        let r = "23456789TJQKA".find(b[0] as char).unwrap() as u8;
        let su = "cdhs".find(b[1] as char).unwrap() as u8;
        su * 13 + r
    }

    fn h7(s: &str) -> u32 {
        let v: Vec<u8> = s.split_whitespace().map(c).collect();
        evaluate7(&v.try_into().unwrap())
    }

    #[test]
    fn shuffle_is_permutation_and_seed_dependent() {
        let a = shuffle([1u8; 32]);
        let b = shuffle([2u8; 32]);
        let mut sorted = a;
        sorted.sort();
        assert_eq!(sorted.to_vec(), (0..52u8).collect::<Vec<_>>());
        assert_ne!(a, b);
        assert_eq!(a, shuffle([1u8; 32]));
    }

    #[test]
    fn categories() {
        assert_eq!(category(h7("As Ks Qs Js Ts 2d 3c")), STRAIGHT_FLUSH);
        assert_eq!(category(h7("9h 9d 9s 9c Ks 2d 3c")), FOUR_OF_A_KIND);
        assert_eq!(category(h7("9h 9d 9s Kc Ks 2d 3c")), FULL_HOUSE);
        assert_eq!(category(h7("2h 7h 9h Jh Kh 2d 3c")), FLUSH);
        assert_eq!(category(h7("Ah 2d 3s 4c 5s Kd Qc")), STRAIGHT);
        assert_eq!(category(h7("9h 9d 9s 4c 5s Kd Qc")), THREE_OF_A_KIND);
        assert_eq!(category(h7("9h 9d 4s 4c 5s Kd Qc")), TWO_PAIR);
        assert_eq!(category(h7("9h 9d 2s 4c 5s Kd Qc")), ONE_PAIR);
        assert_eq!(category(h7("9h Td 2s 4c 5s Kd Qc")), HIGH_CARD);
    }

    #[test]
    fn tiebreaks() {
        // Wheel loses to six-high straight.
        assert!(h7("Ah 2d 3s 4c 5s Kd Kc") < h7("6h 2d 3s 4c 5s Kd Kc"));
        // Same pair, kicker decides.
        assert!(h7("Ah Ad 9s 4c 5s 2d 7c") > h7("Ah Ad 8s 4c 5s 2d 7c"));
        // Higher full house by trips.
        assert!(h7("Kh Kd Ks 2c 2s 3d 7c") > h7("Qh Qd Qs Ac As 3d 7c"));
        // Board plays: identical scores split.
        assert_eq!(h7("2h 3d As Ks Qs Js Ts"), h7("4h 5d As Ks Qs Js Ts"));
        // Two pair, higher second pair wins.
        assert!(h7("Ah Ad 9s 9c 5s 2d 7c") > h7("Ah Ad 8s 8c Ks 2d 7c"));
    }
}
