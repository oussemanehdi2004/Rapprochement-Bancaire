import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId?: string;
  avatar?: string;
}

interface SupabaseSessionData {
  access_token?: string;
  user?: {
    id: string;
    email?: string;
    user_metadata?: {
      name?: string;
      role?: string;
      avatar?: string;
    };
  };
}

interface ApiUserResponse {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  tenantId?: string;
  avatar?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private apiUrl = '/api';

  constructor(private http: HttpClient) {}

  private loadUserFromSession(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const supabaseStorageKey = Object.keys(localStorage).find(
      key => key.startsWith('sb-') && key.endsWith('-auth-token')
    );

    if (supabaseStorageKey) {
      try {
        const sessionData: SupabaseSessionData = JSON.parse(
          localStorage.getItem(supabaseStorageKey) || '{}'
        );
        if (sessionData.user) {
          const user: User = {
            id: sessionData.user.id,
            name: sessionData.user.user_metadata?.name || sessionData.user.email?.split('@')[0] || 'Utilisateur',
            email: sessionData.user.email || '',
            role: sessionData.user.user_metadata?.role || 'USER',
            tenantId: (sessionData.user.user_metadata as any)?.tenant_id || 'default',
            avatar: sessionData.user.user_metadata?.avatar
          };
          this.currentUserSubject.next(user);
          return;
        }
      } catch {
        // Silently handle parse errors
      }
    }

    const storedUser = localStorage.getItem('current_user');
    if (storedUser) {
      try {
        const user: User = JSON.parse(storedUser);
        this.currentUserSubject.next(user);
      } catch {
        // Silently handle parse errors
      }
    }
  }

  // Manual loading method to reduce startup tasks
  loadUserFromSessionManual() {
    this.loadUserFromSession();
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  getCurrentUserValue() {
    return this.currentUserSubject.value;
  }

  getUserFromAPI(): Observable<User> {
    return this.http.get<ApiUserResponse>(`${this.apiUrl}/user/me`).pipe(
      map(response => {
        const user: User = {
          id: response.id,
          name: response.name || response.email?.split('@')[0] || 'Utilisateur',
          email: response.email || '',
          role: response.role || 'USER',
          tenantId: response.tenantId || 'default',
          avatar: response.avatar
        };
        this.currentUserSubject.next(user);
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem('current_user', JSON.stringify(user));
        }
        return user;
      }),
      catchError(() => {
        const defaultUser: User = {
          id: 'demo',
          name: 'Utilisateur Démo',
          email: 'demo@bankmatch.com',
          role: 'ACCOUNTANT',
          tenantId: 'default',
          avatar: '👤'
        };
        this.currentUserSubject.next(defaultUser);
        return of(defaultUser);
      })
    );
  }

  logout(): void {
    this.currentUserSubject.next(null);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('current_user');
      const supabaseStorageKey = Object.keys(localStorage).find(
        key => key.startsWith('sb-') && key.endsWith('-auth-token')
      );
      if (supabaseStorageKey) {
        localStorage.removeItem(supabaseStorageKey);
      }
    }
  }

  isLoggedIn(): boolean {
    return this.currentUserSubject.value !== null;
  }
}