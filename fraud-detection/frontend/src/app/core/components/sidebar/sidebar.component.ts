import { Component, signal, inject, output, input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  isCollapsed = signal(false);
  mobileOpen = input<boolean>(false);
  collapsedChange = output<boolean>();
  mobileClose = output<void>();

  menuItems = [
    {
      icon: '️',
      label: 'Détection de fraude',
      path: '/fraud-detection',
      description: 'Alertes IA'
    },
    {
      icon: '💳',
      label: 'Transactions',
      path: '/transactions',
      description: 'Historique'
    },
    {
      icon: '🏦',
      label: 'Multi-Banking',
      path: '/multi-banking',
      description: 'Ingestion fichiers'
    },
    {
      icon: '📈',
      label: 'Rapports',
      path: '/reports',
      description: 'Statistiques'
    },
    {
      icon: '📋',
      label: 'Cas d\'usage',
      path: '/use-cases',
      description: 'Vitrine des cas d\'usage'
    },
  ];

  toggleCollapse() {
    this.isCollapsed.update(c => !c);
    this.collapsedChange.emit(this.isCollapsed());
  }

  closeMobile() {
    this.mobileClose.emit();
  }

  navigate(path: string) {
    this.router.navigate([path]);
  }

  isRouteActive(path: string): boolean {
    return this.router.url === path;
  }
}