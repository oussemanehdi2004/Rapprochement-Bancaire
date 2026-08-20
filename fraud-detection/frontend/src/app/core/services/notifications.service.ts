import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface Notification {
  id: string;
  type: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  icon?: string;
}

interface NotificationsApiResponse {
  success: boolean;
  data: Notification[];
}

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();

  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  private apiUrl = '/api';

  constructor(private http: HttpClient) {}

  loadNotifications(): void {
    this.getNotificationsFromAPI().subscribe({
      next: (notifications) => {
        this.notificationsSubject.next(notifications);
        this.updateUnreadCount();
      },
      error: (error: unknown) => {
        console.error('Error loading notifications:', error);
        this.notificationsSubject.next(this.getMockNotifications());
        this.updateUnreadCount();
      }
    });
  }

  loadNotificationsManual(): void {
    this.loadNotifications();
  }

  getNotificationsFromAPI(): Observable<Notification[]> {
    return this.http.get<NotificationsApiResponse>(`${this.apiUrl}/notifications`).pipe(
      map(response => response.data || []),
      catchError(() => of(this.getMockNotifications()))
    );
  }

  private getMockNotifications(): Notification[] {
    return [
      {
        id: '1',
        type: 'critical',
        title: 'Nouvelle alerte critique',
        message: 'Transaction suspecte détectée',
        timestamp: new Date().toISOString(),
        read: false,
        icon: '🚨'
      },
      {
        id: '2',
        type: 'warning',
        title: 'Règle déclenchée',
        message: 'Montant exceptionnel > 10 000€',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        read: false,
        icon: '⚠️'
      },
      {
        id: '3',
        type: 'info',
        title: 'Nouveau fichier importé',
        message: 'virements_janvier_2026.xml traité avec succès',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        read: true,
        icon: '📥'
      }
    ];
  }

  getCurrentNotifications(): Notification[] {
    return this.notificationsSubject.value;
  }

  getUnreadCount(): number {
    return this.unreadCountSubject.value;
  }

  markAsRead(notificationId: string) {
    const notifications = this.notificationsSubject.value;
    const updated = notifications.map(n => 
      n.id === notificationId ? { ...n, read: true } : n
    );
    this.notificationsSubject.next(updated);
    this.updateUnreadCount();
    
    // Sync with API
    this.markAsReadOnAPI(notificationId).subscribe();
  }

  markAllAsRead() {
    const notifications = this.notificationsSubject.value;
    const updated = notifications.map(n => ({ ...n, read: true }));
    this.notificationsSubject.next(updated);
    this.updateUnreadCount();
    
    // Sync with API
    this.markAllAsReadOnAPI().subscribe();
  }

  private markAsReadOnAPI(notificationId: string): Observable<unknown> {
    return this.http.patch(`${this.apiUrl}/notifications/${notificationId}/read`, {}).pipe(
      catchError(() => of(null))
    );
  }

  private markAllAsReadOnAPI(): Observable<unknown> {
    return this.http.patch(`${this.apiUrl}/notifications/read-all`, {}).pipe(
      catchError(() => of(null))
    );
  }

  addNotification(notification: Notification) {
    const current = this.notificationsSubject.value;
    this.notificationsSubject.next([notification, ...current]);
    this.updateUnreadCount();
  }

  private updateUnreadCount() {
    const unread = this.notificationsSubject.value.filter(n => !n.read).length;
    this.unreadCountSubject.next(unread);
  }

  deleteNotification(notificationId: string) {
    const current = this.notificationsSubject.value;
    const updated = current.filter(n => n.id !== notificationId);
    this.notificationsSubject.next(updated);
    this.updateUnreadCount();
    
    // Sync with API
    this.deleteNotificationOnAPI(notificationId).subscribe();
  }

  private deleteNotificationOnAPI(notificationId: string): Observable<unknown> {
    return this.http.delete(`${this.apiUrl}/notifications/${notificationId}`).pipe(
      catchError(() => of(null))
    );
  }
}