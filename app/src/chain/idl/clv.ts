/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/clv.json`.
 */
export type Clv = {
  "address": "734ZWmPmAMGSjCshLCJQRpPNiaWBQsdaZDkvP3MAGmLz",
  "metadata": {
    "name": "clv",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "cancelDuel",
      "docs": [
        "Withdraw an unmatched offer."
      ],
      "discriminator": [
        83,
        124,
        224,
        237,
        235,
        44,
        38,
        57
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.fixture_id",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.duel_id",
                "account": "duel"
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
                  100,
                  117,
                  101,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "stakeMint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "claimDuel",
      "docs": [
        "Pay both stakes to the proven winner. Permissionless; destination is on-chain."
      ],
      "discriminator": [
        156,
        123,
        129,
        143,
        233,
        77,
        201,
        172
      ],
      "accounts": [
        {
          "name": "claimer",
          "docs": [
            "Permissionless: winner, loser or keeper. The destination is fixed on-chain."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.fixture_id",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.duel_id",
                "account": "duel"
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
                  100,
                  117,
                  101,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true
        },
        {
          "name": "winner"
        },
        {
          "name": "winnerTokenAccount",
          "writable": true
        },
        {
          "name": "stakeMint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "createDuel",
      "docs": [
        "Offer a duel and escrow the creator's stake. Any market; no odds line needed."
      ],
      "discriminator": [
        49,
        28,
        93,
        11,
        75,
        242,
        69,
        165
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "fixtureFacts",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  105,
                  120,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "fixtureId"
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "fixtureId"
              },
              {
                "kind": "arg",
                "path": "duelId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "Neutral escrow. Authority is the duel PDA, so no human can move these funds."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "stakeMint"
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "duelId",
          "type": "u64"
        },
        {
          "name": "fixtureId",
          "type": "i64"
        },
        {
          "name": "market",
          "type": {
            "defined": {
              "name": "marketKind"
            }
          }
        },
        {
          "name": "family",
          "type": {
            "defined": {
              "name": "statFamily"
            }
          }
        },
        {
          "name": "period",
          "type": "u16"
        },
        {
          "name": "selection",
          "type": "u8"
        },
        {
          "name": "lineX10",
          "type": "i16"
        },
        {
          "name": "stakeAmount",
          "type": "u64"
        },
        {
          "name": "creatorTakesTrue",
          "type": "bool"
        }
      ]
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "joinDuel",
      "docs": [
        "Take the other side. Locked once the proven kickoff passes."
      ],
      "discriminator": [
        7,
        247,
        76,
        103,
        101,
        139,
        254,
        61
      ],
      "accounts": [
        {
          "name": "taker",
          "writable": true,
          "signer": true
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.fixture_id",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.duel_id",
                "account": "duel"
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
                  100,
                  117,
                  101,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "stakeMint"
        },
        {
          "name": "takerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "openPrediction",
      "docs": [
        "Commit to a call. Cheap, no CPI — see `prove_entry` for why the proof is deferred."
      ],
      "discriminator": [
        133,
        18,
        105,
        142,
        96,
        107,
        224,
        203
      ],
      "accounts": [
        {
          "name": "predictor",
          "writable": true,
          "signer": true
        },
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
          "name": "fixtureFacts",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  105,
                  120,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "fixture_facts.fixture_id",
                "account": "fixtureFacts"
              }
            ]
          }
        },
        {
          "name": "prediction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "predictor"
              },
              {
                "kind": "arg",
                "path": "id"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "id",
          "type": "u64"
        },
        {
          "name": "fixtureId",
          "type": "i64"
        },
        {
          "name": "market",
          "type": {
            "defined": {
              "name": "marketKind"
            }
          }
        },
        {
          "name": "family",
          "type": {
            "defined": {
              "name": "statFamily"
            }
          }
        },
        {
          "name": "period",
          "type": "u16"
        },
        {
          "name": "selection",
          "type": "u8"
        },
        {
          "name": "lineX10",
          "type": "i16"
        },
        {
          "name": "entryTs",
          "type": "i64"
        },
        {
          "name": "entryMsgHash",
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
      "name": "proveEntry",
      "docs": [
        "Prove the committed entry line once its 5-minute odds root is published."
      ],
      "discriminator": [
        102,
        56,
        145,
        255,
        97,
        119,
        241,
        232
      ],
      "accounts": [
        {
          "name": "prover",
          "docs": [
            "Permissionless: the predictor, a keeper, or anyone may land the proof.",
            "It can only ever write the one price the record commits to."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "prediction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "prediction.predictor",
                "account": "prediction"
              },
              {
                "kind": "account",
                "path": "prediction.id",
                "account": "prediction"
              }
            ]
          }
        },
        {
          "name": "dailyOddsMerkleRoots"
        },
        {
          "name": "txoracleProgram",
          "address": "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"
        }
      ],
      "args": [
        {
          "name": "priceIndex",
          "type": "u8"
        },
        {
          "name": "odds",
          "type": {
            "defined": {
              "name": "odds"
            }
          }
        },
        {
          "name": "summary",
          "type": {
            "defined": {
              "name": "oddsBatchSummary"
            }
          }
        },
        {
          "name": "subTreeProof",
          "type": {
            "vec": {
              "defined": {
                "name": "proofNode"
              }
            }
          }
        },
        {
          "name": "mainTreeProof",
          "type": {
            "vec": {
              "defined": {
                "name": "proofNode"
              }
            }
          }
        }
      ]
    },
    {
      "name": "proveFixture",
      "docs": [
        "Prove a fixture's kickoff once (CPI validate_fixture). Every timing guard",
        "in this program is anchored to the `start_time` recorded here."
      ],
      "discriminator": [
        169,
        85,
        140,
        209,
        107,
        173,
        168,
        120
      ],
      "accounts": [
        {
          "name": "prover",
          "writable": true,
          "signer": true
        },
        {
          "name": "fixtureFacts",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  105,
                  120,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "fixtureId"
              }
            ]
          }
        },
        {
          "name": "tenDailyFixturesRoots"
        },
        {
          "name": "txoracleProgram",
          "address": "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "fixtureId",
          "type": "i64"
        },
        {
          "name": "snapshot",
          "type": {
            "defined": {
              "name": "fixture"
            }
          }
        },
        {
          "name": "summary",
          "type": {
            "defined": {
              "name": "fixtureBatchSummary"
            }
          }
        },
        {
          "name": "subTreeProof",
          "type": {
            "vec": {
              "defined": {
                "name": "proofNode"
              }
            }
          }
        },
        {
          "name": "mainTreeProof",
          "type": {
            "vec": {
              "defined": {
                "name": "proofNode"
              }
            }
          }
        }
      ]
    },
    {
      "name": "refundDuel",
      "docs": [
        "Escape hatch for a matched duel whose result never became provable."
      ],
      "discriminator": [
        102,
        85,
        18,
        136,
        100,
        103,
        76,
        189
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.fixture_id",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.duel_id",
                "account": "duel"
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
                  100,
                  117,
                  101,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true
        },
        {
          "name": "taker"
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "takerTokenAccount",
          "writable": true
        },
        {
          "name": "stakeMint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "resolveDuel",
      "docs": [
        "Prove the duel's predicate (CPI validate_stat). Permissionless; moves no funds."
      ],
      "discriminator": [
        213,
        162,
        203,
        235,
        151,
        236,
        178,
        64
      ],
      "accounts": [
        {
          "name": "resolver",
          "docs": [
            "Permissionless. The resolver pays the fee and gains nothing."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.fixture_id",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.duel_id",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "dailyScoresMerkleRoots"
        },
        {
          "name": "txoracleProgram",
          "address": "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"
        }
      ],
      "args": [
        {
          "name": "ts",
          "type": "i64"
        },
        {
          "name": "fixtureSummary",
          "type": {
            "defined": {
              "name": "scoresBatchSummary"
            }
          }
        },
        {
          "name": "fixtureProof",
          "type": {
            "vec": {
              "defined": {
                "name": "proofNode"
              }
            }
          }
        },
        {
          "name": "mainTreeProof",
          "type": {
            "vec": {
              "defined": {
                "name": "proofNode"
              }
            }
          }
        },
        {
          "name": "statA",
          "type": {
            "defined": {
              "name": "statTerm"
            }
          }
        },
        {
          "name": "statB",
          "type": {
            "option": {
              "defined": {
                "name": "statTerm"
              }
            }
          }
        }
      ]
    },
    {
      "name": "settleClose",
      "discriminator": [
        151,
        229,
        199,
        24,
        177,
        153,
        171,
        49
      ],
      "accounts": [
        {
          "name": "settler",
          "writable": true,
          "signer": true
        },
        {
          "name": "prediction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "prediction.predictor",
                "account": "prediction"
              },
              {
                "kind": "account",
                "path": "prediction.id",
                "account": "prediction"
              }
            ]
          }
        },
        {
          "name": "fixtureFacts",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  105,
                  120,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "fixture_facts.fixture_id",
                "account": "fixtureFacts"
              }
            ]
          }
        },
        {
          "name": "dailyOddsMerkleRoots"
        },
        {
          "name": "txoracleProgram",
          "address": "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"
        }
      ],
      "args": [
        {
          "name": "closeTs",
          "type": "i64"
        },
        {
          "name": "priceIndex",
          "type": "u8"
        },
        {
          "name": "odds",
          "type": {
            "defined": {
              "name": "odds"
            }
          }
        },
        {
          "name": "summary",
          "type": {
            "defined": {
              "name": "oddsBatchSummary"
            }
          }
        },
        {
          "name": "subTreeProof",
          "type": {
            "vec": {
              "defined": {
                "name": "proofNode"
              }
            }
          }
        },
        {
          "name": "mainTreeProof",
          "type": {
            "vec": {
              "defined": {
                "name": "proofNode"
              }
            }
          }
        }
      ]
    },
    {
      "name": "settleOutcome",
      "discriminator": [
        204,
        183,
        148,
        170,
        112,
        151,
        178,
        121
      ],
      "accounts": [
        {
          "name": "settler",
          "writable": true,
          "signer": true
        },
        {
          "name": "prediction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "prediction.predictor",
                "account": "prediction"
              },
              {
                "kind": "account",
                "path": "prediction.id",
                "account": "prediction"
              }
            ]
          }
        },
        {
          "name": "dailyScoresMerkleRoots"
        },
        {
          "name": "txoracleProgram",
          "address": "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"
        }
      ],
      "args": [
        {
          "name": "ts",
          "type": "i64"
        },
        {
          "name": "fixtureSummary",
          "type": {
            "defined": {
              "name": "scoresBatchSummary"
            }
          }
        },
        {
          "name": "fixtureProof",
          "type": {
            "vec": {
              "defined": {
                "name": "proofNode"
              }
            }
          }
        },
        {
          "name": "mainTreeProof",
          "type": {
            "vec": {
              "defined": {
                "name": "proofNode"
              }
            }
          }
        },
        {
          "name": "statA",
          "type": {
            "defined": {
              "name": "statTerm"
            }
          }
        },
        {
          "name": "statB",
          "type": {
            "option": {
              "defined": {
                "name": "statTerm"
              }
            }
          }
        }
      ]
    },
    {
      "name": "voidPrediction",
      "discriminator": [
        178,
        11,
        223,
        122,
        135,
        194,
        16,
        235
      ],
      "accounts": [
        {
          "name": "predictor",
          "writable": true,
          "signer": true,
          "relations": [
            "prediction"
          ]
        },
        {
          "name": "prediction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "predictor"
              },
              {
                "kind": "account",
                "path": "prediction.id",
                "account": "prediction"
              }
            ]
          }
        }
      ],
      "args": []
    }
  ],
  "accounts": [
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
      "name": "duel",
      "discriminator": [
        126,
        229,
        210,
        60,
        177,
        135,
        124,
        224
      ]
    },
    {
      "name": "fixtureFacts",
      "discriminator": [
        236,
        66,
        236,
        26,
        57,
        238,
        239,
        28
      ]
    },
    {
      "name": "prediction",
      "discriminator": [
        98,
        127,
        141,
        187,
        218,
        33,
        8,
        14
      ]
    }
  ],
  "events": [
    {
      "name": "duelCreated",
      "discriminator": [
        137,
        77,
        22,
        196,
        90,
        147,
        23,
        37
      ]
    },
    {
      "name": "duelJoined",
      "discriminator": [
        44,
        42,
        14,
        246,
        9,
        32,
        169,
        167
      ]
    },
    {
      "name": "duelResolved",
      "discriminator": [
        224,
        245,
        214,
        212,
        111,
        151,
        50,
        5
      ]
    },
    {
      "name": "duelSettled",
      "discriminator": [
        254,
        160,
        50,
        193,
        155,
        112,
        122,
        64
      ]
    },
    {
      "name": "entryProven",
      "discriminator": [
        70,
        205,
        205,
        24,
        208,
        184,
        255,
        33
      ]
    },
    {
      "name": "fixtureProven",
      "discriminator": [
        127,
        114,
        84,
        106,
        200,
        170,
        132,
        78
      ]
    },
    {
      "name": "predictionClosed",
      "discriminator": [
        166,
        86,
        249,
        29,
        59,
        215,
        25,
        26
      ]
    },
    {
      "name": "predictionOpened",
      "discriminator": [
        16,
        202,
        75,
        82,
        218,
        107,
        148,
        47
      ]
    },
    {
      "name": "predictionSettled",
      "discriminator": [
        8,
        117,
        33,
        63,
        201,
        197,
        58,
        208
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "oddsProofRejected",
      "msg": "Odds proof rejected by txoracle"
    },
    {
      "code": 6001,
      "name": "statProofRejected",
      "msg": "Stat proof rejected by txoracle"
    },
    {
      "code": 6002,
      "name": "fixtureMismatch",
      "msg": "Odds record fixture does not match prediction"
    },
    {
      "code": 6003,
      "name": "timestampMismatch",
      "msg": "Record timestamp does not match argument"
    },
    {
      "code": 6004,
      "name": "invalidMarket",
      "msg": "Invalid market kind"
    },
    {
      "code": 6005,
      "name": "invalidSelection",
      "msg": "Invalid selection for market"
    },
    {
      "code": 6006,
      "name": "invalidPriceIndex",
      "msg": "Invalid price index"
    },
    {
      "code": 6007,
      "name": "invalidPrice",
      "msg": "Price must be positive"
    },
    {
      "code": 6008,
      "name": "statKeyMismatch",
      "msg": "Stat key does not match prediction terms"
    },
    {
      "code": 6009,
      "name": "missingSecondStat",
      "msg": "Second stat required for this market"
    },
    {
      "code": 6010,
      "name": "badState",
      "msg": "Prediction is not in the required state"
    },
    {
      "code": 6011,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6012,
      "name": "fixtureProofRejected",
      "msg": "Fixture proof rejected by txoracle"
    },
    {
      "code": 6013,
      "name": "fixtureIdMismatch",
      "msg": "Proven fixture record does not match the requested fixture id"
    },
    {
      "code": 6014,
      "name": "marketTypeMismatch",
      "msg": "Odds record is for a different market type"
    },
    {
      "code": 6015,
      "name": "marketPeriodMismatch",
      "msg": "Odds record is for a different match period"
    },
    {
      "code": 6016,
      "name": "lineMismatch",
      "msg": "Odds record line does not match the prediction line"
    },
    {
      "code": 6017,
      "name": "unsupportedLine",
      "msg": "Line is not settleable as a single predicate (whole or quarter line)"
    },
    {
      "code": 6018,
      "name": "priceNameMismatch",
      "msg": "Price index does not name the selected outcome"
    },
    {
      "code": 6019,
      "name": "marketHasNoOddsLine",
      "msg": "This market has no consensus odds line and cannot carry CLV"
    },
    {
      "code": 6020,
      "name": "marketFamilyMismatch",
      "msg": "Market cannot be resolved against this stat family"
    },
    {
      "code": 6021,
      "name": "unsupportedPeriod",
      "msg": "Unsupported match period"
    },
    {
      "code": 6022,
      "name": "entryAfterKickoff",
      "msg": "Entry line is timestamped at or after the proven kickoff"
    },
    {
      "code": 6023,
      "name": "closeAfterKickoff",
      "msg": "Closing line is timestamped after the proven kickoff"
    },
    {
      "code": 6024,
      "name": "lineIsInPlay",
      "msg": "Closing line was quoted in-play; it is not a closing line"
    },
    {
      "code": 6025,
      "name": "unexpectedSecondStat",
      "msg": "Second stat supplied for a single-stat market"
    },
    {
      "code": 6026,
      "name": "entryRecordMismatch",
      "msg": "Odds record is not the quote this prediction was opened against"
    },
    {
      "code": 6027,
      "name": "invalidStake",
      "msg": "Stake must be greater than zero"
    },
    {
      "code": 6028,
      "name": "duelExpired",
      "msg": "The fixture has kicked off; this duel can no longer be created or joined"
    },
    {
      "code": 6029,
      "name": "selfDuel",
      "msg": "A duel needs two sides"
    },
    {
      "code": 6030,
      "name": "stakeMintMismatch",
      "msg": "Stake mint does not match the duel"
    },
    {
      "code": 6031,
      "name": "wrongWinner",
      "msg": "Account is not the winner implied by the proven outcome"
    },
    {
      "code": 6032,
      "name": "refundTooEarly",
      "msg": "The refund grace period has not elapsed"
    }
  ],
  "types": [
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
            "name": "txoracleProgram",
            "type": "pubkey"
          },
          {
            "name": "predictionCount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "duel",
      "docs": [
        "A head-to-head wager on any stat predicate, escrowed in a neutral vault and",
        "released by a Merkle proof. No admin, no oracle, no rake.",
        "",
        "This is the surface for markets no bookmaker lists — combined corners, cards,",
        "per-half totals — because it needs only `validate_stat`, never a consensus line.",
        "",
        "Note the stake is **never TxL**: the TxLINE credit token is locked to its own",
        "program for data authorisation and may not be transferred peer-to-peer."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duelId",
            "type": "u64"
          },
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "taker",
            "docs": [
              "`Pubkey::default()` until someone joins."
            ],
            "type": "pubkey"
          },
          {
            "name": "stakeMint",
            "type": "pubkey"
          },
          {
            "name": "stakeAmount",
            "docs": [
              "Each side stakes this; the winner takes both."
            ],
            "type": "u64"
          },
          {
            "name": "market",
            "type": {
              "defined": {
                "name": "marketKind"
              }
            }
          },
          {
            "name": "family",
            "type": {
              "defined": {
                "name": "statFamily"
              }
            }
          },
          {
            "name": "period",
            "type": "u16"
          },
          {
            "name": "selection",
            "type": "u8"
          },
          {
            "name": "lineX10",
            "type": "i16"
          },
          {
            "name": "statAKey",
            "type": "u32"
          },
          {
            "name": "statBKey",
            "type": "u32"
          },
          {
            "name": "hasStatB",
            "type": "bool"
          },
          {
            "name": "opAdd",
            "type": "bool"
          },
          {
            "name": "comparison",
            "type": "u8"
          },
          {
            "name": "threshold",
            "type": "i32"
          },
          {
            "name": "creatorTakesTrue",
            "docs": [
              "The creator wins iff the proven predicate equals this."
            ],
            "type": "bool"
          },
          {
            "name": "outcomeTrue",
            "docs": [
              "Written by `resolve_duel` from the CPI's return value. Meaningless until Resolved."
            ],
            "type": "bool"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "duelStatus"
              }
            }
          },
          {
            "name": "expiresAt",
            "docs": [
              "The PROVEN kickoff. A duel cannot be created or joined past it."
            ],
            "type": "i64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "settledAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "duelCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duelId",
            "type": "u64"
          },
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "stakeMint",
            "type": "pubkey"
          },
          {
            "name": "stakeAmount",
            "type": "u64"
          },
          {
            "name": "creatorTakesTrue",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "duelJoined",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duelId",
            "type": "u64"
          },
          {
            "name": "taker",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "duelResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duelId",
            "type": "u64"
          },
          {
            "name": "outcomeTrue",
            "type": "bool"
          },
          {
            "name": "winner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "duelSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duelId",
            "type": "u64"
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "payout",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "duelStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "matched"
          },
          {
            "name": "resolved"
          },
          {
            "name": "settled"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "refunded"
          }
        ]
      }
    },
    {
      "name": "entryProven",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "predictor",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "entryProbBps",
            "type": "u32"
          },
          {
            "name": "entryTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "fixture",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "competition",
            "type": "string"
          },
          {
            "name": "competitionId",
            "type": "i32"
          },
          {
            "name": "fixtureGroupId",
            "type": "i32"
          },
          {
            "name": "participant1Id",
            "type": "i32"
          },
          {
            "name": "participant1",
            "type": "string"
          },
          {
            "name": "participant2Id",
            "type": "i32"
          },
          {
            "name": "participant2",
            "type": "string"
          },
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "participant1IsHome",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "fixtureBatchSummary",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "competitionId",
            "type": "i32"
          },
          {
            "name": "competition",
            "type": "string"
          },
          {
            "name": "updateStats",
            "type": {
              "defined": {
                "name": "fixtureUpdateStats"
              }
            }
          },
          {
            "name": "updateSubTreeRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "fixtureFacts",
      "docs": [
        "Kickoff time and identity for one fixture, proven once via `validate_fixture`",
        "and then reused by every prediction on that fixture.",
        "",
        "Write-once by construction (`init`, never `init_if_needed`): the kickoff a",
        "prediction was judged against can never be rewritten underneath it."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fixtureId",
            "docs": [
              "The public id `/odds` and `/scores` key off, taken from `summary.fixture_id`,",
              "which the Merkle proof binds to the snapshot."
            ],
            "type": "i64"
          },
          {
            "name": "startTime",
            "docs": [
              "PROVEN kickoff — the anchor for every timing guard in this program."
            ],
            "type": "i64"
          },
          {
            "name": "participant1Id",
            "type": "i32"
          },
          {
            "name": "participant2Id",
            "type": "i32"
          },
          {
            "name": "competitionId",
            "type": "i32"
          },
          {
            "name": "provenAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "fixtureProven",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "prover",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "fixtureUpdateStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "updateCount",
            "type": "u32"
          },
          {
            "name": "minTimestamp",
            "type": "i64"
          },
          {
            "name": "maxTimestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "result1x2"
          },
          {
            "name": "totalsOu"
          },
          {
            "name": "combinedTotal"
          },
          {
            "name": "teamTotal"
          }
        ]
      }
    },
    {
      "name": "odds",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "messageId",
            "type": "string"
          },
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "bookmaker",
            "type": "string"
          },
          {
            "name": "bookmakerId",
            "type": "i32"
          },
          {
            "name": "superOddsType",
            "type": "string"
          },
          {
            "name": "gameState",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "inRunning",
            "type": "bool"
          },
          {
            "name": "marketParameters",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "marketPeriod",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "priceNames",
            "type": {
              "vec": "string"
            }
          },
          {
            "name": "prices",
            "type": {
              "vec": "i32"
            }
          }
        ]
      }
    },
    {
      "name": "oddsBatchSummary",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "updateStats",
            "type": {
              "defined": {
                "name": "oddsUpdateStats"
              }
            }
          },
          {
            "name": "oddsSubTreeRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "oddsUpdateStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "updateCount",
            "type": "u32"
          },
          {
            "name": "minTimestamp",
            "type": "i64"
          },
          {
            "name": "maxTimestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "predStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "entryProven"
          },
          {
            "name": "closed"
          },
          {
            "name": "settled"
          },
          {
            "name": "void"
          }
        ]
      }
    },
    {
      "name": "prediction",
      "docs": [
        "A single CLV prediction. Entry/close implied probabilities and the outcome are",
        "all written only after a txoracle Merkle proof verifies."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "predictor",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "market",
            "type": {
              "defined": {
                "name": "marketKind"
              }
            }
          },
          {
            "name": "family",
            "type": {
              "defined": {
                "name": "statFamily"
              }
            }
          },
          {
            "name": "period",
            "type": "u16"
          },
          {
            "name": "selection",
            "type": "u8"
          },
          {
            "name": "lineX10",
            "type": "i16"
          },
          {
            "name": "statAKey",
            "type": "u32"
          },
          {
            "name": "statBKey",
            "type": "u32"
          },
          {
            "name": "hasStatB",
            "type": "bool"
          },
          {
            "name": "opAdd",
            "type": "bool"
          },
          {
            "name": "comparison",
            "type": "u8"
          },
          {
            "name": "threshold",
            "type": "i32"
          },
          {
            "name": "entryTs",
            "type": "i64"
          },
          {
            "name": "entryMsgHash",
            "docs": [
              "sha256 of the entry odds record's `MessageId`. Pins *which* quote was taken,",
              "so `prove_entry` cannot substitute a different record sharing the same ts."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "entryProbBps",
            "type": "u32"
          },
          {
            "name": "ranked",
            "docs": [
              "True iff the predictor committed *before* the proven kickoff, in real",
              "wall-clock. Unranked predictions still settle; they just don't score."
            ],
            "type": "bool"
          },
          {
            "name": "closeTs",
            "type": "i64"
          },
          {
            "name": "closeProbBps",
            "type": "u32"
          },
          {
            "name": "clvBps",
            "type": "i32"
          },
          {
            "name": "outcomeWin",
            "type": "bool"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "predStatus"
              }
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "settledAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "predictionClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "predictor",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "closeProbBps",
            "type": "u32"
          },
          {
            "name": "clvBps",
            "type": "i32"
          }
        ]
      }
    },
    {
      "name": "predictionOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "predictor",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "entryTs",
            "type": "i64"
          },
          {
            "name": "ranked",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "predictionSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "predictor",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "outcomeWin",
            "type": "bool"
          },
          {
            "name": "clvBps",
            "type": "i32"
          },
          {
            "name": "entryProbBps",
            "type": "u32"
          },
          {
            "name": "closeProbBps",
            "type": "u32"
          },
          {
            "name": "ranked",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "proofNode",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "isRightSibling",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "scoreStat",
      "docs": [
        "The on-chain representation of a single, provable key-value statistic.",
        "This is the leaf of the inner-most Merkle tree."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "key",
            "type": "u32"
          },
          {
            "name": "value",
            "type": "i32"
          },
          {
            "name": "period",
            "type": "i32"
          }
        ]
      }
    },
    {
      "name": "scoresBatchSummary",
      "docs": [
        "The summary for a single fixture's scores events within a 5-minute batch.",
        "This contains the root of the sub-tree of all events for that fixture."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "updateStats",
            "type": {
              "defined": {
                "name": "scoresUpdateStats"
              }
            }
          },
          {
            "name": "eventsSubTreeRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "scoresUpdateStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "updateCount",
            "type": "i32"
          },
          {
            "name": "minTimestamp",
            "type": "i64"
          },
          {
            "name": "maxTimestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "statFamily",
      "docs": [
        "Which stat family a market resolves against. Base keys per participant:",
        "goals 1/2, yellows 3/4, reds 5/6, corners 7/8 (soccer)."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "goals"
          },
          {
            "name": "yellows"
          },
          {
            "name": "reds"
          },
          {
            "name": "corners"
          }
        ]
      }
    },
    {
      "name": "statTerm",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "statToProve",
            "type": {
              "defined": {
                "name": "scoreStat"
              }
            }
          },
          {
            "name": "eventStatRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "statProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "duelSeed",
      "type": "bytes",
      "value": "[100, 117, 101, 108]"
    },
    {
      "name": "duelVaultSeed",
      "type": "bytes",
      "value": "[100, 117, 101, 108, 95, 118, 97, 117, 108, 116]"
    },
    {
      "name": "fixtureSeed",
      "type": "bytes",
      "value": "[102, 105, 120, 116, 117, 114, 101]"
    },
    {
      "name": "predictionSeed",
      "type": "bytes",
      "value": "[112, 114, 101, 100, 105, 99, 116, 105, 111, 110]"
    }
  ]
};
