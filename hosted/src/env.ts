// The Worker's bindings, typed by the subset of the R2 and D1 APIs the hosted code calls, so the same
// code runs against Cloudflare's bindings, Miniflare's emulators and the tests without a type package
// for either.

export interface StoredObject {
  key: string;
  uploaded: Date;
}

export interface StoredObjectBody extends StoredObject {
  text(): Promise<string>;
}

export interface RecordBucket {
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<StoredObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: {
    prefix?: string;
    cursor?: string;
    delimiter?: string;
    limit?: number;
  }): Promise<{
    objects: StoredObject[];
    delimitedPrefixes: string[];
    truncated: boolean;
    cursor?: string;
  }>;
}

export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}

export interface Env {
  DB: Database;
  RECORDS: RecordBucket;
  // The GitHub App's id, its private key (PEM, PKCS#1 as GitHub issues it, or PKCS#8) and its
  // webhook secret. Secrets the operator sets (docs/runbooks/hosted-provisioning.md).
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  // The record signing key: an unencrypted OpenSSH ed25519 private key. A secret the operator sets.
  RECORD_SIGNING_KEY: string;
  // The principal records are signed as; docs/security/record-signers lists its key.
  RECORD_SIGNER: string;
}

export interface ScheduledContext {
  waitUntil(promise: Promise<unknown>): void;
}
