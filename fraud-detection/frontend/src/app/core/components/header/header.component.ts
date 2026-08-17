import { Component, signal, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DOCUMENT } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent {
  private document = inject(DOCUMENT);
  
  @Input() collapsed = false;
  
  currentUser = signal({
    name: 'Claire',
    role: 'ACCOUNTANT',
    avatar: '👩‍💼'
  });

  notifications = signal(3);
  showNotifications = signal(false);
  darkMode = signal(false);

  constructor() {
    // Check for saved preference or system preference
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const savedMode = localStorage.getItem('darkMode');
      if (savedMode !== null) {
        this.darkMode.set(savedMode === 'true');
      } else {
        // Check system preference
        this.darkMode.set(window.matchMedia('(prefers-color-scheme: dark)').matches);
      }
      this.applyDarkMode();
    }
  }

  toggleDarkMode() {
    this.darkMode.update(mode => !mode);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('darkMode', this.darkMode().toString());
    }
    this.applyDarkMode();
  }

  private applyDarkMode() {
    if (this.darkMode()) {
      this.document.documentElement.classList.add('dark');
    } else {
      this.document.documentElement.classList.remove('dark');
    }
  }

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
