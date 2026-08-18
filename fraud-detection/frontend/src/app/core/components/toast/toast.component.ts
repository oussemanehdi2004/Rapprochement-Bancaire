import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed top-4 right-4 z-50 flex flex-col gap-2">
      @for (toast of toastService.getCurrentToasts(); track toast.id) {
        <div
          [ngClass]="getToastClasses(toast.type)"
          class="toast-notification min-w-80 max-w-md p-4 rounded-lg shadow-lg flex items-start gap-3"
        >
          <span class="text-2xl flex-shrink-0">{{ getToastIcon(toast.type) }}</span>
          <div class="flex-1 min-w-0">
            <h4 class="font-semibold text-sm text-white">{{ toast.title }}</h4>
            <p class="text-sm opacity-90 break-words text-white">{{ toast.message }}</p>
          </div>
          <button 
            (click)="toastService.remove(toast.id)"
            class="text-lg opacity-70 hover:opacity-100 transition-opacity flex-shrink-0 text-white"
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
      min-width: 320px;
      max-width: 400px;
    }
    
    .toast-notification h4 {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 600;
    }
    
    .toast-notification p {
      margin: 0;
      font-size: 13px;
      line-height: 1.4;
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
  `]
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