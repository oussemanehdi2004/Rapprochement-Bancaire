import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '',
    renderMode: RenderMode.Client
  },
  {
    path: 'fraud-detection',
    renderMode: RenderMode.Client
  },
  {
    path: 'transactions',
    renderMode: RenderMode.Client
  },
  {
    path: 'reports',
    renderMode: RenderMode.Client
  },
  {
    path: 'multi-banking',
    renderMode: RenderMode.Client
  },
  {
    path: 'use-cases',
    renderMode: RenderMode.Client
  }
];
