import {
  InternalServerErrorException,
  NotFoundException
} from "@nestjs/common";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type {
  StorageDriver,
  StoredObject,
  StoredObjectMetadata
} from "./storage-driver";

export class LocalStorageDriver implements StorageDriver {
  readonly kind = "local" as const;

  async initialize() {
    await fs.mkdir(this.getRootDirectory(), { recursive: true });
  }

  async putObject(storageKey: string, body: Buffer | string): Promise<StoredObjectMetadata> {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const absolutePath = this.resolveStoragePath(storageKey);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);

    return {
      absolutePath,
      bytes: BigInt(buffer.byteLength)
    };
  }

  async getObject(storageKey: string): Promise<StoredObject> {
    const absolutePath = this.resolveStoragePath(storageKey);

    try {
      const body = await fs.readFile(absolutePath);

      return {
        absolutePath,
        body,
        bytes: BigInt(body.byteLength)
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        throw new NotFoundException("Stored asset was not found");
      }

      throw error;
    }
  }

  async deleteObject(storageKey: string) {
    const absolutePath = this.resolveStoragePath(storageKey);

    try {
      await fs.unlink(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  async deleteObjects(storageKeys: string[]) {
    for (const storageKey of storageKeys) {
      await this.deleteObject(storageKey);
    }
  }

  private getRootDirectory() {
    const configuredRoot = process.env.STORAGE_LOCAL_ROOT?.trim() || "./storage";
    return path.isAbsolute(configuredRoot)
      ? configuredRoot
      : path.resolve(process.cwd(), configuredRoot);
  }

  private resolveStoragePath(storageKey: string) {
    const normalizedKey = storageKey.replace(/\\/g, "/").replace(/^\/+/, "");
    const rootDirectory = this.getRootDirectory();
    const absolutePath = path.resolve(rootDirectory, normalizedKey);

    if (!absolutePath.startsWith(rootDirectory)) {
      throw new InternalServerErrorException("Invalid storage key");
    }

    return absolutePath;
  }
}
