import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  
  private apiUrl = '/api';

  constructor(private http: HttpClient) {
    // Removed automatic loading to reduce startup tasks
    // Call loadUserFromSession() when needed
  }

  private loadUserFromSession() {
    if (typeof window !== 'undefined') {
      // Try to get user data from Supabase session
      const supabaseStorageKey = Object.keys(localStorage).find(
        key => key.startsWith('sb-') && key.endsWith('-auth-token')
      );

      if (supabaseStorageKey) {
        try {
          const sessionData = JSON.parse(localStorage.getItem(supabaseStorageKey) || '{}');
          if (sessionData.user) {
            const user: User = {
              id: sessionData.user.id,
              name: sessionData.user.user_metadata?.name || sessionData.user.email?.split('@')[0] || 'Utilisateur',
              email: sessionData.user.email || '',
              role: sessionData.user.user_metadata?.role || 'USER',
              avatar: sessionData.user.user_metadata?.avatar || '👤'
            };
            this.currentUserSubject.next(user);
            return;
          }
        } catch (e) {
          console.error("Erreur lors de la lecture du token Supabase:", e);
        }
      }

      // Fallback: Try to get user from localStorage
      const storedUser = localStorage.getItem('current_user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          this.currentUserSubject.next(user);
        } catch (e) {
          console.error("Erreur lors de la lecture de l'utilisateur:", e);
        }
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
    return this.http.get<any>(`${this.apiUrl}/user/me`).pipe(
      map(response => {
        const user: User = {
          id: response.id,
          name: response.name || response.email?.split('@')[0] || 'Utilisateur',
          email: response.email || '',
          role: response.role || 'USER',
          avatar: response.avatar || '👤'
        };
        this.currentUserSubject.next(user);
        localStorage.setItem('current_user', JSON.stringify(user));
        return user;
      }),
      catchError(error => {
        console.error('Error fetching user from API:', error);
        // Return a default user for demo purposes
        const defaultUser: User = {
          id: 'demo',
          name: 'Utilisateur Démo',
          email: 'demo@bankmatch.com',
          role: 'ACCOUNTANT',
          avatar: '👤'
        };
        this.currentUserSubject.next(defaultUser);
        return of(defaultUser);
      })
    );
  }

  logout() {
    this.currentUserSubject.next(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('current_user');
      // Clear Supabase session
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