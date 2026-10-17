# Onchain proofs

Three gasless StudioNet deployments (chain **61999**) completed the sealed-forecast protocol. All **22 receipts** are `FINALIZED` with `MAJORITY_AGREE` and a strict majority: 19 successful executions and three intentional contract rejections. Agreement counts range from 3/5 to 5/5; receipts retain idle votes. No dissenting votes were recorded in this proof set.

## Outcome proofs

Both forecasters committed before either revealed. Probabilities were 80% and 20% in each independent instance.

| Case | Contract | Deployment | Resolution | Verified result |
| --- | --- | --- | --- | --- |
| Corrected completed run | `0x7C2F5EcF49A5c4aBEA56099668313C70040EC916` | [Deploy](https://explorer-studio.genlayer.com/tx/0x952198ead40ceadcfed9ebe0f77aa2f8042baa7f665d8fcb2eed823357e3ea78) | [Resolve YES](https://explorer-studio.genlayer.com/tx/0xc24c5182b328aaadf7efbf534a7806437a0e209a62304e0987744e63c3f57f40) | `SCORED`; points **9600, 3600** |
| Separate runs and decoy capsule | `0xc591af8a9f77bc56385988CfcFB8efFF59e00215` | [Deploy](https://explorer-studio.genlayer.com/tx/0xb2fde0d4ee7a61f8f51b6208cdc9703666bd4cf3ea62e64f626f2f359e4cfef8) | [Resolve NO](https://explorer-studio.genlayer.com/tx/0x81e852f538c325baeb33cf79380f18f8c90aec07d07523abdedf15f47e5df2b4) | `SCORED`; points **3600, 9600** |
| Conflicting final reports | `0x5480fBc93ab2590A5d1A56917055D6c5aB887CF8` | [Deploy](https://explorer-studio.genlayer.com/tx/0x0499c5376ba1e1f978258e0e67055ecca1dafb0e455d84506dbd920325979fea) | [Resolve](https://explorer-studio.genlayer.com/tx/0x623431da935a5dda0d74ad042f17166ced62c385676d99f8e14b60449214e643), [retry](https://explorer-studio.genlayer.com/tx/0x91dd355d6090789feb29637f0ea2fa057f503c0f40412a12bf71c3091df4ecec) | `AWAITING_OUTCOME`; both scores **-1 (unset)**; attempts **2** |

The conflict is between source documents: validators agreed that one report says YES and the other says NO. Consequently, no score was assigned on either attempt.

## Rejection proofs

These transactions finalized with consensus on an `ERROR` execution. Each pre/post state is identical, and the decoded receipt records the rejection reason.

- [Unauthorized wallet commitment](https://explorer-studio.genlayer.com/tx/0xfcd63b0f45f2e8a9b69510b79ccd11a95bf530724e440adc23ed51b98f1410da): [state and call](unauthorized.json), [decoded receipt](unauthorized-decoded-receipt.json).
- [Incorrect probability opening](https://explorer-studio.genlayer.com/tx/0x6ec62f84222d6fe3de71f95eeb343cff6a95338ee8c7cf14cb429a1685cf0294): [state and call](bad-opening.json), [decoded receipt](bad-opening-decoded-receipt.json).
- [Resolution after final scoring](https://explorer-studio.genlayer.com/tx/0xadc09f3797b803deae19a99a88f93e150deec6408ed91e4e9297418ae5fd04e3): [state and call](final-replay.json), [decoded receipt](final-replay-decoded-receipt.json).

## Reproduction and verification

[Deployment manifests](deployments.json) bind each address to its constructor inputs, report revision, source digest and public openings. [Transaction journal](transactions.json) enumerates all 22 transaction hashes. Every call has a `*-receipt.json` plus pre/post state in its matching JSON file. [Verification summary](verification.json) records execution results, exact vote counts and fresh final state checks.

The verifier checks strict majority over all recorded votes, expected execution success or rejection, actual sender/destination, commitment domains, both commitments before openings, report byte hashes, paragraph anchors, exact scores, receipt/state continuity, deployed source bytes and fresh `get_state` reads for all three instances. It recomputes scores using an independently expanded polynomial.

```sh
node scripts/verify-proofs.cjs --offline
# Fresh RPC verification also requires the installed GenLayer CLI and an unlocked account:
node scripts/verify-proofs.cjs
```

- [Successful deployment and fresh verification workflow](https://github.com/ehsanisildur-ux/brier-commit/actions/runs/39042919965).
- [Passing CI](https://github.com/ehsanisildur-ux/brier-commit/actions/runs/39042883257): **44 direct tests**, including all **10,201** true-probability/forecast grid pairs for strict scoring propriety. [Hosted test report](cloud-direct-tests.xml).
- Contract SHA-256: `c72bdcfd33e4a8555489cd8224d48954478e4bc5d35604d337546a968e0356cc`.
- Fixtures pinned to revision `94f2c34e85a52efeb19b2c31ce46c5ea06e169e4`.

These are synthetic reports published before commitments. They demonstrate consensus, sealed openings, scoring and unresolved-state behavior, **not actual forecasting skill or physical truth**. Both reports share a publisher. Points have no monetary backing. Deadline expiry and missing reveals are covered by direct tests; the live cases use early completion after all roster members commit and reveal.
