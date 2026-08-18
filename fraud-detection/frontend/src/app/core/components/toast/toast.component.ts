import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from '../../services/toast.service';
import { trigger, style, animate, transition } from '@angular/animations';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed top-4 right-4 z-50 flex flex-col gap-2">
      @for (toast of toastService.getCurrentToasts(); track toast.id) {
        <div
          [@slideIn]
          [class]="getToastClasses(toast.type)"
          class="toast-notification min-w-80 max-w-md p-4 rounded-lg shadow-lg flex items-start gap-3"
        >
          <span class="text-2xl">{{ getToastIcon(toast.type) }}</span>
          <div class="flex-1">
            <h4 class="font-semibold text-sm">{{ toast.title }}</h4>
            <p class="text-sm opacity-90">{{ toast.message }}</p>
          </div>
          <button 
            (click)="toastService.remove(toast.id)"
            class="text-lg opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-notification {
      animation: slideIn 0.3s ease-out;
    }
    
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('0.3s ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
      ])
    ])
  ]
})
export class ToastComponent {
  toastService = inject(ToastService);

  getToastClasses(type: string): string {
    const baseClasses = 'min-w-80 max-w-md p-4 rounded-lg shadow-lg flex items-start gap-3';
    
    switch (type) {
      case 'success':
        return `${baseClasses} bg-green-500 text-white`;
      case 'error':
        return `${baseClasses} bg-red-500 text-white`;
      case 'warning':
        return `${baseClasses} bg-yellow-500 text-white`;
      case 'info':
      default:
        return `${baseClasses} bg-blue-500 text-white`;
    }
  }

  getToastIcon(type: string): string {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
      default:
        return 'ℹ️';
    }
  }
}