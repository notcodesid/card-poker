/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/card_poker.json`.
 */
export type CardPoker = {
  "address": "8inTx3PzfmU6iYqbTxikJ6PYWcrui9JzaWGuYRTu2zuP",
  "metadata": {
    "name": "cardPoker",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Heads-up trading-card poker on MagicBlock Private Ephemeral Rollups"
  },
  "instructions": [
    {
      "name": "act",
      "docs": [
        "Private ER. The player whose turn it is checks, calls, raises, goes all-in or folds."
      ],
      "discriminator": [
        114,
        158,
        229,
        112,
        242,
        50,
        227,
        5
      ],
      "accounts": [
        {
          "name": "table",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  98,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "deck",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "hand1",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              },
              {
                "kind": "account",
                "path": "table.player1",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "hand2",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              },
              {
                "kind": "account",
                "path": "table.player2",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "action",
          "type": {
            "defined": {
              "name": "action"
            }
          }
        }
      ]
    },
    {
      "name": "cancelTable",
      "docs": [
        "Base layer. Creator takes their stake back if nobody joined."
      ],
      "discriminator": [
        242,
        161,
        251,
        74,
        29,
        143,
        155,
        203
      ],
      "accounts": [
        {
          "name": "table",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  98,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "player1",
          "writable": true,
          "signer": true,
          "relations": [
            "table"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "playerCard",
          "writable": true
        },
        {
          "name": "vaultCard",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "table.card_mints [0]",
                "account": "table"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "playerUsdc",
          "writable": true
        },
        {
          "name": "vaultUsdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "config.usdc_mint",
                "account": "config"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claimPot",
      "docs": [
        "Base layer. Pays the whole escrow to the match winner. Anyone can trigger it."
      ],
      "discriminator": [
        210,
        85,
        35,
        217,
        204,
        65,
        38,
        17
      ],
      "accounts": [
        {
          "name": "table",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  98,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "winner",
          "writable": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "cardMint1"
        },
        {
          "name": "cardMint2"
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "vaultCard1",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "cardMint1"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vaultCard2",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "cardMint2"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vaultUsdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "winnerCard1",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "winner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "cardMint1"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "winnerCard2",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "winner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "cardMint2"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "winnerUsdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "winner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claimStarterPack",
      "docs": [
        "Base layer, demo deployments only. Gives the caller one copy of a listed card",
        "(if they hold none) and tops their test USDC up to `FAUCET_USDC`. Both mints",
        "must have the config PDA as mint authority."
      ],
      "discriminator": [
        229,
        11,
        235,
        7,
        228,
        110,
        204,
        137
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "cardMint",
          "writable": true
        },
        {
          "name": "cardPrice",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "cardMint"
              }
            ]
          }
        },
        {
          "name": "userCard",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "cardMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcMint",
          "writable": true
        },
        {
          "name": "userUsdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claimTimeout",
      "docs": [
        "Private ER. If the player to act has stalled for `TURN_TIMEOUT_SECS`, their",
        "opponent folds them."
      ],
      "discriminator": [
        130,
        234,
        45,
        53,
        120,
        90,
        86,
        178
      ],
      "accounts": [
        {
          "name": "table",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  98,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "deck",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "hand1",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              },
              {
                "kind": "account",
                "path": "table.player1",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "hand2",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              },
              {
                "kind": "account",
                "path": "table.player2",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "commitSeed",
      "docs": [
        "Private ER. Each player mixes secret entropy into every shuffle.",
        "The hand account is private to its owner, so the opponent never sees it."
      ],
      "discriminator": [
        115,
        4,
        240,
        226,
        140,
        33,
        78,
        75
      ],
      "accounts": [
        {
          "name": "hand",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "hand.table_id",
                "account": "hand"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "seed",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "createTable",
      "docs": [
        "Base layer. Creates the table, deck and the creator's hand, and escrows the stake."
      ],
      "discriminator": [
        214,
        142,
        131,
        250,
        242,
        83,
        135,
        185
      ],
      "accounts": [
        {
          "name": "table",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  98,
                  108,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "tableId"
              }
            ]
          }
        },
        {
          "name": "deck",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  99,
                  107
                ]
              },
              {
                "kind": "arg",
                "path": "tableId"
              }
            ]
          }
        },
        {
          "name": "hand",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "tableId"
              },
              {
                "kind": "account",
                "path": "player1"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "tableId"
              }
            ]
          }
        },
        {
          "name": "player1",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "cardMint"
        },
        {
          "name": "cardPrice",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "cardMint"
              }
            ]
          }
        },
        {
          "name": "playerCard",
          "writable": true
        },
        {
          "name": "vaultCard",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "cardMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "playerUsdc",
          "writable": true
        },
        {
          "name": "vaultUsdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tableId",
          "type": "u64"
        },
        {
          "name": "stake",
          "type": "u64"
        },
        {
          "name": "startingStack",
          "type": "u64"
        },
        {
          "name": "smallBlind",
          "type": "u64"
        },
        {
          "name": "maxTopUp",
          "type": "u64"
        }
      ]
    },
    {
      "name": "delegatePda",
      "docs": [
        "Base layer. Delegates a table PDA to the (TEE) ER validator.",
        "Only the owning player may delegate their hand or the deck, and the table only",
        "after both players are seated."
      ],
      "discriminator": [
        248,
        217,
        193,
        46,
        124,
        191,
        64,
        135
      ],
      "accounts": [
        {
          "name": "bufferPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                114,
                182,
                7,
                87,
                252,
                111,
                200,
                146,
                248,
                184,
                55,
                71,
                203,
                211,
                109,
                225,
                186,
                214,
                117,
                245,
                231,
                25,
                0,
                225,
                171,
                220,
                27,
                251,
                89,
                195,
                14,
                10
              ]
            }
          }
        },
        {
          "name": "delegationRecordPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "pda",
          "writable": true
        },
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "validator",
          "optional": true
        },
        {
          "name": "ownerProgram",
          "address": "8inTx3PzfmU6iYqbTxikJ6PYWcrui9JzaWGuYRTu2zuP"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountType",
          "type": {
            "defined": {
              "name": "accountType"
            }
          }
        }
      ]
    },
    {
      "name": "initConfig",
      "docs": [
        "Base layer. One-time setup of the card price table admin and the stablecoin mint."
      ],
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "usdcMint",
          "type": "pubkey"
        },
        {
          "name": "faucetEnabled",
          "type": "bool"
        }
      ]
    },
    {
      "name": "initPermission",
      "docs": [
        "Private ER. Creates the access-control permission for a delegated PDA.",
        "The PDA pays its own permission rent (pre-funded on the base layer).",
        "Membership is fixed per account type: table public, deck hidden from everyone,",
        "hand private to its owner."
      ],
      "discriminator": [
        66,
        14,
        153,
        250,
        187,
        36,
        179,
        236
      ],
      "accounts": [
        {
          "name": "permissionedAccount",
          "writable": true
        },
        {
          "name": "permission",
          "writable": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "ephemeralVault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountType",
          "type": {
            "defined": {
              "name": "accountType"
            }
          }
        }
      ]
    },
    {
      "name": "joinTable",
      "docs": [
        "Base layer. Second player joins and escrows the same stake."
      ],
      "discriminator": [
        14,
        117,
        84,
        51,
        95,
        146,
        171,
        70
      ],
      "accounts": [
        {
          "name": "table",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  98,
                  108,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "tableId"
              }
            ]
          }
        },
        {
          "name": "hand",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "tableId"
              },
              {
                "kind": "account",
                "path": "player2"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "tableId"
              }
            ]
          }
        },
        {
          "name": "player2",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "cardMint"
        },
        {
          "name": "cardPrice",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "cardMint"
              }
            ]
          }
        },
        {
          "name": "playerCard",
          "writable": true
        },
        {
          "name": "vaultCard",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "cardMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "playerUsdc",
          "writable": true
        },
        {
          "name": "vaultUsdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "creatorUsdc",
          "docs": [
            "Receives the creator's unused top-up allowance."
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tableId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "sellCard",
      "docs": [
        "Base layer. Instantly sells a card to the treasury at its listed price."
      ],
      "discriminator": [
        168,
        76,
        156,
        9,
        11,
        34,
        170,
        244
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "cardMint"
        },
        {
          "name": "cardPrice",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "cardMint"
              }
            ]
          }
        },
        {
          "name": "sellerCard",
          "writable": true
        },
        {
          "name": "treasuryCard",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "cardMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "treasuryUsdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "sellerUsdc",
          "writable": true
        },
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "setCardPrice",
      "docs": [
        "Base layer. Admin sets the USDC value of a card mint (used for stake matching and sell-back)."
      ],
      "discriminator": [
        245,
        245,
        116,
        136,
        11,
        159,
        34,
        197
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "cardMint"
        },
        {
          "name": "cardPrice",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "cardMint"
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "price",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settle",
      "docs": [
        "Private ER. Once the match is decided, commits all game accounts back to",
        "Solana and returns them to this program. Hole cards stay unrevealed unless",
        "the hand went to showdown."
      ],
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "table",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  98,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "deck",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "hand1",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              },
              {
                "kind": "account",
                "path": "table.player1",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "hand2",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              },
              {
                "kind": "account",
                "path": "table.player2",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "startHand",
      "docs": [
        "Private ER. Shuffles the deck from both players' secret seeds, deals hole",
        "cards into the private hand accounts and posts the blinds."
      ],
      "discriminator": [
        50,
        173,
        164,
        52,
        65,
        42,
        197,
        135
      ],
      "accounts": [
        {
          "name": "table",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  98,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "deck",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  99,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "hand1",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              },
              {
                "kind": "account",
                "path": "table.player1",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "hand2",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "table.table_id",
                "account": "table"
              },
              {
                "kind": "account",
                "path": "table.player2",
                "account": "table"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "cardPrice",
      "discriminator": [
        10,
        111,
        233,
        222,
        222,
        162,
        18,
        211
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "deck",
      "discriminator": [
        192,
        215,
        78,
        133,
        216,
        161,
        59,
        154
      ]
    },
    {
      "name": "hand",
      "discriminator": [
        51,
        56,
        101,
        152,
        196,
        199,
        104,
        242
      ]
    },
    {
      "name": "table",
      "discriminator": [
        34,
        100,
        138,
        97,
        236,
        129,
        230,
        112
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidConfig",
      "msg": "Invalid table configuration."
    },
    {
      "code": 6001,
      "name": "tableFull",
      "msg": "Table already has two players."
    },
    {
      "code": 6002,
      "name": "cannotJoinOwnTable",
      "msg": "You cannot join your own table."
    },
    {
      "code": 6003,
      "name": "alreadyStarted",
      "msg": "The match has already started."
    },
    {
      "code": 6004,
      "name": "notAPlayer",
      "msg": "Only a seated player can do this."
    },
    {
      "code": 6005,
      "name": "wrongPhase",
      "msg": "Not allowed in the current phase."
    },
    {
      "code": 6006,
      "name": "seedMissing",
      "msg": "Both players must commit a shuffle seed first."
    },
    {
      "code": 6007,
      "name": "notYourTurn",
      "msg": "It is not your turn."
    },
    {
      "code": 6008,
      "name": "cannotCheck",
      "msg": "Cannot check facing a bet."
    },
    {
      "code": 6009,
      "name": "nothingToCall",
      "msg": "Nothing to call."
    },
    {
      "code": 6010,
      "name": "insufficientChips",
      "msg": "Not enough chips."
    },
    {
      "code": 6011,
      "name": "raiseTooSmall",
      "msg": "Raise is below the minimum."
    },
    {
      "code": 6012,
      "name": "opponentAllIn",
      "msg": "Opponent is all-in; you can only call or fold."
    },
    {
      "code": 6013,
      "name": "matchNotDecided",
      "msg": "The match is not decided yet."
    },
    {
      "code": 6014,
      "name": "alreadyPaid",
      "msg": "The pot has already been paid out."
    },
    {
      "code": 6015,
      "name": "wrongWinner",
      "msg": "Payout account is not the match winner."
    },
    {
      "code": 6016,
      "name": "wrongAccount",
      "msg": "Account does not match the given account type."
    },
    {
      "code": 6017,
      "name": "stakeBelowRent",
      "msg": "Stake must be 0 or at least the rent-exempt minimum."
    },
    {
      "code": 6018,
      "name": "sameCard",
      "msg": "Both players staked the same card mint."
    },
    {
      "code": 6019,
      "name": "topUpAllowanceTooLow",
      "msg": "Creator's top-up allowance does not cover the card value gap."
    },
    {
      "code": 6020,
      "name": "cardNotListed",
      "msg": "This card has no sell-back price."
    },
    {
      "code": 6021,
      "name": "faucetDisabled",
      "msg": "The demo faucet is disabled."
    },
    {
      "code": 6022,
      "name": "notTimedOut",
      "msg": "The opponent's turn has not timed out."
    },
    {
      "code": 6023,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow."
    }
  ],
  "types": [
    {
      "name": "accountType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "table",
            "fields": [
              {
                "name": "tableId",
                "type": "u64"
              }
            ]
          },
          {
            "name": "deck",
            "fields": [
              {
                "name": "tableId",
                "type": "u64"
              }
            ]
          },
          {
            "name": "hand",
            "fields": [
              {
                "name": "tableId",
                "type": "u64"
              },
              {
                "name": "player",
                "type": "pubkey"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "action",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "fold"
          },
          {
            "name": "check"
          },
          {
            "name": "call"
          },
          {
            "name": "raise",
            "fields": [
              {
                "name": "to",
                "type": "u64"
              }
            ]
          },
          {
            "name": "allIn"
          }
        ]
      }
    },
    {
      "name": "cardPrice",
      "docs": [
        "USDC value (base units) of one card of `mint`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "faucetEnabled",
            "docs": [
              "Lets anyone mint starter cards and test USDC (devnet demo only)."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "deck",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tableId",
            "type": "u64"
          },
          {
            "name": "player1",
            "type": "pubkey"
          },
          {
            "name": "cards",
            "type": {
              "array": [
                "u8",
                52
              ]
            }
          },
          {
            "name": "next",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "hand",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tableId",
            "type": "u64"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "cards",
            "type": {
              "array": [
                "u8",
                2
              ]
            }
          },
          {
            "name": "seed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "seedSet",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "phase",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "waiting"
          },
          {
            "name": "ready"
          },
          {
            "name": "preFlop"
          },
          {
            "name": "flop"
          },
          {
            "name": "turn"
          },
          {
            "name": "river"
          },
          {
            "name": "showdown"
          },
          {
            "name": "finished"
          }
        ]
      }
    },
    {
      "name": "table",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tableId",
            "type": "u64"
          },
          {
            "name": "player1",
            "type": "pubkey"
          },
          {
            "name": "player2",
            "type": "pubkey"
          },
          {
            "name": "stake",
            "docs": [
              "Lamports escrowed by each player."
            ],
            "type": "u64"
          },
          {
            "name": "startingStack",
            "type": "u64"
          },
          {
            "name": "smallBlind",
            "type": "u64"
          },
          {
            "name": "phase",
            "type": {
              "defined": {
                "name": "phase"
              }
            }
          },
          {
            "name": "handNo",
            "type": "u32"
          },
          {
            "name": "dealer",
            "docs": [
              "Seat (0 or 1) holding the dealer button."
            ],
            "type": "u8"
          },
          {
            "name": "toAct",
            "type": "u8"
          },
          {
            "name": "stacks",
            "type": {
              "array": [
                "u64",
                2
              ]
            }
          },
          {
            "name": "bets",
            "docs": [
              "Chips put in during the current street."
            ],
            "type": {
              "array": [
                "u64",
                2
              ]
            }
          },
          {
            "name": "acted",
            "type": {
              "array": [
                "bool",
                2
              ]
            }
          },
          {
            "name": "pot",
            "type": "u64"
          },
          {
            "name": "lastRaise",
            "type": "u64"
          },
          {
            "name": "board",
            "type": {
              "array": [
                "u8",
                5
              ]
            }
          },
          {
            "name": "boardLen",
            "type": "u8"
          },
          {
            "name": "showdown",
            "docs": [
              "Both players' hole cards, public only after a showdown."
            ],
            "type": {
              "array": [
                "u8",
                4
              ]
            }
          },
          {
            "name": "lastHandWinner",
            "docs": [
              "0 / 1 = seat, 2 = split, 255 = none."
            ],
            "type": "u8"
          },
          {
            "name": "matchWinner",
            "type": "u8"
          },
          {
            "name": "paid",
            "type": "bool"
          },
          {
            "name": "turnStartedAt",
            "docs": [
              "When the current player's turn began (ER clock)."
            ],
            "type": "i64"
          },
          {
            "name": "cardMints",
            "docs": [
              "Escrowed trading cards, by seat."
            ],
            "type": {
              "array": [
                "pubkey",
                2
              ]
            }
          },
          {
            "name": "cardValues",
            "docs": [
              "USDC value of each card at the time it was staked."
            ],
            "type": {
              "array": [
                "u64",
                2
              ]
            }
          },
          {
            "name": "topUps",
            "docs": [
              "USDC each seat escrowed to match the other card's value."
            ],
            "type": {
              "array": [
                "u64",
                2
              ]
            }
          }
        ]
      }
    }
  ]
};
