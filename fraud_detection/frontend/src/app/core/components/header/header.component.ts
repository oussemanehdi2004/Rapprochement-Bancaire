import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent {
  currentUser = signal({
    name: 'Claire',
    role: 'ACCOUNTANT',
    avatar: '👩‍💼'
  });

  notifications = signal(3);
  showNotifications = signal(false);

  toggleNotifications() {
    this.showNotifications.update(show => !show);
  }

  getCurrentDate(): string {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return now.toLocaleDateString('fr-FR', options);
  }

  getCurrentTime(): string {
    const now = new Date();
    return now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
}
