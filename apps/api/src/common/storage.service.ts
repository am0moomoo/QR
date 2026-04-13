import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit
} from "@nestjs/common";
import { LocalStorageDriver } from "./storage/local-storage.driver";
import { S3StorageDriver } from "./storage/s3-storage.driver";
import type {
  StorageDriver,
  StorageDriverKind,
  StoredObject,
  StoredObjectReference
} from "./storage/storage-driver";

@Injectable()
export class StorageService implements OnModuleInit {
  private driver: StorageDriver | null = null;

  async onModuleInit() {
    const driver = this.getDriverInstance();
    await driver.initialize();

    console.log("storage.initialized", {
      driver: driver.kind
    });
  }

  async putObject(storageKey: string, body: Buffer | string) {
    return this.getDriverInstance().putObject(storageKey, body);
  }

  async getObject(storageKey: string): Promise<StoredObject> {
    return this.getDriverInstance().getObject(storageKey);
  }

  async deleteObject(storageKey: string) {
    return this.getDriverInstance().deleteObject(storageKey);
  }

  async deleteObjects(storageKeys: string[]) {
    return this.getDriverInstance().deleteObjects(storageKeys);
  }

  async getSignedDownloadUrl(storageKey: string, expiresInSeconds = 300) {
    return this.getDriverInstance().getSignedDownloadUrl(
      storageKey,
      expiresInSeconds
    );
  }

  async listObjects(prefix: string): Promise<StoredObjectReference[]> {
    return this.getDriverInstance().listObjects(prefix);
  }

  getDriver() {
    return this.getConfiguredDriver();
  }

  private getDriverInstance() {
    if (this.driver) {
      return this.driver;
    }

    const configuredDriver = this.getConfiguredDriver();

    if (configuredDriver === "local") {
      this.driver = new LocalStorageDriver();
      return this.driver;
    }

    if (configuredDriver === "s3" || configuredDriver === "r2") {
      this.driver = new S3StorageDriver(configuredDriver);
      return this.driver;
    }

    throw new InternalServerErrorException(
      `Unsupported storage driver "${configuredDriver}".`
    );
  }

  private getConfiguredDriver(): StorageDriverKind {
    const value = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();

    if (value === "local" || value === "s3" || value === "r2") {
      return value;
    }

    throw new InternalServerErrorException(
      `Unsupported storage driver "${value}".`
    );
  }
}