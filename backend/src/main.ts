import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT != null ? Number(process.env.PORT) : 3000;
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors(
    corsOrigin != null && corsOrigin !== ''
      ? { origin: corsOrigin.split(',').map((o) => o.trim()), credentials: true }
      : { origin: true },
  );
  await app.listen(port);
}
bootstrap();
