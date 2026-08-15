import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-category-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
      <span class="mr-1.5 h-2 w-2 rounded-full bg-blue-500"></span>
      {{ category }}
    </span>
  `
})
export class CategoryBadgeComponent {
  @Input() category: string = 'Non catégorisé';
}
