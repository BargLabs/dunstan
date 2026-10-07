// The shapes the checks read and write: a found block (spec section 4), the evidence snapshot (section
// 6, record-0.1.schema.json#/$defs/evidence) and a claim row (section 7.1). The schemas are what
// validate these values; the types here only name them for the compiler.

export type Verdict = 'pass' | 'fail' | 'unverifiable';

export type SourceKind =
  | 'pull_request'
  | 'pull_request_files'
  | 'closing_references'
  | 'repository'
  | 'issue'
  | 'commit'
  | 'compare'
  | 'check_runs'
  | 'workflow_runs'
  | 'artifact'
  | 'deployments';

export interface JunitRecord {
  kind: 'junit';
  workflow: string;
  job: string;
  artifact: string;
  path: string;
}

export interface OtherRecord {
  kind: string;
  [member: string]: unknown;
}

export interface TestRun {
  command: string;
  count: number;
  failures?: number;
  record: JunitRecord | OtherRecord;
}

export type Reference =
  | { issue: string; relation: 'closes' | 'cites' }
  | { commit: string; relation: 'cites' };

export interface Block {
  dunstan: string;
  headCommit: string;
  filesChanged: string[];
  tests?: TestRun[];
  checks?: { total?: number; allSucceeded?: boolean };
  references?: Reference[];
  mergedAt?: string;
  deployedAt?: { at: string; environment: string };
}

// A section the checker could not use (spec section 6, "Read status").
export type Unread =
  | { status: 'unreadable'; source: SourceKind }
  | { status: 'unpopulated'; field: string };

export interface PullRequestEvidence {
  status: 'ok';
  number: number;
  state: 'open' | 'closed';
  merged: boolean;
  mergedAt: string | null;
  headSha: string;
  mergeSha: string | null;
  changedFiles: number;
}

export interface FileEntry {
  path: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  previousPath?: string;
}

export type FilesEvidence = { status: 'ok'; complete: boolean; entries: FileEntry[] } | Unread;

export type ClosingReferencesEvidence = { status: 'ok'; issues: string[] } | Unread;

export type ReferenceEvidence =
  // `resolvedAs`: the owner/repo#N GitHub answered the read with, when it is not `ref` (an issue
  // transferred to another repository; spec 0.1.3).
  | { kind: 'issue'; ref: string; status: 'ok'; exists: boolean; resolvedAs?: string }
  | { kind: 'commit'; ref: string; status: 'ok'; exists: boolean; reachableFromHead: boolean }
  | ({ kind: 'issue' | 'commit'; ref: string } & Unread);

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

export type CheckRunsEvidence =
  | { status: 'ok'; commit: string; excludedIds: number[]; runs: CheckRun[] }
  | Unread;

export interface TestRecordRun {
  runId: number;
  runAttempt: number;
  executed: number;
  failed: number;
}

export type TestRecordEvidence =
  | { record: JunitRecord; status: 'ok'; runs: TestRecordRun[] }
  | ({ record: JunitRecord } & Unread);

export type DeploymentRelation = 'head' | 'merge' | 'descendant' | 'unrelated' | 'unknown';

export interface Deployment {
  id: number;
  sha: string;
  relation: DeploymentRelation;
  successAt: string | null;
}

export type DeploymentsEvidence =
  | { environment: string; status: 'ok'; deployments: Deployment[] }
  | ({ environment: string } & Unread);

export interface Source {
  kind: SourceKind;
  locator: string;
  sha256: string;
  etag?: string;
  readAt: string;
  error?: string;
}

// DRAFT 0.2.0 only (spec/claim-format.md, "DRAFT 0.2.0", and record-0.2-draft.schema.json): the
// record items a reader claim can be about that 0.1 evidence does not already list. Changed files
// and check runs come from the 0.1 sections. A 0.1 record never carries this section.
export type ItemsSourceKind = 'pull_request_commits' | 'timeline' | 'artifact';

export type ItemsUnread =
  | { status: 'unreadable'; source: ItemsSourceKind }
  | { status: 'unpopulated'; field: string };

export interface CommitItem {
  sha: string;
  // The first line of the commit message: metadata, like a file path, never file contents.
  headline: string;
}

export interface TimelineItem {
  id: string;
  event: string;
  // The issue (owner/repo#N) or commit (40 hex) the event points to, if any.
  ref?: string;
  // One short metadata value the event carries: a label name, a review state.
  detail?: string;
}

export type TestOutcome = 'passed' | 'failed' | 'skipped';

export interface TestItem {
  name: string;
  classname?: string;
  outcome: TestOutcome;
}

export interface ItemsEvidence {
  commits: { status: 'ok'; entries: CommitItem[] } | ItemsUnread;
  timeline: { status: 'ok'; entries: TimelineItem[] } | ItemsUnread;
  tests: { status: 'ok'; entries: TestItem[] } | ItemsUnread;
}

export interface Evidence {
  pullRequest: PullRequestEvidence;
  files?: FilesEvidence;
  closingReferences?: ClosingReferencesEvidence;
  references?: ReferenceEvidence[];
  checkRuns?: CheckRunsEvidence;
  testRecords?: TestRecordEvidence[];
  deployments?: DeploymentsEvidence[];
  items?: ItemsEvidence;
  sources: Source[];
}

export type CheckName = 'head' | 'scope' | 'reference' | 'count' | 'time';

export interface Claim {
  id: string;
  check: CheckName;
  field: string;
  declared: unknown;
  observed: unknown;
  verdict: Verdict;
  reason?: string;
}
