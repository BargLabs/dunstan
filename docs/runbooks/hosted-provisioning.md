# Runbook: provisioning and deploying the hosted tier

Every command here is for the **operator** to run, with the operator's own Cloudflare login and
GitHub account. None is run by an agent: creating the GitHub App, the Cloudflare resources and the
secrets, and every deploy, are the operator's keystrokes.

Run everything from the root of a clean checkout of a merged commit on `main`. `wrangler` is the
version pinned in the lockfile; always call it as `pnpm exec wrangler ... --config hosted/wrangler.toml`.

What the Worker is and what it keeps: [`docs/hosted.md`](../hosted.md).

## 0. Before you start

```sh
git switch main && git pull --ff-only && git status --porcelain   # must print nothing
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm exec wrangler whoami                                          # the Barg Labs account
```

Decide the Worker's host name, for example `dunstan.barglabs.ai` (a zone on the same Cloudflare
account). Below it is `$HOST`:

```sh
export HOST=dunstan.barglabs.ai
```

## 1. The R2 bucket, EU jurisdiction, with the 90-day lifecycle rule

```sh
pnpm exec wrangler r2 bucket create dunstan-records --jurisdiction eu --config hosted/wrangler.toml
pnpm exec wrangler r2 bucket lifecycle add dunstan-records expire-records records/ \
  --expire-days 90 --jurisdiction eu --config hosted/wrangler.toml
pnpm exec wrangler r2 bucket lifecycle list dunstan-records --jurisdiction eu --config hosted/wrangler.toml
```

The last command must show `expire-records`, prefix `records/`, expiring after 90 days. That rule is
the backstop for the retention promise: it deletes every record after 90 days whatever the Worker
does.

## 2. The D1 database, EU jurisdiction

```sh
pnpm exec wrangler d1 create dunstan-hosted --jurisdiction eu --config hosted/wrangler.toml
```

It prints the new database's `database_id`. Put it in `hosted/wrangler.toml` in place of
`REPLACE_WITH_THE_ID_WRANGLER_D1_CREATE_PRINTS`, together with the route for `$HOST`:

```toml
routes = [{ pattern = "dunstan.barglabs.ai", custom_domain = true }]
```

and land both through a pull request (neither is a secret). Then create the tables:

```sh
pnpm exec wrangler d1 migrations apply dunstan-hosted --remote --config hosted/wrangler.toml
```

## 3. The GitHub App, from the committed manifest

[`hosted/github-app-manifest.json`](../../hosted/github-app-manifest.json) declares the App:
read-only permissions (Metadata, Pull requests, Checks, Issues, Deployments, Actions, Contents),
no events, the webhook at `https://$HOST/v0.1/webhooks/github`, and the Contents: read caveat in its
description. Write the creation page and open it:

```sh
node --experimental-strip-types hosted/scripts/manifest-form.ts --origin "https://$HOST" --org BargLabs \
  > "$HOME/dunstan-app-manifest.html"
open "$HOME/dunstan-app-manifest.html"
```

Press the button, check the permissions GitHub shows (all read-only, as above), and create the App.
GitHub then sends the browser to this runbook's URL with `?code=<code>` appended. Within an hour,
exchange the code for the App's credentials (the file holds the App's private key: keep it out of
the repository):

```sh
gh api -X POST "/app-manifests/<code>/conversions" > "$HOME/dunstan-app.json"
jq '{id, slug, html_url, permissions, events}' "$HOME/dunstan-app.json"
```

## 4. The GitHub App's secrets

```sh
jq -j .id "$HOME/dunstan-app.json" \
  | pnpm exec wrangler secret put GITHUB_APP_ID --config hosted/wrangler.toml
jq -j .pem "$HOME/dunstan-app.json" \
  | pnpm exec wrangler secret put GITHUB_APP_PRIVATE_KEY --config hosted/wrangler.toml
jq -j .webhook_secret "$HOME/dunstan-app.json" \
  | pnpm exec wrangler secret put GITHUB_WEBHOOK_SECRET --config hosted/wrangler.toml
```

## 5. The record signing key

An ed25519 key without a passphrase (the Worker cannot prompt for one), for the principal named in
`hosted/wrangler.toml` (`RECORD_SIGNER`):

```sh
ssh-keygen -t ed25519 -N '' -C dunstan-hosted@barglabs.ai -f "$HOME/dunstan-record-signing-key"
pnpm exec wrangler secret put RECORD_SIGNING_KEY --config hosted/wrangler.toml \
  < "$HOME/dunstan-record-signing-key"
printf 'dunstan-hosted@barglabs.ai namespaces="dunstan-record" %s\n' \
  "$(cut -d' ' -f1,2 "$HOME/dunstan-record-signing-key.pub")" >> docs/security/record-signers
ssh-keygen -l -E sha256 -f "$HOME/dunstan-record-signing-key.pub"
```

Land the `docs/security/record-signers` change through a pull request: it is how customers verify
hosted records. Keep the private key in the password manager, then delete the local files:

```sh
rm "$HOME/dunstan-record-signing-key" "$HOME/dunstan-record-signing-key.pub" \
   "$HOME/dunstan-app.json" "$HOME/dunstan-app-manifest.html"
pnpm exec wrangler secret list --config hosted/wrangler.toml
```

The list must show `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` and
`RECORD_SIGNING_KEY`.

## 6. Build and deploy

From a clean checkout of the merged commit that carries the steps 2 and 5 changes:

```sh
git status --porcelain                      # must print nothing
pnpm install --frozen-lockfile
pnpm build:hosted                           # prints <digest>  hosted/dist/checker.mjs
pnpm exec wrangler deploy --config hosted/wrangler.toml
curl -sS "https://$HOST/v0.1/health"
```

`health` must report the digest `pnpm build:hosted` printed, and `"spec": "0.1.1"`. Wrangler uploads
`hosted/dist/` as built (`no_bundle = true`), so that digest is the digest of what runs.

## 7. An installation and its API key

Install the App on an account (from the App's page, `jq -r .html_url` in step 3). The
`installation.created` webhook records it:

```sh
pnpm exec wrangler d1 execute dunstan-hosted --remote --config hosted/wrangler.toml \
  --command "SELECT id, account, retention_days, deleting FROM installations"
node --experimental-strip-types hosted/scripts/issue-key.ts --installation <id>
```

The key is printed once; send it to the customer over a private channel. Only its SHA-256 is kept.
To change how long an installation's records are kept (0 stores nothing; at most 90):

```sh
node --experimental-strip-types hosted/scripts/set-retention.ts --installation <id> --days <0-90>
```

## 8. Smoke test

On a pull request in the installed account whose body carries a `dunstan-handback` block:

```sh
jq -n --arg r "$(gh pr view <n> --repo <owner>/<repo> --json body -q .body)" \
  '{repository: "<owner>/<repo>", pullRequest: <n>, report: $r}' > request.json
curl -sS "https://$HOST/v0.1/check" -H "authorization: Bearer <key>" \
  -H 'content-type: application/json' -d @request.json > response.json
jq -j .record response.json > record.json && jq -j .signature response.json > record.json.sig
dunstan verify record.json --sig record.json.sig --allowed-signers docs/security/record-signers
dunstan check --repo <owner>/<repo> --pr <n> --report-pr-body --out local.json
jq -c '.predicate | {verdict, digests}' record.json local.json   # the two lines must agree
```

## Afterwards

- **Uninstall.** Deleting an installation removes its keys and records at once; the daily sweep
  (`17 3 * * *` UTC) finishes any interrupted deletion and catches an uninstall whose webhook was
  lost. Check with the `SELECT` in step 7.
- **Roll back** a deploy: `pnpm exec wrangler rollback --config hosted/wrangler.toml`.
- **Rotate the signing key:** repeat step 5 with a new key, deploy, and add `valid-before="<date>"`
  to the old key's line in `docs/security/record-signers` so records it signed still verify. A key
  that may have leaked goes to `docs/security/record-revocations` instead.
