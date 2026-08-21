import { Component, signal, inject, Input, output, HostListener, AfterViewInit, OnDestroy, OnInit, PLATFORM_ID, DestroyRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
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
export class HeaderComponent implements OnInit, AfterViewInit {
  private readonly platformId = inject(PLATFORM_ID);
  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private notificationsService = inject(NotificationsService);

  @Input() collapsed = false;
  menuClick = output<void>();

  currentUser = signal({
    name: 'Claire',
    role: 'ACCOUNTANT',
    avatar: '👩‍💼'
  });

  notifications = signal<Notification[]>([]);
  unreadCount = signal(0);
  showNotifications = signal(false);

  currentTime = signal('');
  currentDate = signal('');
  private timeUpdateInterval: ReturnType<typeof setInterval> | undefined;

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.authService.loadUserFromSessionManual();
    const user = this.authService.getCurrentUser();
    if (user) {
      this.currentUser.set({
        name: user.name,
        role: user.role,
        avatar: user.avatar || '👤'
      });
    } else {
      this.currentUser.set({
        name: 'Utilisateur Démo',
        role: 'ACCOUNTANT',
        avatar: '👤'
      });
    }

    this.notificationsService.loadNotificationsManual();

    this.notificationsService.notifications$
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (notifications) => this.notifications.set(notifications)
      });

    this.notificationsService.unreadCount$
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (count) => this.unreadCount.set(count)
      });
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.updateTime();
    this.timeUpdateInterval = setInterval(() => this.updateTime(), 1000);

    this.destroyRef.onDestroy(() => {
      if (this.timeUpdateInterval) {
        clearInterval(this.timeUpdateInterval);
      }
    });
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
