import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="animate-pulse">
      <div 
        class="rounded-lg"
        [class.bg-gray-200]="!darkMode"
        [class.dark:bg-gray-700]="darkMode"
        [style.height]="height"
        [style.width]="width"
      ></div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class SkeletonLoaderComponent {
  @Input() height = '1rem';
  @Input() width = '100%';
  @Input() darkMode = false;
}