import { Controller, Get, Logger, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import * as path from 'path';

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];

@Controller('files')
export class AppController {
  private readonly logger = new Logger(AppController.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor() {
    this.logger.log('Inicializando S3Client...');

    const region = process.env.AWS_REGION || 'auto';
    const accessKey = process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const bucket = process.env.AWS_BUCKET_NAME;
    const endpoint = process.env.AWS_ENDPOINT;

    if (!accessKey || !secretKey || !bucket) {
      this.logger.error('Faltan variables de entorno AWS/R2 requeridas');
      throw new Error('Configuracion AWS incompleta');
    }

    this.bucket = bucket;

    this.s3 = new S3Client({
      region,
      endpoint: endpoint || undefined,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });


    this.logger.log(
      `S3Client inicializado — bucket: ${this.bucket}, region: ${region}`,
    );
  }

  @Get('/')
  async health(@Res() res: Response) {
    return res.status(200).send('CDN proxy operativo.');
  }

  @Get('*path')
  async getImage(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const start = Date.now();
    const fullPath = decodeURIComponent(req.url.slice('/files/'.length));

    this.logger.log(`GET ${fullPath} — ${req.ip || 'unknown'}`);

    const lastDot = fullPath.lastIndexOf('.');
    if (lastDot === -1) {
      this.logger.warn(`Extension ausente en: ${fullPath}`);
      return res.status(400).send('Invalid filename');
    }

    const extension = fullPath.slice(lastDot + 1).toLowerCase();
    const rawKey = fullPath.slice(0, lastDot);
    const s3Key = path.posix.normalize(rawKey.replace(/\\+/g, '/').trim()).replace(/^\/+/, '');

    if (!s3Key || s3Key === '.' || s3Key === 'undefined' || s3Key === 'null' || s3Key.startsWith('..')) {
      this.logger.warn(`Key invalida: "${s3Key}" — ${fullPath}`);
      return res.status(400).send('Invalid key');
    }

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      this.logger.warn(
        `Extension no permitida: .${extension} — ${fullPath}`,
      );
      return res.status(400).send('Invalid file extension');
    }

    // Security (Law 6: The KYC Privacy Isolation Law):
    // Bloquear acceso no autenticado y cacheo público CDN para documentos privados y biométricos
    const lowerKey = s3Key.toLowerCase();
    const isPrivate =
      lowerKey.startsWith('kyc/') ||
      lowerKey.startsWith('identity/') ||
      lowerKey.startsWith('private/') ||
      lowerKey.startsWith('documents/') ||
      lowerKey.startsWith('dni/') ||
      lowerKey.startsWith('selfie/');

    if (isPrivate) {
      this.logger.warn(
        `Acceso bloqueado a recurso privado/KYC: "${s3Key}" — IP: ${req.ip || 'unknown'}`
      );
      return res.status(403).send('Forbidden: Private resource');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      });

      const response = await this.s3.send(command);

      if (!response.Body) {
        this.logger.warn(`S3 retorno body vacio — key: ${s3Key}`);
        return res.status(404).send('File not found');
      }

      const contentLength = response.ContentLength;
      const contentType = response.ContentType || 'application/octet-stream';
      const elapsed = Date.now() - start;

      this.logger.log(
        `SERVED ${s3Key} — ${contentType} — ${formatSize(contentLength)} — ${elapsed}ms`,
      );

      const bodyStream = response.Body as Readable;

      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });

      bodyStream.on('error', (err) => {
        this.logger.error(
          `Stream error para key ${s3Key}: ${err instanceof Error ? err.message : 'desconocido'}`,
          err instanceof Error ? err.stack : undefined,
        );
        if (!res.headersSent) {
          res.status(500).send('Stream error');
        }
      });

      res.on('error', (err) => {
        this.logger.error(
          `Response error para key ${s3Key}: ${err instanceof Error ? err.message : 'desconocido'}`,
        );
        bodyStream.destroy();
      });

      bodyStream.pipe(res);
    } catch (e) {
      const elapsed = Date.now() - start;
      const errorMsg = e instanceof Error ? e.message : String(e);
      const effectiveKey = typeof s3Key === 'string' ? s3Key : fullPath;

      this.logger.error(
        `S3_ERROR key=${effectiveKey} — ${errorMsg} — ${elapsed}ms`,
        e instanceof Error ? e.stack : undefined,
      );

      if (!res.headersSent) {
        return res.status(500).send('Internal Server Error');
      }
    }
  }
}

function formatSize(bytes: number | undefined): string {
  if (!bytes) return '?B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
