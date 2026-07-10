//! Prop duels: a trustless head-to-head on any stat predicate.
//!
//!   create_duel  → escrow the creator's stake, fix the terms
//!   join_duel    → escrow the taker's stake
//!   resolve_duel → CPI validate_stat; record the proven predicate. No funds move.
//!   claim_duel   → pay the winner both stakes, close the vault
//!   cancel_duel  → unmatched: refund the creator
//!   refund_duel  → matched but never provable: refund both
//!
//! Resolution and payout are separate instructions for the same reason `prove_entry`
//! is separate from `open_prediction`: one verifier CPI per transaction keeps the
//! proof vectors inside the transaction size limit, and it makes the state machine
//! legible — `Resolved` means "the chain knows the answer", `Settled` means "the
//! money moved".
//!
//! The stake is devnet USDT (a classic SPL Token mint) but the vault is declared over
//! `TokenInterface`, so a Token-2022 stake mint would work unchanged. It is never TxL:
//! the TxLINE credit token is locked to its own program for data authorisation.
//!
//! No admin key appears anywhere below. `resolve_duel` and `claim_duel` are
//! permissionless: anyone may land them, and neither has any freedom in what it
//! writes. The winner is a pure function of the on-chain scores root and the terms
//! fixed when the duel was created.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

use crate::constants::{DUEL_REFUND_GRACE_MS, DUEL_SEED, DUEL_VAULT_SEED, FIXTURE_SEED};
use crate::error::ClvError;
use crate::instructions::open_prediction::now_ms;
use crate::market::{comparison_ty, derive_terms};
use crate::state::{
    Duel, DuelCreated, DuelJoined, DuelResolved, DuelSettled, DuelStatus, FixtureFacts, MarketKind,
    StatFamily,
};
use crate::txoracle::program::Txoracle;
use crate::txoracle::types::{BinaryExpression, ProofNode, ScoresBatchSummary, StatTerm, TraderPredicate};

/// Does the proven predicate favour the creator?
///
/// The creator nominated a side (`creator_takes_true`); the chain proved the
/// predicate (`outcome_true`). They win exactly when the two agree. Pure, so the
/// payout rule is unit-testable without a validator — see `tests/market.rs`.
pub fn creator_wins(outcome_true: bool, creator_takes_true: bool) -> bool {
    outcome_true == creator_takes_true
}

fn winner_of(duel: &Duel) -> Pubkey {
    if creator_wins(duel.outcome_true, duel.creator_takes_true) { duel.creator } else { duel.taker }
}

// ─────────────────────────────── create_duel ───────────────────────────────

#[derive(Accounts)]
#[instruction(duel_id: u64, fixture_id: i64)]
pub struct CreateDuel<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        seeds = [FIXTURE_SEED, &fixture_id.to_le_bytes()],
        bump = fixture_facts.bump,
        constraint = fixture_facts.fixture_id == fixture_id @ ClvError::FixtureMismatch,
    )]
    pub fixture_facts: Account<'info, FixtureFacts>,
    #[account(
        init,
        payer = creator,
        space = 8 + Duel::INIT_SPACE,
        seeds = [DUEL_SEED, &fixture_id.to_le_bytes(), &duel_id.to_le_bytes()],
        bump
    )]
    pub duel: Account<'info, Duel>,
    /// Neutral escrow. Authority is the duel PDA, so no human can move these funds.
    #[account(
        init,
        payer = creator,
        seeds = [DUEL_VAULT_SEED, duel.key().as_ref()],
        bump,
        token::mint = stake_mint,
        token::authority = duel,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = stake_mint,
        token::authority = creator,
    )]
    pub creator_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn create(
    ctx: Context<CreateDuel>,
    duel_id: u64,
    fixture_id: i64,
    market: MarketKind,
    family: StatFamily,
    period: u16,
    selection: u8,
    line_x10: i16,
    stake_amount: u64,
    creator_takes_true: bool,
) -> Result<()> {
    require!(stake_amount > 0, ClvError::InvalidStake);
    let start_time = ctx.accounts.fixture_facts.start_time;
    let now = now_ms()?;
    // A duel offered after the whistle is not a prediction about anything.
    require!(now < start_time, ClvError::DuelExpired);

    // Validates the market/selection/line/family/period combination and fixes the
    // predicate for good. Unlike a Prediction, any market is allowed here — a duel
    // needs a provable stat, not a consensus price.
    let terms = derive_terms(market, selection, line_x10, period, family)?;

    let cpi = CpiContext::new(
        ctx.accounts.token_program.key(),
        TransferChecked {
            from: ctx.accounts.creator_token_account.to_account_info(),
            mint: ctx.accounts.stake_mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.creator.to_account_info(),
        },
    );
    transfer_checked(cpi, stake_amount, ctx.accounts.stake_mint.decimals)?;

    let d = &mut ctx.accounts.duel;
    d.duel_id = duel_id;
    d.fixture_id = fixture_id;
    d.creator = ctx.accounts.creator.key();
    d.taker = Pubkey::default();
    d.stake_mint = ctx.accounts.stake_mint.key();
    d.stake_amount = stake_amount;
    d.market = market;
    d.family = family;
    d.period = period;
    d.selection = selection;
    d.line_x10 = line_x10;
    d.stat_a_key = terms.stat_a_key;
    d.stat_b_key = terms.stat_b_key;
    d.has_stat_b = terms.has_stat_b;
    d.op_add = terms.op_add;
    d.comparison = terms.comparison;
    d.threshold = terms.threshold;
    d.creator_takes_true = creator_takes_true;
    d.outcome_true = false;
    d.status = DuelStatus::Open;
    d.expires_at = start_time;
    d.created_at = now;
    d.settled_at = 0;
    d.bump = ctx.bumps.duel;
    d.vault_bump = ctx.bumps.vault;

    emit!(DuelCreated {
        duel_id, fixture_id,
        creator: d.creator,
        stake_mint: d.stake_mint,
        stake_amount,
        creator_takes_true,
    });
    Ok(())
}

// ──────────────────────────────── join_duel ────────────────────────────────

#[derive(Accounts)]
pub struct JoinDuel<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,
    #[account(
        mut,
        seeds = [DUEL_SEED, &duel.fixture_id.to_le_bytes(), &duel.duel_id.to_le_bytes()],
        bump = duel.bump
    )]
    pub duel: Account<'info, Duel>,
    #[account(mut, seeds = [DUEL_VAULT_SEED, duel.key().as_ref()], bump = duel.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(address = duel.stake_mint @ ClvError::StakeMintMismatch)]
    pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = stake_mint,
        token::authority = taker,
    )]
    pub taker_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn join(ctx: Context<JoinDuel>) -> Result<()> {
    let (status, expires_at, creator, stake_amount) = {
        let d = &ctx.accounts.duel;
        (d.status, d.expires_at, d.creator, d.stake_amount)
    };
    require!(status == DuelStatus::Open, ClvError::BadState);
    require!(ctx.accounts.taker.key() != creator, ClvError::SelfDuel);
    // `expires_at` is the Merkle-proven kickoff, not a client-supplied deadline.
    require!(now_ms()? < expires_at, ClvError::DuelExpired);

    let cpi = CpiContext::new(
        ctx.accounts.token_program.key(),
        TransferChecked {
            from: ctx.accounts.taker_token_account.to_account_info(),
            mint: ctx.accounts.stake_mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.taker.to_account_info(),
        },
    );
    transfer_checked(cpi, stake_amount, ctx.accounts.stake_mint.decimals)?;

    let d = &mut ctx.accounts.duel;
    d.taker = ctx.accounts.taker.key();
    d.status = DuelStatus::Matched;
    emit!(DuelJoined { duel_id: d.duel_id, taker: d.taker });
    Ok(())
}

// ─────────────────────────────── resolve_duel ───────────────────────────────

#[derive(Accounts)]
pub struct ResolveDuel<'info> {
    /// Permissionless. The resolver pays the fee and gains nothing.
    #[account(mut)]
    pub resolver: Signer<'info>,
    #[account(
        mut,
        seeds = [DUEL_SEED, &duel.fixture_id.to_le_bytes(), &duel.duel_id.to_le_bytes()],
        bump = duel.bump
    )]
    pub duel: Account<'info, Duel>,
    /// CHECK: The daily scores Merkle roots PDA; validated inside txoracle by its seeds/owner.
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,
    pub txoracle_program: Program<'info, Txoracle>,
}

/// Prove the duel's predicate against the scores root. Moves no funds.
///
/// The caller supplies proven stats and their Merkle branches but chooses nothing:
/// keys, operator, comparison and threshold all come from the Duel account, fixed
/// when the bet was struck.
pub fn resolve(
    ctx: Context<ResolveDuel>,
    ts: i64,
    fixture_summary: ScoresBatchSummary,
    fixture_proof: Vec<ProofNode>,
    main_tree_proof: Vec<ProofNode>,
    stat_a: StatTerm,
    stat_b: Option<StatTerm>,
) -> Result<()> {
    let (status, fixture_id, sa_key, sb_key, has_stat_b, op_add, comparison, threshold) = {
        let d = &ctx.accounts.duel;
        (d.status, d.fixture_id, d.stat_a_key, d.stat_b_key, d.has_stat_b, d.op_add, d.comparison, d.threshold)
    };
    require!(status == DuelStatus::Matched, ClvError::BadState);
    require!(fixture_summary.fixture_id == fixture_id, ClvError::FixtureMismatch);
    require!(stat_a.stat_to_prove.key == sa_key, ClvError::StatKeyMismatch);

    let (stat_b_opt, op_opt) = if has_stat_b {
        let b = stat_b.ok_or(error!(ClvError::MissingSecondStat))?;
        require!(b.stat_to_prove.key == sb_key, ClvError::StatKeyMismatch);
        let op = if op_add { BinaryExpression::Add } else { BinaryExpression::Subtract };
        (Some(b), Some(op))
    } else {
        require!(stat_b.is_none(), ClvError::UnexpectedSecondStat);
        (None, None)
    };

    let predicate = TraderPredicate { threshold, comparison: comparison_ty(comparison) };
    let txp = ctx.accounts.txoracle_program.to_account_info();
    let root = ctx.accounts.daily_scores_merkle_roots.to_account_info();
    let outcome = crate::cpi::validate_stat(
        &txp, &root, ts, &fixture_summary, &fixture_proof, &main_tree_proof, &predicate, &stat_a, &stat_b_opt, &op_opt,
    )?;

    let d = &mut ctx.accounts.duel;
    d.outcome_true = outcome;
    d.status = DuelStatus::Resolved;
    let winner = winner_of(d);
    emit!(DuelResolved { duel_id: d.duel_id, outcome_true: outcome, winner });
    Ok(())
}

// ──────────────────────────────── claim_duel ────────────────────────────────

#[derive(Accounts)]
pub struct ClaimDuel<'info> {
    /// Permissionless: winner, loser or keeper. The destination is fixed on-chain.
    #[account(mut)]
    pub claimer: Signer<'info>,
    #[account(
        mut,
        close = creator,
        seeds = [DUEL_SEED, &duel.fixture_id.to_le_bytes(), &duel.duel_id.to_le_bytes()],
        bump = duel.bump
    )]
    pub duel: Account<'info, Duel>,
    #[account(mut, seeds = [DUEL_VAULT_SEED, duel.key().as_ref()], bump = duel.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: rent destination; must be the duel's creator, who paid it.
    #[account(mut, address = duel.creator @ ClvError::WrongWinner)]
    pub creator: UncheckedAccount<'info>,
    /// CHECK: asserted to equal the winner implied by the proven outcome.
    pub winner: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = stake_mint,
        token::authority = winner,
    )]
    pub winner_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(address = duel.stake_mint @ ClvError::StakeMintMismatch)]
    pub stake_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Pay both stakes to whichever side the proven predicate favours, then close the vault.
pub fn claim(ctx: Context<ClaimDuel>) -> Result<()> {
    require!(ctx.accounts.duel.status == DuelStatus::Resolved, ClvError::BadState);
    let expected = winner_of(&ctx.accounts.duel);
    require!(ctx.accounts.winner.key() == expected, ClvError::WrongWinner);

    let payout = ctx.accounts.duel.stake_amount.checked_mul(2).ok_or(error!(ClvError::Overflow))?;
    let fixture_id = ctx.accounts.duel.fixture_id.to_le_bytes();
    let duel_id = ctx.accounts.duel.duel_id.to_le_bytes();
    let bump = [ctx.accounts.duel.bump];
    let seeds: &[&[u8]] = &[DUEL_SEED, &fixture_id, &duel_id, &bump];
    let signer: &[&[&[u8]]] = &[seeds];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.stake_mint.to_account_info(),
                to: ctx.accounts.winner_token_account.to_account_info(),
                authority: ctx.accounts.duel.to_account_info(),
            },
            signer,
        ),
        payout,
        ctx.accounts.stake_mint.decimals,
    )?;

    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.creator.to_account_info(),
            authority: ctx.accounts.duel.to_account_info(),
        },
        signer,
    ))?;

    let d = &mut ctx.accounts.duel;
    d.status = DuelStatus::Settled;
    d.settled_at = now_ms()?;
    emit!(DuelSettled { duel_id: d.duel_id, winner: expected, payout });
    Ok(())
}

// ─────────────────────────── cancel_duel / refund_duel ───────────────────────

#[derive(Accounts)]
pub struct CancelDuel<'info> {
    #[account(mut, address = duel.creator @ ClvError::WrongWinner)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        close = creator,
        seeds = [DUEL_SEED, &duel.fixture_id.to_le_bytes(), &duel.duel_id.to_le_bytes()],
        bump = duel.bump
    )]
    pub duel: Account<'info, Duel>,
    #[account(mut, seeds = [DUEL_VAULT_SEED, duel.key().as_ref()], bump = duel.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = stake_mint,
        token::authority = creator,
    )]
    pub creator_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(address = duel.stake_mint @ ClvError::StakeMintMismatch)]
    pub stake_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Withdraw an offer nobody took.
pub fn cancel(ctx: Context<CancelDuel>) -> Result<()> {
    require!(ctx.accounts.duel.status == DuelStatus::Open, ClvError::BadState);
    let amount = ctx.accounts.duel.stake_amount;
    let fixture_id = ctx.accounts.duel.fixture_id.to_le_bytes();
    let duel_id = ctx.accounts.duel.duel_id.to_le_bytes();
    let bump = [ctx.accounts.duel.bump];
    let seeds: &[&[u8]] = &[DUEL_SEED, &fixture_id, &duel_id, &bump];
    let signer: &[&[&[u8]]] = &[seeds];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.stake_mint.to_account_info(),
                to: ctx.accounts.creator_token_account.to_account_info(),
                authority: ctx.accounts.duel.to_account_info(),
            },
            signer,
        ),
        amount,
        ctx.accounts.stake_mint.decimals,
    )?;
    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.creator.to_account_info(),
            authority: ctx.accounts.duel.to_account_info(),
        },
        signer,
    ))?;
    ctx.accounts.duel.status = DuelStatus::Cancelled;
    Ok(())
}

#[derive(Accounts)]
pub struct RefundDuel<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        close = creator,
        seeds = [DUEL_SEED, &duel.fixture_id.to_le_bytes(), &duel.duel_id.to_le_bytes()],
        bump = duel.bump
    )]
    pub duel: Account<'info, Duel>,
    #[account(mut, seeds = [DUEL_VAULT_SEED, duel.key().as_ref()], bump = duel.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: rent destination and refund recipient; fixed to the duel's creator.
    #[account(mut, address = duel.creator @ ClvError::WrongWinner)]
    pub creator: UncheckedAccount<'info>,
    /// CHECK: refund recipient; fixed to the duel's taker.
    #[account(address = duel.taker @ ClvError::WrongWinner)]
    pub taker: UncheckedAccount<'info>,
    #[account(mut, token::mint = stake_mint, token::authority = creator)]
    pub creator_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = stake_mint, token::authority = taker)]
    pub taker_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(address = duel.stake_mint @ ClvError::StakeMintMismatch)]
    pub stake_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Escape hatch: a matched duel whose result never became provable. After the grace
/// window both sides take their own stake back. Nobody can trap the funds, and
/// nobody can trigger this early — `expires_at` is the proven kickoff.
pub fn refund(ctx: Context<RefundDuel>) -> Result<()> {
    require!(ctx.accounts.duel.status == DuelStatus::Matched, ClvError::BadState);
    let deadline = ctx.accounts.duel.expires_at.checked_add(DUEL_REFUND_GRACE_MS).ok_or(error!(ClvError::Overflow))?;
    require!(now_ms()? > deadline, ClvError::RefundTooEarly);

    let amount = ctx.accounts.duel.stake_amount;
    let fixture_id = ctx.accounts.duel.fixture_id.to_le_bytes();
    let duel_id = ctx.accounts.duel.duel_id.to_le_bytes();
    let bump = [ctx.accounts.duel.bump];
    let seeds: &[&[u8]] = &[DUEL_SEED, &fixture_id, &duel_id, &bump];
    let signer: &[&[&[u8]]] = &[seeds];
    let decimals = ctx.accounts.stake_mint.decimals;

    for to in [
        ctx.accounts.creator_token_account.to_account_info(),
        ctx.accounts.taker_token_account.to_account_info(),
    ] {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.stake_mint.to_account_info(),
                    to,
                    authority: ctx.accounts.duel.to_account_info(),
                },
                signer,
            ),
            amount,
            decimals,
        )?;
    }
    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.creator.to_account_info(),
            authority: ctx.accounts.duel.to_account_info(),
        },
        signer,
    ))?;
    ctx.accounts.duel.status = DuelStatus::Refunded;
    Ok(())
}
