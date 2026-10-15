# Reading a Dunstan record in other formats' terms

These notes say how each part of a Dunstan record reads in the terms of the in-toto attestation
framework, SLSA (the Verification Summary Attestation and Build Provenance), the in-toto test-result
and SCAI predicates, and EIO-Agents Portable Evaluation Records (PER) 2.1.0, and they say plainly
what does not carry over.

**They are informative.** They are not part of the claim format
([`spec/claim-format.md`](../spec/claim-format.md)), they change no verdict, and **no export
exists**: Dunstan writes no VSA, no provenance, no test-result or SCAI attestation and no PER. A
consumer that projects a record into another format does so on its own terms; section 5 gives the
conventions such a projection should keep. The notes are written against claim format 0.1 as of
spec 0.1.6, and against its DRAFT 0.2.0 section where a row says so.

1. [Sources](#1-sources)
2. [The record is an in-toto Statement](#2-the-record-is-an-in-toto-statement)
3. [The mapping](#3-the-mapping)
4. [What does not carry over](#4-what-does-not-carry-over)
5. [Conventions for a reader](#5-conventions-for-a-reader)

## 1. Sources

Each outside specification is cited at the version read, by a link pinned to the commit read. PER
has no public repository to pin, so it is cited by its URL with the date fetched and the size and
SHA-256 of the bytes read; content at that URL that differs from that digest is not what these notes
were written against. A cell in section 3 cites a source by its key.

| Key | Specification, version read |
| --- | --- |
| IT-README | in-toto Attestation Framework v1, overview and parsing rules: <https://github.com/in-toto/attestation/blob/fd2609c16bcb0ac53443e2b4612977f997e8f9a5/spec/v1/README.md> |
| IT-Statement | in-toto Statement v1: <https://github.com/in-toto/attestation/blob/fd2609c16bcb0ac53443e2b4612977f997e8f9a5/spec/v1/statement.md> |
| IT-RD | in-toto ResourceDescriptor v1: <https://github.com/in-toto/attestation/blob/fd2609c16bcb0ac53443e2b4612977f997e8f9a5/spec/v1/resource_descriptor.md> |
| IT-Envelope | in-toto Envelope v1: <https://github.com/in-toto/attestation/blob/fd2609c16bcb0ac53443e2b4612977f997e8f9a5/spec/v1/envelope.md> |
| IT-VSA | in-toto predicate registry entry for VSA, which points to SLSA: <https://github.com/in-toto/attestation/blob/fd2609c16bcb0ac53443e2b4612977f997e8f9a5/spec/predicates/vsa.md> |
| IT-TestResult | in-toto test-result predicate v0.1.0: <https://github.com/in-toto/attestation/blob/fd2609c16bcb0ac53443e2b4612977f997e8f9a5/spec/predicates/test-result.md> |
| IT-SCAI | in-toto SCAI predicate v0.3: <https://github.com/in-toto/attestation/blob/fd2609c16bcb0ac53443e2b4612977f997e8f9a5/spec/predicates/scai.md> |
| SLSA-VSA | SLSA 1.2 Verification Summary Attestation (tag `v1.2`): <https://github.com/slsa-framework/slsa/blob/19e4e2f005f871270c4f555fc47afecfb37f3efe/docs/spec/v1.2/verification_summary.md> |
| SLSA-BuildProv | SLSA 1.2 Build Provenance, `https://slsa.dev/provenance/v1` (tag `v1.2`): <https://github.com/slsa-framework/slsa/blob/19e4e2f005f871270c4f555fc47afecfb37f3efe/docs/spec/v1.2/build-provenance.md> |
| EIO-README | EIO-Agents README, package 0.8.5: <https://github.com/ProofAgent-ai/eio-agents/blob/f8391e3ac034e510f5d46d2d69b6e1dbcecd088e/README.md> |
| PER | PER 2.1.0 JSON Schema, fetched 2026-10-11, 265,611 bytes, SHA-256 `b014591877aeef1821d3f1da5bc7a3a75516abc60033f2d91a16cbc08aca8219`: <https://www.proofagent.ai/eio-agents/schema/per/2.1.0/per.schema.json> |

Where the EIO-Agents README and the PER schema disagree, these notes follow the schema, because the
schema is what a validator enforces. Two such points matter here. A PER claim's `state` has seven
values (`per:decision_state`), not only the two scored ones the README describes. `WITHHELD` is a
status of a metric or an axis, never of a claim.

**Not covered.** These were not read, and a cell says so where one would matter: the in-toto SVR
predicate (`https://in-toto.io/attestation/svr`), which IT-VSA calls "a simpler verification results
predicate"; in-toto's `digest_set.md`, which lists the recognised digest algorithms; the EIO
ontology modules, which decide which EIO predicates, evidence kinds and limitation ids exist; the
PER 2.1.1 and 2.1.2 schemas; and the PER schema's `finding`, `control`, `reliability`, `readiness`
and `explanation` definitions.

## 2. The record is an in-toto Statement

A record is an in-toto Statement v1 (spec section 9). Measured against IT-Statement and IT-RD:

- **Fields.** IT-Statement requires `_type`, `subject` and `predicateType`, and makes `predicate`
  optional. A record has all four.
- **Subjects.** Each subject element must have `digest` set (IT-Statement). Every one of a
  record's does: `gitCommit` for the head commit and, when the block is `found`, `sha256` for the
  block. A record whose block is `missing`, `ambiguous` or `invalid` has only the head commit's
  subject (spec section 9.1; row 7). Where there are two, their `name`s differ, as IT-Statement
  asks.
- **`gitCommit` as a digest key.** The framework's own examples use it: IT-TestResult's example
  subject and SLSA-BuildProv's example `resolvedDependencies` entry both carry
  `"digest": {"gitCommit": ...}`. IT-RD says producer and consumer should agree on the algorithms
  they accept.
- **The commit's URI is in `name`.** Subject 0's `name` is
  `git+https://github.com/<owner>/<repo>@<sha>`. IT-RD makes `name` a free identifier and `uri` the
  field for "A URI used to identify the resource or artifact globally". This conforms, but a
  consumer that looks for the commit's URI in `uri` will not find it in a 0.1 record. Subjects are
  matched by digest (IT-Statement), so matching is unaffected.
- **The pull request is context, not identity.** A pull request is mutable: its head moves and its
  state changes. A subject's digest identifies the head commit, so a consumer that matches by digest
  finds every record about that commit, whatever pull request it came from. The pull request's
  number is in `predicate.subject`, read from the invocation (spec section 9.3).
- **Predicate type.** In in-toto a TypeURI "reflects the major version number", minor versions are
  monotonic, and 0.x versions count as majors (IT-README, parsing rules). `.../record/v0.1` agrees,
  because Dunstan also treats each 0.x minor as a major (spec section 13).
- **Signature.** An unsigned record is a conforming Statement with no authentication layer. A signed
  record carries a detached SSH signature (spec section 11), which is not an in-toto Envelope
  (section 4).

**At 1.0.** Two in-toto alignments are decided for claim format 1.0 (spec section 13). The predicate
type will name the major version only, `https://barglabs.ai/dunstan/record/v1`, with `spec` carrying
the full version, so a 1.1 record keeps the 1.0 type as in-toto expects. The head commit's subject
entry will carry `git+https://github.com/<owner>/<repo>@<sha>` in `uri`, and may name the pull
request in `annotations`. A 0.1 record is unchanged.

## 3. The mapping

Each cell holds a field path in the target, "lossy:" followed by what is lost, or "none". Paths
under VSA, Provenance, test-result and SCAI are relative to the Statement. PER paths are relative to
the PER root. Spec sections are `§N`.

The **in-toto Statement** column asks only what the Statement layer expresses outside Dunstan's
predicate. A record *is* a Statement, so everything in `predicate` travels as it is, and "none" there
means only that the Statement layer adds nothing. The other columns ask how the information would
travel if it were written as that predicate.

| # | Dunstan field or concept | in-toto Statement | SLSA VSA | SLSA Provenance | in-toto test-result | in-toto SCAI | PER 2.1.0 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Row verdict `pass` | none: verdicts live in `predicate` | lossy: `predicate.verificationResult` `PASSED`, once per VSA, so a row's pass survives only inside the record's | none: provenance has no result | none: `predicate.result` is one test-suite run's result (rows 28 and 29 cover counts) | lossy: an assertion in `predicate.attributes[]` holds by its presence; the `attribute` string's meaning is private to the producer and consumer | lossy: `claims[].state` `APPLICABLE_PASS`, which must also cite evidence refs and carry `parameters.contract_check`; Dunstan has neither |
| 2 | Row verdict `fail` | none | lossy: `predicate.verificationResult` `FAILED`, with `verifiedLevels` holding `FAILED`; the failing row and its reason are lost | none | none: `FAILED` means tests failed, not that a claim failed | lossy: SCAI has no negative assertion; a fail is the absence of a pass, which cannot be told from unverifiable | lossy: `claims[].state` `APPLICABLE_FAIL`, which must also cite an agent ref (`can_prove_agent_behaviour`); a Dunstan fail rests on forge metadata, not agent output |
| 3 | Row verdict `unverifiable` | none | lossy: only as `FAILED`, since `verificationResult` is "Either “PASSED” or “FAILED”" (SLSA-VSA) | none | none: `predicate.result` is `PASSED`, `WARNED` or `FAILED`, and `WARNED` is a pass with warnings | lossy: absence, as for a fail | lossy: no one-to-one state; the nearest are `UNRESOLVED`, which has no reason member, and `EVIDENCE_INCOMPLETE`, an evaluator-fault state (section 5.2). `NOT_APPLICABLE` is wrong: the claim was applicable |
| 4 | Record verdict (§8) | none | lossy: `predicate.verificationResult`; `pass` → `PASSED` and `fail` → `FAILED` are exact, `unverifiable` → `FAILED` loses the distinction. A VSA also needs a policy (row 22) and a signed envelope (row 21) | none | none: one test-suite result, not a verdict over claims | lossy: a record-level attribute, with fail and unverifiable collapsed | lossy: `release_recommendation.state` (`PASS` / `REVIEW` / `BLOCK`) is a release recommendation under a policy, which a record does not make (§2); a behavioural `BLOCK` also needs `proof_status: PROVEN`. `coverage.state_counts` keeps the census of row states |
| 5 | Row reason (§16) | none | none: no reason member; an extension field named by a URI could hold one, but consumers "MUST ignore unrecognized fields" | none | none: the predicate holds only lists of test names | lossy: `predicate.attributes[].conditions` is a free object, but it says where an attribute holds, not why a check failed | lossy: reason-like members exist only for particular states (`parameters.invalid_because`, `parameters.applicability_basis`, `parameters.contract_check.unmet`); free-standing absences go in `limitations[]`, whose ids come from EIO's own `per.lim.*` catalogue (not read) |
| 6 | Declared and observed values per row | none | none | lossy: the declared value fits `predicate.buildDefinition.externalParameters`; nothing holds the observed value or the comparison | none | lossy: `predicate.attributes[].conditions`, by private agreement | none: `claims[].parameters` is closed |
| 7 | The block (`block.value`, `block.sha256`, `block.status`) | lossy: `subject[1]` carries a found block's digest; a block not found has no subject entry, so `missing` and `invalid` cannot be told apart | lossy: a `subject[]` entry by digest; the status has no place | lossy: `predicate.buildDefinition.externalParameters` for the value and a `resolvedDependencies[]` entry for the digest; the status has no field | none | lossy: `predicate.attributes[].target` by digest; the status has no field | none: PER evaluates a run and has no agent-authored declaration; `evidence.turns[].answer_sha256` digests answer text and holds no parsed declaration |
| 8 | Omission rows (`scope:undeclared:<path>`) | none | none | none | none | lossy: an assertion whose `target` is the file at the head (`git+https://…@<sha>#<path>`), but SCAI asserts only what holds, and an omission is a negative finding | lossy: `coverage.obligations[]` is the evaluator's coverage of required predicates, not the agent's coverage of the change |
| 9 | Evidence snapshot (`evidence`, with read statuses) | none (inside `predicate`) | none: `predicate.inputAttestations[]` lists attestations, and a forge read is not one | lossy: each read as a `predicate.buildDefinition.resolvedDependencies[]` entry by `uri` and `digest`, by reference only; read statuses are lost, and provenance reads unset, null and empty alike, where a Dunstan empty list is evidence and an absent one is not (§6) | none | lossy: `predicate.attributes[].evidence` per assertion, by reference or as small inline `content`; read statuses are lost | lossy: `evidence` holds cited refs, turn digests and completeness per evidence class; the snapshot stays in a local archive. A forge read could at best be a `STATE_FACT` ref with a `computed` anchor, if EIO allows that pair (not read) |
| 10 | Evidence digest (`digests.evidence`) | none | none | lossy: a `predicate.runDetails.byproducts[]` entry; the rule that it is over JCS bytes without `sources` (§10) has no field | none | lossy: `predicate.attributes[].evidence.digest`, per assertion | lossy: `evidence.cited_refs_hash` covers ref ids only, `evidence.transcript_sha256` the transcript and `header.archive_sha256` the archive; none covers a snapshot carried in the record |
| 11 | Claims digest (`digests.claims`) | none | none | none | none | none | lossy: `claims[].id` digests a claim's identity and excludes its state; nothing digests outcomes. The whole-PER digest is computed over a PER, not held in it |
| 12 | Source provenance (`evidence.sources[]`) | none | none: `predicate.timeVerified` is one time for the whole verification | lossy: `resolvedDependencies[]` (`uri`, `digest.sha256`) with `runDetails.metadata.startedOn` / `finishedOn`; no time per read, no etag, no error | none | lossy: `predicate.attributes[].evidence` (`uri`, `digest`) per read; no time, etag or error | lossy: `evidence.refs[].source_sha256` and `source_ref`; no locator for an API request, no etag, no time per read, no error |
| 13 | Offline re-verification from the record alone (§12) | none | none: a VSA lets a consumer trust the verifier's decision instead of re-verifying | lossy: provenance supports rebuilding, which is re-execution (row 14); the snapshot travels only by reference | none | none | lossy: PER's verifier rules recompute ids, digests and counts from the record, but re-deriving the outcome needs the local archive, which the record does not carry |
| 14 | Online re-run (`rerun.online`, `evidence_changed`) | none | none | lossy: `predicate.buildDefinition` (`buildType`, `externalParameters`) is what a re-run executes; nothing reports what changed | none | none | none: re-deriving reads the same archive and does not re-read the world |
| 15 | Checker identity and digest (`checker`, `spec`) | none (inside `predicate`) | lossy: `predicate.verifier.id` and `predicate.verifier.version`; no digest of the checker artifact | lossy: `predicate.runDetails.builder.id` and `version`, the checker's digest as a `resolvedDependencies[]` entry; `builder.id` names a trusted platform, and a local run has none | none | none: `predicate.producer` is the producer of the subject, not of the attestation | lossy: `header.converter.name` is fixed to `"eio_agents.convert"`; `provenance.producer` has no digest |
| 16 | Subject: repository, pull request, head and merge commits | lossy: `subject[0]` is the head by `digest.gitCommit`; the pull request and merge commit are in `predicate.subject` only (section 2) | lossy: `subject[]` is the head by digest and `predicate.resourceUri` the pull request's URL, the closest fit of any target; `mergeSha` has no place | lossy: provenance's subject would be the record; the head commit is a `resolvedDependencies[]` entry and the pull request number an `externalParameters` member | lossy: `subject[]` is the commit; the pull request has no place | lossy: `subject[]` is the commit and `predicate.attributes[].target.uri` the pull request | none: PER's `subject` is the agent under evaluation and its AI-BOM |
| 17 | DRAFT 0.2.0: advisories that never gate (`advisory`) | none; in-toto's rule that an extension field must not change the meaning of any other field is the nearest idea | none | none | none: `warnedTests` lists tests that passed with warnings | none: every attribute exists to be evaluated against a policy | none: every claim has a decision state that feeds coverage and the release recommendation |
| 18 | DRAFT 0.2.0: advisory figures (`null` = unmeasured) | none | none | none | none | none | lossy: `metric_view.confidence` and `evidence_fraction` are figures of a metric, not bound to an extractor's digest |
| 19 | DRAFT 0.2.0: reader claims (`readerClaims[]`) | none | none | none | none | lossy: one assertion per claim with the reader in `conditions`; nothing marks that a model proposed it and a check decided | lossy: `claims[]` with `decided_by: deterministic`, since a check decides; the reader is lost (`provenance.model` is allowed only when a model decides), and `probability` maps to nothing |
| 20 | DRAFT 0.2.0: retrieval candidates | none | none | none | none | lossy: `predicate.attributes[].evidence` per candidate; no rank, score or floor | lossy: `claims[].evidence[]` and `counterevidence[]`; no rank, score or floor |
| 21 | Signature (`assurance`, §11) | none: signing is the Envelope layer's, where DSSE is recommended, not required (IT-Envelope) | none: verifying the VSA's envelope is the first step of verifying a VSA, so an unsigned record gives no verifiable VSA | none: consumers accept only specific signer-builder pairs | none | none: a consumer may rely on the producer's identity when evidence is omitted, which presumes a signer | none: `release_recommendation.signoff` says whether human sign-off is required; PER describes no signature |
| 22 | The consumer's policy (absent by design, §2) | none | none: `predicate.policy` is required, and a record holds no consumer policy to put there; the only honest `policy.uri` would name §8's verdict function at the `spec` version | none | none: as in Dunstan, the policy lives outside the attestation | none: as in Dunstan, a consumer evaluates against its own policy | none: `release_recommendation.policy` embeds the policy and PER applies it; a record has no counterpart, by design |
| 23 | Spec version (`spec`, `predicateType`) | `predicateType`, exact while the major version is 0 (section 2) | lossy: `predicate.verifier.version` could hold `{"dunstan-spec": "0.1.6"}`; `slsaVersion` is SLSA's | lossy: `predicate.buildDefinition.buildType` could name the spec version | none | none | none: `header.per_version` (fixed `2.1.0`) and `header.per_semantics_version` are PER's own versions |
| 24 | Report digest (`report`) | none | none: the report is not an attestation | lossy: a `resolvedDependencies[]` entry `{uri: <locator>, digest: {sha256}}`; `source.kind` has no field | none | lossy: `predicate.attributes[].evidence` `{uri, digest}` | lossy: `evidence.turns[].answer_sha256` covers a turn's answer text, where Dunstan's digest is over the report's bytes as received (§3); no locator |
| 25 | No model decides (§2) | none | none: trust rests on the verifier's identity | lossy: reproducibility is implicit in what `builder.id` documents | none | lossy: an attribute string, as SCAI's own `REPRODUCIBLE` example | exact: `claims[].decided_by` `deterministic`, with `coverage.decided_by_counts` |
| 26 | No probability or score (§2) | none: nothing to conflict with | none: `verifiedLevels` are levels, not scores | none | none | none | lossy, the other way: `scores` is required but admits `null`; `confidence` is forbidden on claims, as in Dunstan |
| 27 | A whole claim row as one assertion | none | lossy: one VSA per row, each with its own subject and policy, saying only `PASSED` or `FAILED` | none | lossy: row ids as names in `predicate.passedTests` / `failedTests`; an unverifiable row has no list | lossy: one `predicate.attributes[]` entry per row (`attribute` the row id, `target` the block or commit, `evidence` the read), a closer fit than a VSA, with no fail or unverifiable | lossy: `claims[]`, as rows 1 to 6 |
| 28 | Test-record count rows (`tests`, `evidence.testRecords`) | none | none | none | lossy: `predicate.url` the CI run and `predicate.configuration` the workflow; counts exist only as lengths of name lists, and Dunstan reads JUnit element counts, never names (§14); no value for `record_not_found` or `record_ambiguous` | lossy: an attribute per count row | none: `scores` are 0–100 metrics, not test-run counts |
| 29 | Check-run count rows (`checks.total`, `allSucceeded`, `noneFailed`; `evidence.checkRuns`) | none | none: one `verificationResult` per VSA; a row's outcome survives only inside the record's (rows 1, 2) | none | lossy: run names in `predicate.passedTests` / `failedTests`, with `predicate.url` one run; a run concluded `skipped` or `neutral`, which `noneFailed` admits and `allSucceeded` does not, or still running, has no list, and the latest run per workflow path and name (§7.5) has no field | lossy: an attribute per count row, as row 28 | none: `scores` are 0–100 metrics, not check-run counts |

**By target.**

- **in-toto Statement:** a record is one. The layer itself adds nothing beyond the version (23), the
  head commit by digest (16) and a found block's digest (7).
- **SLSA VSA:** says pass and fail once per record (1, 2, 4), and fits the subject best of any
  target: the head by digest and the pull request in `resourceUri` (16). It cannot say
  `unverifiable` (3), and has no place for reasons (5), the evidence (9) or offline re-verification
  (13). It requires a policy (22) and a signed envelope (21).
- **SLSA Provenance:** fits the record's inputs (7, 9, 12, 16, 24), the checker as the builder (15)
  and re-running as rebuilding (14). It carries no result (1 to 5). It can describe where a record
  came from; it cannot replace one.
- **in-toto test-result:** fits only the count rows (28, 29), and those lossily.
- **in-toto SCAI:** fits a passing row structurally (27), but has no negative or unknown assertion
  (2, 3, 8).
- **PER 2.1.0:** exact for deterministic decisions (25). It embeds a policy, which a record does not
  hold by design (22). Its subject is an agent and its evidence is a transcript, so a forge-and-CI
  record fits it only lossily (7, 9, 16).

## 4. What does not carry over

No target expresses Dunstan's distinctive properties without loss.

- **`unverifiable`.** VSA has only `PASSED` and `FAILED`. Test-result has `PASSED`, `WARNED` and
  `FAILED`. SCAI has no negative or unknown assertion, and Provenance has no result. In PER,
  `UNRESOLVED` has no reason and the other candidates blame the evaluator. The least bad projection
  anywhere, VSA `FAILED`, keeps the deny and loses the meaning (rows 3, 4).
- **Reasons.** None in VSA, Provenance or test-result; free-form at best in SCAI and PER (row 5).
- **The evidence snapshot and offline re-verification.** A VSA delegates trust instead of enabling
  re-verification. Provenance and SCAI carry inputs by reference, and Provenance reads empty and
  absent alike. PER keeps the evidence in a local archive (rows 9, 13).
- **A layer the gate must not read.** The DRAFT advisory layer never enters `verdict`. No target has
  such a member; every SCAI attribute and PER claim exists to be evaluated (row 17).
- **Declared against observed, and omission rows.** At best free-form SCAI `conditions`, or PER
  coverage, which counts the evaluator's coverage, not the agent's (rows 6, 8).
- **The signature.** A signed record carries a detached SSH signature over its JCS bytes in the
  `dunstan-record` namespace (§11). An in-toto Envelope must be able to hold several signatures in
  one envelope (IT-Envelope), and a detached SSH signature is one signature in a separate file. A
  consumer that requires in-toto envelopes cannot verify a signed record without a DSSE wrapper, and
  Dunstan provides none (row 21).

## 5. Conventions for a reader

### 5.1 Projecting a record into a VSA

No export exists. Anyone who writes a VSA from a Dunstan record writes `verificationResult` as:

| Record `verdict` | `verificationResult` |
| --- | --- |
| `pass` | `PASSED` |
| `fail` | `FAILED` |
| `unverifiable` | `FAILED`, never `PASSED` |

`unverifiable` must be written `FAILED`. `verifiedLevels` may add a custom value to mark it, such as
`DUNSTAN_UNVERIFIABLE` (custom values must not start with `SLSA_`), but never
`SLSA_<TRACK>_LEVEL_UNEVALUATED`: SLSA-VSA pairs that value with a passed result, so it would read
as a pass. A standard VSA consumer checks that `verificationResult` is `PASSED` (SLSA-VSA, "How to
verify"), so it denies, which is the gate outcome a Dunstan reader gets. The projection keeps the
deny and loses the distinction: a consumer that does not know the custom value reads `unverifiable`
as failed.

The same holds for the other result vocabularies. In a test-result attestation, `unverifiable` is
never `WARNED`, which means passed with warnings. In SCAI it is the absence of a pass attribute,
exactly as a fail is.

### 5.2 The nearest PER state for each unverifiable reason

PER's rule is that unknown is never a pass (`per:decision_state`), and Dunstan's fail-closed
principle says the same (§2). No PER claim state means "applicable, and the record cannot answer".
For a PER reader, the nearest state for each unverifiable reason is `EVIDENCE_INCOMPLETE` where the
checker could not read the evidence, or read it incomplete, and `UNRESOLVED` where it read the
evidence in full and the evidence does not settle the claim. Both lose the reason: `UNRESOLVED` has
no reason member, and `EVIDENCE_INCOMPLETE` is an evaluator-fault state, where Dunstan's reasons
often describe the forge, not the checker. None is `NOT_APPLICABLE`, `APPLICABLE_PASS` or
`APPLICABLE_FAIL`.

| Reason (§16) | Nearest PER state |
| --- | --- |
| `file_list_truncated` | `EVIDENCE_INCOMPLETE` |
| `evidence_field_unpopulated:<field>` | `EVIDENCE_INCOMPLETE` |
| `source_unreadable:<kind>` | `EVIDENCE_INCOMPLETE` |
| `check_runs_not_at_head` | `EVIDENCE_INCOMPLETE` |
| `closing_link_unsettled` | `UNRESOLVED` |
| `closing_base_not_default` | `UNRESOLVED` |
| `closing_event_unsettled` | `UNRESOLVED` |
| `checks_incomplete` | `UNRESOLVED` |
| `no_check_runs` | `UNRESOLVED` |
| `no_succeeded_check_runs` | `UNRESOLVED` |
| `no_comparable_record_field` | `UNRESOLVED` |
| `record_not_found` | `UNRESOLVED` |
| `record_ambiguous` | `UNRESOLVED` |

A record whose block is `missing`, `ambiguous` or `invalid` has no claim rows to map. Its verdict is
`unverifiable`, and PER has no place for an absent declaration (row 7).

### 5.3 Other conventions that carry over

- **No model decides.** Every Dunstan row is what PER calls `decided_by: deterministic` (row 25).
  PER also forbids `confidence` on claims, as Dunstan forbids any probability or score (row 26).
- **Requiring a claim is the consumer's policy.** A block may declare only its required fields,
  `dunstan`, `headCommit` and `filesChanged`, and its record can pass. Which optional fields were
  declared is in the record, as `block.value`, so a gate can require `tests` or `checks` itself.
  The record holds no policy (row 22), and the in-toto predicates read here leave the policy to the
  consumer too. §8.1 shows such a gate.
- **The gate rule is in-toto's monotonic rule.** In-toto asks for policies in which ignoring an
  attestation, or a field within one, "will never turn a DENY decision into an ALLOW" (IT-README,
  parsing rules). "Deny unless a trusted, current record with verdict `pass` exists for the gated
  head" is such a policy: it denies on `fail`, on `unverifiable`, on a missing record and on a
  record for another pull request or head, which is Dunstan's fail-closed principle in in-toto's
  terms (§8.1). Trusted means a record the gate wrote itself or one signed by an issuer it allows,
  not one the agent under check could have written; current means read when the gate gates, since
  an online re-run leaves the earlier record in place (§12). Ignoring the DRAFT advisory layer
  changes no gate outcome, because it never enters `verdict`.
