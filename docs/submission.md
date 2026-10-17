Category: Builder → Intelligent Contracts

Title: BrierCommit: Sealed forecasts with consensus-scored outcomes

BrierCommit is a GenLayer commit/reveal forecasting primitive with exact Brier scores. Fixed wallets seal integer probabilities with salts bound to chain, contract, question and signer. UTC deadlines prevent missing reveals from blocking resolution. Leader and validators independently fetch two fixed full reports, verify snapshot hashes and classify the question against each source, including corrections, negation and decoy subjects. Validators require exact outcome agreement and audit source anchors without seeing forecasts. Matching definitive reports atomically score revealed forecasts; conflicting or unresolved reports leave every score unset and permit retry at the same URLs. Scores are immutable nontransferable points. Tests replay validators and verify strict propriety over all 10201 grid pairs. Synthetic public reports demonstrate the protocol, not real forecasting skill or physical truth.

Repository: https://github.com/ehsanisildur-ux/brier-commit

Contract: https://github.com/ehsanisildur-ux/brier-commit/blob/main/contracts/brier_commit.py

Proofs: https://github.com/ehsanisildur-ux/brier-commit/blob/main/proofs/README.md
