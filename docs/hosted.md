# The hosted tier

An optional API beside the local tools. You send a coding agent's completion report (or just its
`dunstan-handback` block) and name a pull request; Barg Labs' read-only GitHub App reads that pull
request's metadata; the same checker as `dunstan check` checks each claim; and you get back a signed
record you can re-run on your own machine for the same verdict.

It is opt-in, per installation of the App. The CLI, the GitHub Action and the MCP self-check do not
use it and do not need it: nothing leaves your runner unless you call this API. Dunstan returns
evidence, not a gate: the hosted tier writes no check run and comments on nothing. Your own Action
or gate decides what blocks.

**Controller: Barg Labs Ltd.**

## What is read

For the one pull request named in a request, and nothing else, the App reads:

| What | GitHub route |
| --- | --- |
| The pull request: state, merged, merge time, head and merge commit ids, changed-file count | `GET /repos/{o}/{r}/pulls/{n}` |
| The changed-file paths and statuses | `GET /repos/{o}/{r}/pulls/{n}/files` |
| The issues the pull request closes | GraphQL `closingIssuesReferences` (one fixed query) |
| Whether a cited issue exists, and whether its repository is readable | `GET /repos/{o}/{r}/issues/{n}`, `GET /repos/{o}/{r}` |
| Whether a cited commit exists, and is reachable from the head | `GET /repos/{o}/{r}/git/commits/{sha}`, `GET /repos/{o}/{r}/compare/{a}...{b}` |
| Check runs at the declared head | `GET /repos/{o}/{r}/commits/{sha}/check-runs` |
| A named JUnit test-report artifact: element counts only | Actions workflow runs, jobs, artifacts, artifact download |
| Deployments to the declared environment, and their statuses | `GET /repos/{o}/{r}/deployments`, `.../statuses` |

It reads only what the block declares (spec section 6): a block with no `checks` reads no check runs.
The full list is the allowlist in [`hosted/src/transport.ts`](../hosted/src/transport.ts); every
request the Worker makes is checked against it before it is sent, and a request that matches no
entry is refused.

### Contents: read

The App holds **Contents: read**, which GitHub grants as read access to code. GitHub requires it for
the two commit routes above. Dunstan uses it only for those: to check that a commit the report cites
exists and is reachable from the pull request's head.

Dunstan never requests file contents. The allowlist refuses, before the request is made, every blob,
tree, `contents/`, readme, archive, tarball, zipball and raw-content route, any media type other than
`application/vnd.github+json` (so a pull request cannot be read as its diff), and any GraphQL query
other than the one fixed closing-references query. `hosted/test/transport.test.ts` proves each of
those is refused, and that the allowlist is the only path from the hosted code to the network.

Two answers GitHub gives on the admitted routes carry more than Dunstan reads, and you should know
it: the compare answer includes the commits' messages, their author and committer names and emails,
and the diff of each changed file; the git commit answer includes its message and author and
committer names and emails. The Worker reads `behind_by` from the first and existence from the
second. It keeps none of the rest: the record holds the SHA-256 of each response body as received,
never the body. `hosted/test/privacy.test.ts` proves no name, email, patch or message reaches a
record, a stored object or a response. Running the check yourself (`dunstan check`, the Action)
avoids the App altogether.

The App asks for no write permission of any kind, subscribes to no events, and requests every
installation token for the named repository only, with the same read permissions.

## What is kept, and for how long

| Kept | Where | For how long |
| --- | --- | --- |
| The signed record and its signature | R2, in the EU jurisdiction | Your installation's retention: 90 days by default, down to 0 |
| Your installation: its id, the account login, its retention | D1 | Until you uninstall the App |
| Your API keys, as SHA-256 hashes | D1 | Until you uninstall the App |

A record carries the block (your claims), the repository and pull request numbers, the changed-file
paths, check and workflow names, deployment environment names, commit ids, and the SHA-256 of each
GitHub answer. It carries no file contents and no report text: the report's SHA-256 only. Commit
author names and emails never enter it. A GitHub login can appear only where the block itself names
one.

- **Retention 0** returns the record and stores nothing.
- **Expiry.** A record past its installation's retention is never served, the daily sweep deletes
  it, and a lifecycle rule on the bucket deletes anything older than 90 days whatever the Worker
  does. Lowering the retention applies to records already stored.
- **Uninstall.** When you uninstall the App, GitHub sends `installation.deleted` and the Worker
  deletes your keys and every stored record at once. If that delivery never arrives or the deletion
  is interrupted, the daily sweep (which also asks GitHub whether each installation still exists)
  finishes it. Stated window: **within 24 hours of the uninstall**.

To change your retention, ask Barg Labs; the operator sets it (`hosted/scripts/set-retention.ts`).

## The API

Base URL: given with your API key. Every request but `health` and the webhook carries
`Authorization: Bearer <key>`. Keys are issued per installation by Barg Labs (there is no self-serve
sign-up yet), shown once, and stored only as their SHA-256.

### `POST /v0.1/check`

```json
{
  "repository": "example-org/example-repo",
  "pullRequest": 1347,
  "report": "... the agent's report, with its dunstan-handback block ...",
  "reportSource": "runner job 812"
}
```

Send exactly one of `report` (the report text, read exactly as `dunstan check --report-file` reads a
file) and `block` (the handback block as JSON; it is checked as the report
```` ```dunstan-handback\n<the block's JCS bytes>\n```\n ````). `reportSource` is your own name for
where the report came from; it becomes the record's `report.source.locator`, with kind `api`.

The answer, `200`:

```json
{
  "verdict": "pass",
  "claimsTable": "...the claims table dunstan check prints...",
  "record": "{\"_type\":\"https://in-toto.io/Statement/v1\",...}",
  "signature": "-----BEGIN SSH SIGNATURE-----\n...",
  "rerun": {
    "file": "dunstan-example-org-example-repo-1347.json",
    "save": "jq -j .record response.json > dunstan-example-org-example-repo-1347.json && ...",
    "offline": "dunstan verify dunstan-example-org-example-repo-1347.json --sig ... --allowed-signers record-signers",
    "online": "dunstan rerun dunstan-example-org-example-repo-1347.json"
  },
  "id": "<SHA-256 of the record bytes>",
  "expiresAt": "2027-01-02T12:00:00.000Z"
}
```

`record` is the signed record's exact bytes (its JCS form, spec section 11), as a string; save it
byte for byte. `id` and `expiresAt` are `null` when your retention is 0.

Errors are HTTP errors, `{"error": {"code", "message"}}`, and never carry a verdict or a record:
`400` a malformed request, `401` no valid key, `403` the installation cannot be used, `404` a
repository or pull request the installation cannot read, `413` a body over 1 MiB, `502` GitHub did
not answer, `500` anything else.

### `GET /v0.1/records/:id`

A stored record, within retention, for the installation the key belongs to:
`{id, record, signature, rerun, expiresAt}`.

### `GET /v0.1/health`

`{"status": "ok", "checker": {"name", "version", "digest": {"sha256"}}, "spec": "0.1.1"}`. The digest
is the SHA-256 of the Worker bundle that is running (`hosted/dist/checker.mjs`, built by
`pnpm build:hosted`); it is the `checker.digest` every hosted record carries. The build is
deterministic: check out the commit, run `pnpm install --frozen-lockfile && pnpm build:hosted`, and
compare.

## Re-running a hosted record locally

A hosted record is the same record `dunstan check` writes, signed. A hosted verdict that differs
from the local one on the same record is a defect.

```sh
curl -sS https://<hosted>/v0.1/check -H "authorization: Bearer $DUNSTAN_KEY" \
  -H 'content-type: application/json' -d @request.json > response.json
jq -j .record response.json > record.json
jq -j .signature response.json > record.json.sig
curl -sSO https://raw.githubusercontent.com/BargLabs/dunstan/main/docs/security/record-signers

# Offline, no network: recompute claims, verdict and digests, and check the signature.
dunstan verify record.json --sig record.json.sig --allowed-signers record-signers

# Online, with your own GITHUB_TOKEN: re-read the evidence and report what changed.
dunstan rerun record.json
```

`dunstan verify` needs the `dunstan` version the record names (`predicate.checker.version`) and
`ssh-keygen`; it makes no network call. The signature says Barg Labs issued the record; re-running
it is what checks the verdict. The signing key is listed in
[`docs/security/record-signers`](security/record-signers), and a revoked key would be listed in
[`docs/security/record-revocations`](security/record-revocations) (empty; pass it to
`ssh-keygen -Y verify -r` when you verify by hand).

## Legal texts

Counsel writes these; they are not drafted here.

- **Privacy notice:** _[PLACEHOLDER: privacy notice, written by counsel (UK GDPR, PIPEDA)]_
- **Data processing agreement:** _[PLACEHOLDER: DPA template, written by counsel]_
- **Subprocessors:** _[PLACEHOLDER: subprocessor list, written by counsel]_
- **Deletion route** (beyond uninstalling the App): _[PLACEHOLDER: deletion request route, written by counsel]_

## Operating it

The Worker lives in [`hosted/`](../hosted/). Creating the GitHub App, the Cloudflare resources and
the secrets, and every deploy, are the operator's: [`docs/runbooks/hosted-provisioning.md`](runbooks/hosted-provisioning.md).
