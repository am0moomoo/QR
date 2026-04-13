import {
  InternalServerErrorException,
  NotFoundException
} from "@nestjs/common";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import type {
  StorageDriver,
  StoredObject,
  StoredObjectMetadata
} from "./storage-driver";

export class S3StorageDriver implements StorageDriver {
  readonly kind: "r2" | "s3";
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(kind: "r2" | "s3") {
    const bucket = process.env.S3_BUCKET?.trim();
    const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException(
        "S3 storage requires S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
      );
    }

    this.kind = kind;
    this.bucket = bucket;
    this.client = new S3Client({
      credentials: {
        accessKeyId,
        secretAccessKey
      },
      endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      region: process.env.S3_REGION?.trim() || "auto"
    });
  }

  async initialize() {
    await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: ".healthcheck"
      })
    ).catch((error) => {
      if (error instanceof NoSuchKey || this.isNotFoundError(error)) {
        return;
      }

      throw error;
    });
  }

  async putObject(storageKey: string, body: Buffer | string): Promise<StoredObjectMetadata> {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const result = await this.client.send(
      new PutObjectCommand({
        Body: buffer,
        Bucket: this.bucket,
        ContentLength: buffer.byteLength,
        Key: storageKey
      })
    );

    return {
      bytes: BigInt(buffer.byteLength),
      etag: result.ETag ?? null
    };
  }

  async getObject(storageKey: string): Promise<StoredObject> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: storageKey
        })
      );

      return {
        body: Buffer.from(await response.Body!.transformToByteArray()),
        bytes: BigInt(response.ContentLength ?? 0),
        etag: response.ETag ?? null
      };
    } catch (error) {
      if (error instanceof NoSuchKey || this.isNotFoundError(error)) {
        throw new NotFoundException("Stored asset was not found");
      }

      throw error;
    }
  }

  async deleteObject(storageKey: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey
      })
    );
  }

  async deleteObjects(storageKeys: string[]) {
    for (const storageKey of storageKeys) {
      await this.deleteObject(storageKey);
    }
  }

  private isNotFoundError(error: unknown) {
    if (!(error instanceof Error)) {
      return false;
    }

    return error.name === "NoSuchKey" || error.name === "NotFound";
  }
}
