import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./core/layouts/main-layout/main-layout.component')
      .then(m => m.MainLayoutComponent),
    children: [
      {
        path: 'fraud-detection',
        loadComponent: () => import('./features/fraud-detection/pages/fraud-dashboard.component')
          .then(m => m.FraudDashboardComponent)
      },
      {
        path: 'transactions',
        loadComponent: () => import('./features/transactions/pages/transactions-list/transactions-list.component')
          .then(m => m.TransactionsListComponent)
      },
      {
        path: 'reports',
        loadComponent: () => import('./features/reports/pages/reports.component')
          .then(m => m.ReportsComponent)
      },
      {
        path: 'multi-banking',
        loadComponent: () => import('./features/multi-banking/pages/multi-banking-dashboard.component')
          .then(m => m.MultiBankingDashboardComponent)
      },
      {
        path: 'use-cases',
        loadComponent: () => import('./use-cases/use-cases.component')
          .then(m => m.UseCasesComponent)
      },
      {
        path: '',
        redirectTo: 'fraud-detection',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];