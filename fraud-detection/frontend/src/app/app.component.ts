import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`,
  styleUrls: ['./app.css'] // Fait le lien avec le fichier app.css que je vois dans ta capture
})
export class AppComponent {
  title = 'rapprochement-bancaire';
}