import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
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
    <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm mb-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-sm font-semibold text-gray-700">Simulateur de seuil (TRACFIN)</h3>
          <p class="text-xs text-gray-400">Ajustez les seuils pour filtrer les alertes</p>
        </div>
      </div>
      
      <div class="space-y-4">
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs font-medium text-gray-600">Seuil ML (%)</label>
            <span class="font-mono text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">
              {{ localThresholds.mlProbability }}%
            </span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="100" 
            step="0.1"
            [(ngModel)]="localThresholds.mlProbability"
            (ngModelChange)="onThresholdChange()"
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600">
        </div>
        
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs font-medium text-gray-600">Montant Anormal (€)</label>
            <span class="font-mono text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">
              {{ localThresholds.abnormalAmount }} €
            </span>
          </div>
          <input 
            type="range" 
            min="1000" 
            max="50000" 
            step="1000"
            [(ngModel)]="localThresholds.abnormalAmount"
            (ngModelChange)="onThresholdChange()"
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600">
        </div>
      </div>
    </div>
  `
})
export class ThresholdSimulatorComponent implements OnInit {
  @Input() thresholds: SimulationThresholds = { mlProbability: 50.0, abnormalAmount: 10000 };
  @Output() thresholdChange = new EventEmitter<SimulationThresholds>();

  localThresholds: SimulationThresholds = { mlProbability: 50.0, abnormalAmount: 10000 };

  ngOnInit() {
    this.localThresholds = { ...this.thresholds };
  }

  onThresholdChange() {
    this.thresholdChange.emit(this.localThresholds);
  }
}
