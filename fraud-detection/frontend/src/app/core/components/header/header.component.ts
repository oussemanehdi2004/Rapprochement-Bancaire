import { Component, signal, inject, Input, output, HostListener, AfterViewInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { NotificationsService, Notification } from '../../services/notifications.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements AfterViewInit {
  private document = inject(DOCUMENT);
  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private notificationsService = inject(NotificationsService);

  menuClick = output<void>();

  currentUser = signal({
    name: 'Claire',
    role: 'ACCOUNTANT',
    avatar: '👩‍💼'
  });

  notifications = signal<Notification[]>([]);
  unreadCount = signal(0);
  showNotifications = signal(false);
  darkMode = signal(false);
  
  currentTime = signal('');
  currentDate = signal('');
  private timeUpdateInterval: any;

  constructor() {
    // Load user from auth service
    const user = this.authService.getCurrentUser();
    if (user) {
      this.currentUser.set({
        name: user.name,
        role: user.role,
        avatar: user.avatar || '👤'
      });
    } else {
      // Try to fetch from API if not in session
      this.authService.getUserFromAPI().subscribe({
        next: (user) => {
          this.currentUser.set({
            name: user.name,
            role: user.role,
            avatar: user.avatar || '👤'
          });
        }
      });
    }

    // Load notifications from service
    this.notificationsService.notifications$.subscribe({
      next: (notifications) => {
        this.notifications.set(notifications);
      }
    });

    this.notificationsService.unreadCount$.subscribe({
      next: (count) => {
        this.unreadCount.set(count);
      }
    });

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
    
    // Initialize time only on client side to avoid SSR hydration mismatch
    if (typeof window !== 'undefined') {
      this.updateTime();
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

  ngAfterViewInit() {
    // Start time updates only after component is initialized on client
    if (typeof window !== 'undefined') {
      this.timeUpdateInterval = setInterval(() => {
        this.updateTime();
      }, 1000);
      
      // Cleanup on destroy
      this.destroyRef.onDestroy(() => {
        if (this.timeUpdateInterval) {
          clearInterval(this.timeUpdateInterval);
        }
      });
    }
  }

  private updateTime() {
    if (typeof window === 'undefined') return;
    
    const now = new Date();
    const timeOptions: Intl.DateTimeFormatOptions = { 
      hour: '2-digit', 
      minute: '2-digit' 
    };
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    
    this.currentTime.set(now.toLocaleTimeString('fr-FR', timeOptions));
    this.currentDate.set(now.toLocaleDateString('fr-FR', dateOptions));
  }

  toggleNotifications() {
    this.showNotifications.update(show => !show);
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    if (this.showNotifications()) {
      const target = event.target as HTMLElement;
      const notificationPanel = target.closest('.notification-panel');
      const notificationButton = target.closest('button[aria-label="Notifications"]');
      
      if (!notificationPanel && !notificationButton) {
        this.showNotifications.set(false);
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.showNotifications()) {
      this.showNotifications.set(false);
    }
  }

  getCurrentDate(): string {
    return this.currentDate();
  }

  getCurrentTime(): string {
    return this.currentTime();
  }

  markAsRead(notificationId: string) {
    this.notificationsService.markAsRead(notificationId);
  }

  markAllAsRead() {
    this.notificationsService.markAllAsRead();
  }

  getNotificationIcon(type: string): string {
    switch (type) {
      case 'critical':
        return '🚨';
      case 'warning':
        return '⚠️';
      case 'success':
        return '✅';
      case 'info':
      default:
        return 'ℹ️';
    }
  }

  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'À l\'instant';
    } else if (diffMins < 60) {
      return `Il y a ${diffMins} min`;
    } else if (diffHours < 24) {
      return `Il y a ${diffHours} h`;
    } else if (diffDays < 7) {
      return `Il y a ${diffDays} j`;
    } else {
      return date.toLocaleDateString('fr-FR');
    }
  }
}
