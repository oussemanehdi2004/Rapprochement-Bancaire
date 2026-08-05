import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideApi } from './api/provide-api';
import { authInterceptor } from './auth.interceptor';

// NOTE (fix basePath): toutes les requêtes API doivent transiter par le proxy
// Express relatif (/api/*, voir server.ts), exactement comme
// FraudAlertsService, ConfigService et GraphService le font déjà.
// On ne fixe donc plus de host/port en dur ici (c'était http://127.0.0.1:8006) :
// une base vide fait pointer le client généré (DefaultService) sur des chemins
// relatifs, cohérents avec le reste du frontend.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor])
    ),
    provideClientHydration(withEventReplay()),
    provideApi(''),
  ]
};