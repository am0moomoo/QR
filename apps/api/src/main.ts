import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { configureApiApp } from "./bootstrap-api";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true
  });
  configureApiApp(app);

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
