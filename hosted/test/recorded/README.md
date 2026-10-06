# Recorded GitHub responses

The hosted tests stub GitHub with these bodies, not with objects composed from field types. Each is
the example response GitHub publishes for the endpoint in its REST API description
(`github/rest-api-description`, API version 2022-11-28), transcribed with these changes only:

- the repository is `example-org/example-repo` (IP boundary: examples use the made-up repository);
- commit ids are replaced so the documents agree with each other (the pull request's head is the
  head the compare and the check runs name);
- long arrays are cut to the entries the test needs.

Every field the reader does not read is kept, including the ones it must drop: commit author and
committer names and emails (`git-commit.json`, `compare.json`) and diff patches (`pull-files.json`,
`compare.json`). `hosted/test/privacy.test.ts` proves none of them reaches a record, a stored object
or a response.

| File | Endpoint |
| --- | --- |
| `installation-token.json` | `POST /app/installations/{id}/access_tokens` (201) |
| `installation.json` | `GET /app/installations/{id}` |
| `pull.json` | `GET /repos/{owner}/{repo}/pulls/{number}` |
| `pull-files.json` | `GET /repos/{owner}/{repo}/pulls/{number}/files` |
| `closing-references.json` | `POST /graphql`, `closingIssuesReferences` |
| `git-commit.json` | `GET /repos/{owner}/{repo}/git/commits/{sha}` |
| `compare.json` | `GET /repos/{owner}/{repo}/compare/{base}...{head}` |
| `not-found.json` | any 404 |
