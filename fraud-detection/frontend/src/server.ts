import 'dotenv/config';
import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node';
import express, { Request, Response, NextFunction } from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import multer from 'multer';

// Import du module serveur principal généré par Angular
import bootstrap from './main.server';

const app = express();

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');
const indexHtml = join(serverDistFolder, 'index.server.html');

// ====================================================================
// 1. CONFIGURATION ET VARIABLES D'ENVIRONNEMENT
// ====================================================================
const FRAUD_API_URL = process.env['FRAUD_API_URL'] || 'http://localhost:8006';
const MULTI_BANKING_API_URL = process.env['MULTI_BANKING_API_URL'] || 'http://localhost:8010';
const NODE_BACKEND_URL = process.env['NODE_BACKEND_URL'] || 'http://localhost:8006';
const JWT_SECRET = process.env['JWT_SECRET'] || 'internal_dev_secret';
const FRAUD_INTERNAL_SECRET = process.env['FRAUD_INTERNAL_SECRET'] || 'fraud_dev_secret_123';

if (!process.env['JWT_SECRET']) {
  console.warn("⚠️  JWT_SECRET non défini dans l'environnement. Utilisation de la clé par défaut.");
}
if (!process.env['FRAUD_INTERNAL_SECRET']) {
  console.warn("⚠️  FRAUD_INTERNAL_SECRET non défini, utilisation de la valeur par défaut dev.");
}

console.log(`🔗 Configuration API:`);
console.log(`🔗 Fraude API -> ${FRAUD_API_URL}`);
console.log(`🔗 Multi-Banking API -> ${MULTI_BANKING_API_URL}`);
console.log(`🔗 Node Backend -> ${NODE_BACKEND_URL}`);

if (!process.env['JWT_SECRET']) {
  console.warn("⚠️  JWT_SECRET non défini dans l'environnement. Utilisation de la clé par défaut.");
}

/**
 * Génère un jeton JWT interne éphémère pour authentifier les requêtes Express -> FastAPI
 * Utilise FRAUD_INTERNAL_SECRET pour les routes /api/analyze vers fraud-service,
 * et JWT_SECRET pour compatibilité legacy.
 */
const generateInternalToken = (useFraudSecret = false) => {
  const secret = useFraudSecret ? FRAUD_INTERNAL_SECRET : JWT_SECRET;
  const payload: Record<string, unknown> = useFraudSecret
    ? { service: 'express-gateway', purpose: 'internal_api_call', tenant_id: 'default' }
    : { service: 'express-gateway' };
  return jwt.sign(payload, secret, { expiresIn: '5m' });
};

// ====================================================================
// 2. CONFIGURATION DU MOTEUR SSR ET MIDDLEWARES
// ====================================================================
const commonEngine = new CommonEngine({
  allowedHosts: ['localhost', '127.0.0.1']
});

app.set('view engine', 'html');
app.set('views', browserDistFolder);

// Indispensable pour parser le corps des requêtes POST / PUT en JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for handling multipart/form-data
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  }
});

// ====================================================================
// 🚀 3. PROXY API UNIFIÉ VERS FASTAPI (8005) & NODE BACKEND (3000)
// ====================================================================
// ====================================================================
// 🚀 3. PROXY API UNIFIÉ VERS FASTAPI (8005) & MULTI-BANKING (8010)
// ====================================================================

// Proxy pour Multi-Banking API (port 8010)
app.use('/api/banking', upload.any(), async (req: Request, res: Response) => {
  try {
    // Remove /api/banking prefix and add /banking for the target
    const targetPath = req.originalUrl.replace('/api/banking', '/banking');
    const targetUrl = `${MULTI_BANKING_API_URL}${targetPath}`;

    // Vérification du Token
    const rawAuth = req.headers['authorization'];
    const hasValidToken = rawAuth && rawAuth.replace('Bearer ', '').trim().length > 0;
    const authHeader = hasValidToken ? rawAuth : `Bearer ${generateInternalToken()}`;

    // Check if this is a file upload request (has files from multer)
    const hasFiles = (req as any).files && (req as any).files.length > 0;
    
    if (hasFiles) {
      // For file uploads, create FormData with the files
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      
      // Add files to FormData
      (req as any).files.forEach((file: any) => {
        formData.append(file.fieldname, file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype
        });
      });
      
      // Add other form fields from req.body
      Object.keys(req.body).forEach(key => {
        formData.append(key, req.body[key]);
      });
      
      // Get headers from formData (includes proper content-type with boundary)
      const formDataHeaders = formData.getHeaders();
      
      const response = await axios({
        method: req.method,
        url: targetUrl,
        data: formData,
        headers: {
          'Authorization': authHeader,
          ...formDataHeaders
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });
      
      res.status(response.status).json(response.data);
    } else {
      // Regular JSON request
      const headers: any = {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      };

      const response = await axios({
        method: req.method,
        url: targetUrl,
        data: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
        headers: headers,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });

      res.status(response.status).json(response.data);
    }
  } catch (error: any) {
    const status = error.response?.status || 500;
    const errorData = error.response?.data || { detail: 'Erreur proxy vers Multi-Banking API' };
    res.status(status).json(errorData);
  }
});

// Proxy pour Fraud Detection API (port 8005/8006)
app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
  // Skip if this is a banking route (handled above)
  if (req.originalUrl.startsWith('/api/banking')) {
    return next();
  }

  try {
    const targetUrl = `${FRAUD_API_URL}${req.originalUrl}`;

    // Vérification du Token — utilise FRAUD_INTERNAL_SECRET pour les routes fraud
    const rawAuth = req.headers['authorization'];
    const hasValidToken = rawAuth && rawAuth.replace('Bearer ', '').trim().length > 0;
    const needsFraudSecret = req.originalUrl.startsWith('/api/analyze') || req.originalUrl.startsWith('/api/graph') || req.originalUrl.startsWith('/api/config') || req.originalUrl.startsWith('/api/fraud') || req.originalUrl.startsWith('/api/transactions') || req.originalUrl.startsWith('/api/reports');
    const authHeader = hasValidToken ? rawAuth : `Bearer ${generateInternalToken(needsFraudSecret)}`;

    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      timeout: 8000
    });

    res.status(response.status).json(response.data);
  } catch (error: any) {
    const status = error.response?.status || 500;
    const errorData = error.response?.data || { detail: 'Erreur proxy vers FastAPI' };
    res.status(status).json(errorData);
  }
});

// ====================================================================
// 4. SERVICE DES FICHIERS STATIQUES ANGULAR
// ====================================================================
app.use(express.static(browserDistFolder, {
  maxAge: '1y',
  index: false
}));

// ====================================================================
// 5. ROUTE CATCH-ALL SSR POUR LE ROUTING ANGULAR
// ====================================================================
app.get(/.*/, (req, res, next) => {
  const { protocol, originalUrl, baseUrl, headers } = req;

  commonEngine
    .render({
      bootstrap,
      documentFilePath: indexHtml,
      url: `${protocol}://${headers.host}${originalUrl}`,
      publicPath: browserDistFolder,
      providers: [{ provide: APP_BASE_HREF, useValue: baseUrl }],
    })
    .then((html: string) => res.send(html))
    .catch((err: unknown) => {
      console.error('SSR Error:', err);
      // Fallback to client-side rendering if SSR fails
      res.sendFile(join(browserDistFolder, 'index.html'));
    });
});

// ====================================================================
// 6. DÉMARRAGE DU SERVEUR
// ====================================================================
const port = process.env['PORT'] || 4200;
app.listen(port, () => {
  console.log(`✅ Serveur SSR CommonEngine & Gateway API en écoute sur http://localhost:${port}`);
  console.log(`🔗 Redirection Fraude API -> ${FRAUD_API_URL}`);
  console.log(`🔗 Redirection Multi-Banking API -> ${MULTI_BANKING_API_URL}`);
  console.log(`🔗 Redirection Node Backend -> ${NODE_BACKEND_URL}`);
});