pub mod duel;
pub mod initialize_config;
pub mod open_prediction;
pub mod prove_entry;
pub mod prove_fixture;
pub mod settle_close;
pub mod settle_outcome;
pub mod void_prediction;

// Globs are required: `#[derive(Accounts)]` emits hidden `__client_accounts_*`
// and `__cpi_client_accounts_*` modules that `#[program]` resolves at the crate
// root. The only ambiguity is each module's `handler`, which lib.rs always calls
// by its full path.
#[allow(ambiguous_glob_reexports)]
mod reexport {
    pub use super::duel::*;
    pub use super::initialize_config::*;
    pub use super::open_prediction::*;
    pub use super::prove_entry::*;
    pub use super::prove_fixture::*;
    pub use super::settle_close::*;
    pub use super::settle_outcome::*;
    pub use super::void_prediction::*;
}
pub use reexport::*;
