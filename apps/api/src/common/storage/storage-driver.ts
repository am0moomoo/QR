export type StorageDriverKind = "local" | "r2" | "s3";

export type StoredObject = {
  absolutePath?: string;
  body: Buffer;
  bytes: bigint;
  etag?: string | null;
};

export type StoredObjectMetadata = {
  absolutePath?: string;
  bytes: bigint;
  etag?: string | null;
};

export type StoredObjectReference = {
  etag?: string | null;
  key: string;
};

export interface StorageDriver {
  readonly kind: StorageDriverKind;
  deleteObject(storageKey: string): Promise<void>;
  deleteObjects(storageKeys: string[]): Promise<void>;
  getObject(storageKey: string): Promise<StoredObject>;
  getSignedDownloadUrl(storageKey: string, expiresInSeconds: number): Promise<string | null>;
  initialize(): Promise<void>;
  listObjects(prefix: string): Promise<StoredObjectReference[]>;
  putObject(storageKey: string, body: Buffer | string): Promise<StoredObjectMetadata>;
}
