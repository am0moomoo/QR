import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleInit
} from "@nestjs/common";
import { promises as fs } from "node:fs";
import * as path from "node:path";

type StoredObject = {
  absolutePath: string;
  body: Buffer;
  bytes: bigint;
};

@Injectable()
export class StorageService implements OnModuleInit {
  async onModuleInit() {
    if (this.getDriver() !== "local") {
      throw new InternalServerErrorException(
        `Unsupported storage driver "${this.getDriver()}". Only local storage is configured in this build.`
      );
    }

    await fs.mkdir(this.getRootDirectory(), { recursive: true });
  }

  async putObject(storageKey: string, body: Buffer | string) {
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

  getDriver() {
    return (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
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
