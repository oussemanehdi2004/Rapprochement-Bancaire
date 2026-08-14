import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface SimulationThresholds {
  mlProbability: number;
  abnormalAmount: number;
}

@Component({
  selector: 'app-threshold-simulator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bg-white rounded-xl border border-indigo-100 p-5 shadow-sm mb-6 relative overflow-hidden">
      <!-- Décoration visuelle -->
      <div class="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-indigo-50 rounded-full opacity-50 pointer-events-none"></div>
      
      <div class="flex items-center justify-between mb-5 relative z-10">
        <div>
          <h3 class="text-base font-semibold text-gray-800 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            Simulateur de Seuils (What-If)
          </h3>
          <p class="text-xs text-gray-500 mt-1">Ajustez les paramètres pour visualiser l'impact en temps réel sur les alertes.</p>
        </div>
        <button (click)="reset()" class="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-md font-medium transition-colors">
          Rétablir les valeurs par défaut
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
        <!-- Curseur IA -->
        <div class="space-y-3">
          <div class="flex justify-between items-end">
            <label class="block text-sm font-medium text-gray-700">
              Seuil de détection IA (XGBoost)
            </label>
            <span class="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
              {{ thresholds.mlProbability }}%
            </span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="100" 
            [(ngModel)]="thresholds.mlProbability" 
            (ngModelChange)="onChange()" 
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600">
          <div class="flex justify-between text-[10px] text-gray-400 font-medium uppercase tracking-wider">
            <span>Plus permissif (0%)</span>
            <span>Optimal (47.58%)</span>
            <span>Plus strict (100%)</span>
          </div>
        </div>

        <!-- Input Montant -->
        <div class="space-y-3">
           <div class="flex justify-between items-end">
            <label class="block text-sm font-medium text-gray-700">
              Seuil de Montant Aberrant
            </label>
            <span class="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
              Actuel : {{ defaultThresholds.abnormalAmount }}
            </span>
          </div>
          <div class="relative rounded-md shadow-sm">
            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <span class="text-gray-500 sm:text-sm">€</span>
            </div>
            <input 
              type="number" 
              [(ngModel)]="thresholds.abnormalAmount" 
              (ngModelChange)="onChange()" 
              class="block w-full rounded-md border-0 py-1.5 pl-7 pr-12 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6">
          </div>
        </div>
      </div>
    </div>
  `
})
export class ThresholdSimulatorComponent implements OnInit {
  @Input() defaultThresholds: SimulationThresholds = { mlProbability: 47.58, abnormalAmount: 10000 };
  @Output() simulationChange = new EventEmitter<SimulationThresholds>();

  thresholds: SimulationThresholds = { mlProbability: 0, abnormalAmount: 0 };

  ngOnInit(): void {
    this.reset();
  }

  onChange(): void {
    this.simulationChange.emit({ ...this.thresholds });
  }

  reset(): void {
    this.thresholds = { ...this.defaultThresholds };
    this.onChange();
  }
}