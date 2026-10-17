Category: Builder → Intelligent Contracts

Title: BrierCommit: Sealed forecasts with consensus-scored outcomes

BrierCommit is a GenLayer sealed-forecast primitive with exact Brier scores. Wallets commit salted integer probabilities bound to chain, instance, question and signer. UTC deadlines let resolution proceed after missed reveals. Leader and validators independently fetch two complete reports, hash their bytes and classify each outcome, including corrections, negation and decoy subjects. Validators require exact outcomes and audit source anchors without seeing forecasts. Concordant YES or NO reports atomically score revealed forecasts; conflicting or uncertain reports leave every score unset and permit retry. Points are immutable and nontransferable. Three StudioNet instances prove YES, NO and unresolved retry; 22 finalized MAJORITY_AGREE receipts include unauthorized commitment, bad opening and replay rejections. The repo has 44 tests and all 10,201 scoring-propriety grid pairs. Synthetic public reports demonstrate the protocol, not forecasting skill or physical truth. No monetary payout.

Repository: https://github.com/ehsanisildur-ux/brier-commit

Contract: https://github.com/ehsanisildur-ux/brier-commit/blob/main/contracts/brier_commit.py

Proofs: https://github.com/ehsanisildur-ux/brier-commit/blob/main/proofs/README.md

StudioNet contract: 0x7C2F5EcF49A5c4aBEA56099668313C70040EC916

Deployment: https://explorer-studio.genlayer.com/tx/0x952198ead40ceadcfed9ebe0f77aa2f8042baa7f665d8fcb2eed823357e3ea78
