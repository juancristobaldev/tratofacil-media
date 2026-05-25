import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule);
    const port = process.env.PORT ?? 3002;

    await app.listen(port);
    logger.log(`Cloudflare Images CDN corriendo en puerto ${port}`);
    logger.log(`Bucket S3: ${process.env.AWS_BUCKET_NAME ?? 'no configurado'}`);
    logger.log(`Region: ${process.env.AWS_REGION ?? 'no configurada'}`);
  } catch (err) {
    logger.error(
      'Fallo al iniciar el servidor',
      err instanceof Error ? err.stack : err,
    );
    process.exit(1);
  }
}///

process.on('unhandledRejection', (reason) => {
  new Logger('Process').error(
    'Unhandled Rejection',
    reason instanceof Error ? reason.stack : reason,
  );
});

bootstrap();
