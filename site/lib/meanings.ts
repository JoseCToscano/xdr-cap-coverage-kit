// Plain-language meaning of union arms the live checker has flagged as first seen.
// Each line paraphrases the comment or definition for that arm in the Stellar XDR
// files (Stellar-transaction.x, Stellar-contract.x, Stellar-ledger-entries.x).
// Arms without an entry are shown without a meaning rather than with a guess.
export const ARM_MEANING: Record<string, string> = {
  "ClawbackResult.no_trust": "A Clawback operation failed because the account it targeted has no trustline for the asset.",
  "ClawbackClaimableBalanceResult.not_issuer": "A ClawbackClaimableBalance operation failed because its source account is not the issuer of the balance's asset.",
  "ClawbackClaimableBalanceResult.not_clawback_enabled": "A ClawbackClaimableBalance operation failed because the claimable balance does not have clawback enabled.",
  "AllowTrustResult.no_trust_line": "An AllowTrust operation failed because the trustor has no trustline for the asset.",
  "ScError.crypto": "A Soroban error value of type crypto, the type for errors in cryptographic operations.",
  "PathPaymentStrictReceiveResult.src_not_authorized": "A PathPaymentStrictReceive operation failed because the source account is not authorized to transfer the asset.",
  "SetOptionsResult.too_many_signers": "A SetOptions operation failed because the account already has the maximum number of signers.",
  "OperationBody.restore_footprint": "A RestoreFootprint operation: restores archived Soroban ledger entries.",
  "OperationResultTr.restore_footprint": "The result of a RestoreFootprint operation.",
  "RestoreFootprintResult.success": "A RestoreFootprint operation succeeded.",
  "ChangeTrustResult.not_auth_maintain_liabilities": "A ChangeTrust operation failed because an asset trustline it depends on is deauthorized.",
  "AccountMergeResult.immutable_set": "An AccountMerge operation failed because the source account has the AUTH_IMMUTABLE flag set.",
  "ContractCodeEntryExt.v0": "A contract code ledger entry in its v0 form, without the v1 extension that carries the code's cost inputs.",
};
