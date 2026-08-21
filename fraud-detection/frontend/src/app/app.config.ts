import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideApi } from './api/provide-api';
import { authInterceptor } from './auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
      withComponentInputBinding()
    ),
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor])
    ),
    // Hydration sans EventReplay pour éviter la page blanche nécessitant un clic (bug Angular 17+ SSR)
    provideClientHydration(),
    provideApi(''),
  ]
};