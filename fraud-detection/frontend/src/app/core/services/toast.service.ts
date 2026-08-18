import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  persistent?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toasts = signal<Toast[]>([]);
  private toastSubject = new Subject<Toast>();
  
  toasts$ = this.toastSubject.asObservable();

  show(toast: Omit<Toast, 'id'>) {
    const id = Date.now().toString();
    const newToast: Toast = {
      id,
      ...toast,
      duration: toast.duration ?? 4000,
      persistent: toast.persistent ?? false
    };
    
    this.toasts.update(current => [...current, newToast]);
    this.toastSubject.next(newToast);

    if (!newToast.persistent) {
      setTimeout(() => {
        this.remove(id);
      }, newToast.duration);
    }

    return id;
  }

  success(title: string, message: string, duration?: number) {
    return this.show({
      type: 'success',
      title,
      message,
      duration
    });
  }

  error(title: string, message: string, duration?: number) {
    return this.show({
      type: 'error',
      title,
      message,
      duration: duration ?? 6000 // Errors stay longer
    });
  }

  warning(title: string, message: string, duration?: number) {
    return this.show({
      type: 'warning',
      title,
      message,
      duration
    });
  }

  info(title: string, message: string, duration?: number) {
    return this.show({
      type: 'info',
      title,
      message,
      duration
    });
  }

  remove(id: string) {
    this.toasts.update(current => current.filter(t => t.id !== id));
  }

  clear() {
    this.toasts.set([]);
  }

  getCurrentToasts() {
    return this.toasts();
  }
}