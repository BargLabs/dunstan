## Selection rule (fixed 2026-10-04)

Written before any search, from the operator's instruction of 4 Oct 2026: "five public agent-written PRs from open-source repos, chosen and listed before running". Account logins were confirmed to exist via `GET /users/{login}` on 4 Oct. No PR was searched for or opened while writing this rule.

**Agents, in this fixed order:**

| # | Agent | Account (`GET /users`) | Search qualifier |
|---|---|---|---|
| A | GitHub Copilot coding agent | `copilot-swe-agent[bot]` (shown as "Copilot", id 198982749) | `author:app/copilot-swe-agent` |
| B | Devin | `devin-ai-integration[bot]` (id 158243242) | `author:app/devin-ai-integration` |
| C | Claude | `claude[bot]` (id 209825114) | `author:app/claude` |
| D | OpenAI Codex | `chatgpt-codex-connector[bot]` (id 199175422) | `author:app/chatgpt-codex-connector` |
| E | Google Jules | `google-labs-jules[bot]` (id 161369871) | `author:app/google-labs-jules` |

Excluded, with the reason: `cursor[bot]` (mainly posts reviews; Cursor's agent PRs are usually authored by the human's account, so the author field does not identify them), and `codegen-sh[bot]` (a fixed list of five agents keeps the rule short). `sweep-ai[bot]` does not exist (HTTP 404, 4 Oct).

**Query, one per agent:** the GitHub issue search API (`GET /search/issues`) with `q = is:pr is:merged is:public merged:2026-09-01..2026-10-03 <qualifier>`, `sort=created`, `order=asc`, `per_page=100`. Pages are read in order, up to the API's 1,000-result cap. Record the run time of each query.

**Filters, applied in this order to each candidate, as it comes out of its agent's ordered results.** The first filter that fails rejects the candidate; record which.

1. The repository's owner is not `BargLabs`.
2. The repository, read with `GET /repos/{owner}/{repo}` at selection time, is public, not archived, not a fork, and has `stargazers_count >= 1000`.
3. The PR body, with HTML comments (`<!-- ... -->`) removed and whitespace trimmed, is at least 300 characters.
4. No PR from the same repository is already selected.

**Order of selection: round-robin.**
- Take the first qualifying candidate from A, then from B, C, D and E, then return to A for its next one, and so on, until five are selected.
- An agent whose results run out is skipped from then on.
- If all five agents run out before five are selected, select fewer and say so. Do not widen the window or the filters.

**Reads allowed before `selection.json` is committed:** search results; repository metadata; the PR body, read for filter 3 only. Not allowed: the PR's files, commits, checks, reviews or comments.

**Recorded for audit:** the query strings and their timestamps; every candidate examined with its result; for each selected PR, the star count and cleaned body length at selection time. Search results change over time, so the record, not a re-run of the query, is the selection.
