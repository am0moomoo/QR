import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { configureApiApp } from "./bootstrap-api";
import { StructuredLoggerService } from "./common/structured-logger.service";
import { getNestLoggerLevels, getRuntimeSummary } from "./runtime-config";

async function bootstrap() {
  process.env.APP_ROLE = process.env.APP_ROLE ?? "api";

  const app = await NestFactory.create(AppModule, {
    logger: getNestLoggerLevels(),
    rawBody: true
  });
  configureApiApp(app);
  app.get(StructuredLoggerService).info(
    "app.bootstrapped",
    getRuntimeSummary(),
    "bootstrap"
  );

  const config = new DocumentBuilder()
    .setTitle("QRFlow API")
    .setDescription("Local API for the QRFlow clean-room QR platform")
    .setVersion("0.2.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/reference", app, document);

  await app.listen(process.env.API_PORT || 4000);
}

bootstrap().catch((error) => {
  console.error("API bootstrap failed", error);
  process.exit(1);
});
