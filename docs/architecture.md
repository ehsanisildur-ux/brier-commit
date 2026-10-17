# BrierCommit protocol

## Distinct state and workflow

This contract implements sealed forecasting and proper scoring, rather than graph editing, voting, ranking, matching, certification or consumable claims. No owner can substitute a question, report URL or outcome after deployment. A final result assigns each participant's score automatically; there is no certificate-approval or redemption phase.

The constructor fixes an ASCII binary question, exactly two distinct report URLs, 2–5 unique nonzero wallet addresses and two ordered future UTC second deadlines within one year. Report URLs are bounded HTTPS raw GitHub `reports/*.md` paths under `main` or a full commit. The URL choice is part of the deployment's trust policy. Distinct URLs do not prove independent operators.

## Commitment domain

SHA-256 is computed over compact, ASCII JSON of the ordered array:

```
["BrierCommit-v1", "61999", "0xcontract_lowercase", "question", "0xwallet_lowercase", 80, "64-lowercase-hex-salt"]
```

Chain ID is a decimal string; probability is an integer 0–100. Address strings are lowercase. The question is exactly the stored ASCII string, with no trimming. Production clients must use a cryptographically random 32-byte salt; low-entropy salts leak the tiny probability search space. Reveals make the salt public. The fixture salts in saved completed proofs are public openings, not wallet secrets.

## Phases and liveness

`commit(digest)` accepts one immutable digest from each roster wallet before the commit deadline. `reveal(p,salt)` opens when all roster wallets have committed, or when the commit deadline passes. It closes at the reveal deadline. This prevents any participant from seeing another opening while still being able to add or replace a commitment. Wrong wallet, probability, salt, chain, instance or question cannot open the commitment.

`resolve()` opens early only when all roster members have revealed; otherwise it waits until the reveal deadline. Therefore a missing commitment or reveal cannot permanently block the protocol. At definitive resolution, missing forecasts score zero. Revealing any valid forecast scores at least zero, so withholding cannot improve that participant's score. This is not a claim of strategy-proof behavior under external payoffs, collusion or a manipulated oracle.

Timestamp decisions use `gl.message_raw['datetime']`, supplied by GenVM transaction context. They never use a local clock or nondeterministic web time. Deadline comparisons operate on integer UTC seconds. Equality closes the corresponding submission phase.

## Consequential consensus

Both complete UTF-8 report bodies are fetched inside leader execution and independently inside each validator. Each is bounded to 40–10000 bytes and at most twelve normalized paragraphs. SHA-256 binds raw bytes; the complete raw text and paragraph normalization are retained. Validators require their fetched snapshots to equal the leader's snapshots, including hashes. Publisher changes during consensus cause disagreement rather than mixing revisions.

For each report alone, the leader and validator independently decide YES, NO or UNRESOLVED. They inspect subject, cutoff, continuous-run requirement, explicit corrections, negation and scope. Missing success evidence is not NO. Plans, predictions and other subjects are not observations. Every accepted leader paragraph is separately audited against the full report and question. Negative and unresolved decisions receive the same substantive checks. The extraction and audit prompts contain neither forecasts nor score values.

Validators compare exact consequential outcomes, without confidence tolerances. A source anchor may differ between independent extractions, but the leader anchor must still be materially supported. Shared deterministic source errors require exact failure-message agreement; LLM or malformed-output failures cannot authorize acceptance.

Two agreed YES readings or two agreed NO readings authorize scoring. Every other combination records AWAITING_OUTCOME and leaves scores at -1 (unset). Retries use the same immutable URLs and immutable forecasts. `main` feeds can later publish a definitive report; commit-pinned feeds cannot change and may stay unresolved forever. Only the latest complete attempt is kept, bounding storage, while the attempt counter increases. Transaction receipts preserve historical accepted attempts.

## Score semantics

For integer percentage `p`, the reward is 10000 minus squared percentage error. At YES, 80 scores 9600 and 20 scores 3600; at NO the scores reverse. At 50, both outcomes score 7500. Scores are independent absolute measures; they are not a fixed prize pool or relative ranking. The formula is strictly proper on the integer probability grid conditional on a truthful binary outcome. Expected-score tests check every one of the 10201 true-probability/forecast grid pairs. Oracle bias and information available before commitment remain separate concerns.

Scores are contract-native nontransferable points. There is no deposited collateral, token payment, financial market or externally backed claim. The contract does not establish physical truth, publisher identity, forecast timing relative to real-world information release, or actual forecasting skill. Real deployments should freeze report locations before the event and choose credible independent publishers.

## Reproducibility

Direct tests use the pinned v0.2.16 SDK and explicitly replay validator callbacks. gltest 0.29.2's warp refresh omits `message_raw.datetime`; the test-only bridge copies the VM's controlled clock into that field. Production code reads the genuine transaction timestamp. The Windows-only stdin-sharing workaround is also confined to test fixtures.

The live suite uses two distinct forecaster wallets and a third outsider, all controlled by the test runner. It verifies contract source bytes, receipt finality/strict majorities, actual signing wallets, source digests, commitment openings, state chains, and independently recomputed scores. Synthetic sources and forecasts are published in advance for reproducibility, so these runs are mechanism demonstrations rather than evidence of predictive performance.
