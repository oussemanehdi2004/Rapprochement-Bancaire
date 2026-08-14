import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-category-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (category && category !== 'NON_CATEGORISE') {
      <span class="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 whitespace-nowrap">
        {{ label }}
      </span>
    } @else {
      <span class="text-xs text-gray-400">—</span>
    }
  `,
})
export class CategoryBadgeComponent {
  @Input() category = '';
  @Input() label = '';
}