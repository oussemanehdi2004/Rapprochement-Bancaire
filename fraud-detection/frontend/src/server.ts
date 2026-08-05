import 'dotenv/config';
import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import jwt from 'jsonwebtoken';
import axios from 'axios';

// Import du module serveur principal généré par Angular
import bootstrap from './main.server';

const app = express();

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');
const indexHtml = join(serverDistFolder, 'index.server.html');

// ====================================================================
// 1. CONFIGURATION ET VARIABLES D'ENVIRONNEMENT
// ====================================================================
const FRAUD_API_URL = process.env['FRAUD_API_URL'] || process.env['FASTAPI_URL'] || 'http://localhost:8005';
const NODE_BACKEND_URL = process.env['NODE_BACKEND_URL'] || 'http://localhost:8005';
const JWT_SECRET = process.env['JWT_SECRET'] || 'your-secret-key';

if (!process.env['JWT_SECRET']) {
  console.warn("⚠️  JWT_SECRET non défini dans l'environnement. Utilisation de la clé par défaut.");
}

/**
 * Génère un jeton JWT interne éphémère pour authentifier les requêtes Express -> FastAPI
 */
const generateInternalToken = () => {
  return jwt.sign({ service: 'express-gateway' }, JWT_SECRET, { expiresIn: '5m' });
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

// ====================================================================
// 🚀 3. PROXY API UNIFIÉ VERS FASTAPI (8005) & NODE BACKEND (3000)
// ====================================================================
// ====================================================================
// 🚀 3. PROXY API UNIFIÉ VERS FASTAPI (8005)
// ====================================================================
app.use('/api/*', async (req, res) => {
  try {
    const targetUrl = `${FRAUD_API_URL}${req.originalUrl}`;

    // Vérification du Token
    const rawAuth = req.headers['authorization'];
    const hasValidToken = rawAuth && rawAuth.replace('Bearer ', '').trim().length > 0;
    const authHeader = hasValidToken ? rawAuth : `Bearer ${generateInternalToken()}`;

    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
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
    .catch((err: unknown) => next(err));
});

// ====================================================================
// 6. DÉMARRAGE DU SERVEUR
// ====================================================================
const port = process.env['PORT'] || 4000;
app.listen(port, () => {
  console.log(`✅ Serveur SSR CommonEngine & Gateway API en écoute sur http://localhost:${port}`);
  console.log(`🔗 Redirection Fraude API -> ${FRAUD_API_URL}`);
  console.log(`🔗 Redirection Node Backend -> ${NODE_BACKEND_URL}`);
});