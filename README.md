# BrierCommit

Sealed probability forecasts, independent documentary outcome consensus, and exact onchain Brier scores.

BrierCommit is a standalone GenLayer forecasting primitive. The deployment freezes a binary question, two report URLs, a bounded roster of forecaster wallets and UTC commit/reveal deadlines. Participants commit salted forecasts before seeing anybody's opening. The commitment binds chain, contract instance, question, signer, integer probability and salt. Only the committing wallet can reveal, and an opening cannot be changed.

After every participant reveals, or the reveal deadline expires, anyone resolves. Leader and validators independently fetch both complete reports, hash the exact bytes, normalize paragraphs, interpret the question against each report and audit material anchors. Forecast values and scores are excluded from these prompts. Exact independent outcome agreement is required for each report. The two reports must also agree YES or NO before any score is written.

Conflicting or inconclusive reports produce AWAITING_OUTCOME, preserve all forecasts and leave every score unset. Anyone may retry the same fixed URLs later. Definitive resolution atomically records `10000 - (p - 100*y)^2` points per revealed forecast and zero for missed forecasts. The result is final. These are public, nontransferable score points with no monetary backing or redemption.

- [Pinned GenLayer contract](contracts/brier_commit.py)
- [Protocol and threat model](docs/architecture.md)
- [Direct tests and scoring properties](tests/direct/test_brier.py)
- [Synthetic source reports](reports)
- [Onchain proof status](proofs/README.md)
- [Submission draft](docs/submission.md)

```sh
pip install -r requirements-dev.txt
genvm-lint download --version v0.2.16
genvm-lint check contracts/brier_commit.py --json
python -m pytest -q
```

The manual proof workflow deploys on gasless StudioNet (chain 61999) using encrypted disposable CLI accounts. Test reports are already public and concern fictional completed tests: they demonstrate the protocol, not actual forecasting skill, physical events or private information. Both reports in the demonstration share a publisher; independent validator acquisition does not imply organizationally independent publishers.
