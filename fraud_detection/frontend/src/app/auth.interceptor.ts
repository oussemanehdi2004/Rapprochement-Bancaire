import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // 1. On vérifie qu'on est bien dans le navigateur (pour éviter les erreurs SSR/Hydration)
  if (typeof window !== 'undefined') {
    
    // 2. On cherche dynamiquement la clé de session Supabase dans le localStorage
    // Elle commence par 'sb-' et finit par '-auth-token'
    const supabaseStorageKey = Object.keys(localStorage).find(
      key => key.startsWith('sb-') && key.endsWith('-auth-token')
    );

    if (supabaseStorageKey) {
      try {
        // 3. On récupère la chaîne JSON et on la parse
        const sessionData = JSON.parse(localStorage.getItem(supabaseStorageKey) || '{}');
        const token = sessionData.access_token;

        // 4. Si on a trouvé un jeton, on l'injecte dans la requête
        if (token) {
          const clonedRequest = req.clone({
            setHeaders: {
              Authorization: `Bearer ${token}`
            }
          });
          return next(clonedRequest);
        }
      } catch (e) {
        console.error("Erreur lors de la lecture du token Supabase:", e);
      }
    }
    
    // Cas de secours : si vous aviez un stockage manuel classique
    const fallbackToken = localStorage.getItem('access_token');
    if (fallbackToken) {
      const clonedRequest = req.clone({
        setHeaders: { Authorization: `Bearer ${fallbackToken}` }
      });
      return next(clonedRequest);
    }
  }

  // S'il n'y a pas de jeton (utilisateur non connecté), on laisse passer la requête
  return next(req);
};