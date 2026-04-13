import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { RequestMethod, ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "r/:slug", method: RequestMethod.GET },
      { path: "r/:slug/password", method: RequestMethod.POST },
      { path: "inactive", method: RequestMethod.GET },
      { path: "landing/:slug", method: RequestMethod.GET }
    ]
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
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
