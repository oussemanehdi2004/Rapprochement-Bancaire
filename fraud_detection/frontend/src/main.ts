import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component'; // 👈 On importe le nouveau composant

bootstrapApplication(AppComponent, appConfig) // 👈 On démarre AppComponent
  .catch((err) => console.error(err));