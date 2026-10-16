import { AppController } from '../src/app.controller';

describe('AppController (tratofacil-media CDN Proxy & KYC Isolation)', () => {
  let controller: AppController;
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      AWS_REGION: 'auto',
      AWS_ACCESS_KEY_ID: 'test_access_key',
      AWS_SECRET_ACCESS_KEY: 'test_secret_key',
      AWS_BUCKET_NAME: 'tratofacil-media-test',
      AWS_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
    };
    controller = new AppController();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Health Endpoint', () => {
    it('GET /files/ debe responder con 200 y mensaje operativo', async () => {
      const mockRes: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await controller.health(mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('CDN proxy operativo.');
    });
  });

  describe('Validación de Archivos y Extensiones', () => {
    it('debe rechazar con 400 si el archivo no tiene extensión', async () => {
      const mockReq: any = { url: '/files/avatar-without-extension', ip: '127.0.0.1' };
      const mockRes: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await controller.getImage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith('Invalid filename');
    });

    it('debe rechazar con 400 si la extensión no está permitida (e.g. .exe, .sh, .html)', async () => {
      const mockReq: any = { url: '/files/payload.exe', ip: '127.0.0.1' };
      const mockRes: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await controller.getImage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith('Invalid file extension');
    });

    it('debe rechazar con 400 si la key es inválida (undefined o null)', async () => {
      const mockReq: any = { url: '/files/undefined.jpg', ip: '127.0.0.1' };
      const mockRes: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await controller.getImage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith('Invalid key');
    });
  });

  describe('Seguridad: Law 6 — The KYC Privacy Isolation Law', () => {
    const sensitivePaths = [
      '/files/kyc/rut-anverso.jpg',
      '/files/identity/carnet-reverso.png',
      '/files/private/certificado-antecedentes.pdf',
      '/files/documents/contrato.pdf',
      '/files/dni/12345678-k.jpg',
      '/files/selfie/verificacion-rostro.webp',
    ];

    test.each(sensitivePaths)(
      'debe bloquear con 403 Forbidden el acceso no autorizado a %s',
      async (sensitiveUrl) => {
        const mockReq: any = { url: sensitiveUrl, ip: '190.22.10.5' };
        const mockRes: any = {
          status: jest.fn().mockReturnThis(),
          send: jest.fn(),
        };

        await controller.getImage(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.send).toHaveBeenCalledWith('Forbidden: Private resource');
      }
    );

    describe('Path Traversal & KYC Bypass Prevention', () => {
      const traversalBypassPaths = [
        '/files/public/../kyc/rut-anverso.jpg',
        '/files/nested/sub/../../identity/carnet-reverso.png',
        '/files/uploads/temp/../../private/certificado.pdf',
        '/files/a/b/c/../../../documents/contrato.pdf',
        '/files/public/..\\kyc\\rut-anverso.jpg',
        '/files/kyc%5crut-anverso.jpg',
        '/files/%20kyc/rut-anverso.jpg',
        '/files/KYC/RUT-ANVERSO.JPG',
        '/files/kyc///rut-anverso.jpg',
        '/files/public/../private/documento.pdf',
      ];

      test.each(traversalBypassPaths)(
        'debe neutralizar path traversal y bloquear con 403 el acceso encubierto a %s',
        async (traversalUrl) => {
          const mockReq: any = { url: traversalUrl, ip: '190.22.10.5' };
          const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
          };

          await controller.getImage(mockReq, mockRes);

          expect(mockRes.status).toHaveBeenCalledWith(403);
          expect(mockRes.send).toHaveBeenCalledWith('Forbidden: Private resource');
        }
      );

      it('debe rechazar con 400 si el path traversal escapa por encima de la raíz (../..)', async () => {
        const mockReq: any = { url: '/files/../../etc/passwd.jpg', ip: '127.0.0.1' };
        const mockRes: any = {
          status: jest.fn().mockReturnThis(),
          send: jest.fn(),
        };

        await controller.getImage(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.send).toHaveBeenCalledWith('Invalid key');
      });
    });
  });
});
