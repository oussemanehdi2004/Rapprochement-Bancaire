import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/ssr'; // 👈 On garde le bon membre recommandé par le compilateur
import { appConfig } from './app.config';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering() // 👈 On le laisse vide ! C'est la bonne syntaxe pour votre version.
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);