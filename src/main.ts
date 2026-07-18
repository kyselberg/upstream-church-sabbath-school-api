import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  json,
  urlencoded,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { auth } from './auth/auth';
import { MetricsInterceptor } from './metrics.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });

  const expressApp = app.getHttpAdapter().getInstance();
  const authHandler = toNodeHandler(auth);
  expressApp.use((req: Request, res: Response, next: NextFunction) =>
    req.originalUrl.startsWith('/api/auth') ? authHandler(req, res) : next(),
  );
  app.use(json());
  app.use(urlencoded({ extended: true }));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new MetricsInterceptor());

  const config = new DocumentBuilder()
    .setTitle('sabbath-api')
    .setVersion('0.0.1')
    .addCookieAuth('better-auth.session_token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
