import { HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) {
    return next(req);
  }

  try {
    const supabaseStorageKey = Object.keys(localStorage).find(
      key => key.startsWith('sb-') && key.endsWith('-auth-token')
    );

    if (supabaseStorageKey) {
      const sessionData = JSON.parse(localStorage.getItem(supabaseStorageKey) || '{}');
      const token = sessionData.access_token;

      if (token) {
        return next(req.clone({
          setHeaders: { Authorization: `Bearer ${token}` }
        }));
      }
    }

    const fallbackToken = localStorage.getItem('access_token');
    if (fallbackToken) {
      return next(req.clone({
        setHeaders: { Authorization: `Bearer ${fallbackToken}` }
      }));
    }
  } catch {
    // Silently fail — no token attached
  }

  return next(req);
};