import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { provideServerRendering } from '@angular/ssr';
import { appConfig } from './app.config';
import { routes } from './app.routes';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    provideRouter(routes, withDisabledInitialNavigation()),
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);