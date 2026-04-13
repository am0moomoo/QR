import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger("telemetry");

  track(event: string, payload: Record<string, unknown>) {
    this.logger.log(
      JSON.stringify({
        event,
        ...payload,
        timestamp: new Date().toISOString()
      })
    );
  }
}
