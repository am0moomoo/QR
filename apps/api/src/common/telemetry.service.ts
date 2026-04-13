import { Injectable } from "@nestjs/common";
import { StructuredLoggerService } from "./structured-logger.service";

@Injectable()
export class TelemetryService {
  constructor(private readonly logger: StructuredLoggerService) {}

  track(event: string, payload: Record<string, unknown>) {
    this.logger.info(event, payload, "telemetry");
  }
}
