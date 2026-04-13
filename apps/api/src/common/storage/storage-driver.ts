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

export interface StorageDriver {
  readonly kind: StorageDriverKind;
  deleteObject(storageKey: string): Promise<void>;
  deleteObjects(storageKeys: string[]): Promise<void>;
  getObject(storageKey: string): Promise<StoredObject>;
  initialize(): Promise<void>;
  putObject(storageKey: string, body: Buffer | string): Promise<StoredObjectMetadata>;
}
