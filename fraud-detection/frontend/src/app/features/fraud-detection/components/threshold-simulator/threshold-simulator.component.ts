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
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="h-1 w-full bg-gradient-to-r from-indigo-600 to-violet-600"></div>
      <div class="p-4 sm:p-5">
        <div class="flex items-start justify-between gap-3 mb-5">
          <div class="flex items-start gap-3">
            <span class="h-9 w-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 text-sm shrink-0">⚙️</span>
            <div>
              <h3 class="text-[13px] font-semibold text-slate-900 tracking-tight">Simulateur de seuil — TRACFIN</h3>
              <p class="text-[11px] text-slate-500 mt-0.5">Ajustez les seuils pour filtrer les alertes en temps réel</p>
            </div>
          </div>
          <span class="hidden sm:inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[10px] font-semibold tracking-widest uppercase text-amber-700">What-If</span>
        </div>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
            <div class="flex items-center justify-between mb-2.5">
              <label class="text-[11px] font-semibold tracking-widest uppercase text-slate-500">Seuil ML</label>
              <span class="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-bold tabular-nums text-indigo-700">
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
              class="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600">
            <div class="flex justify-between text-[10px] font-medium text-slate-400 mt-1.5">
              <span>Permissif</span><span>Strict</span>
            </div>
          </div>
          
          <div class="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
            <div class="flex items-center justify-between mb-2.5">
              <label class="text-[11px] font-semibold tracking-widest uppercase text-slate-500">Montant Anormal</label>
              <span class="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold tabular-nums text-emerald-700">
                {{ localThresholds.abnormalAmount | number:'1.0-0' }} €
              </span>
            </div>
            <input 
              type="range" 
              min="1000" 
              max="50000" 
              step="1000"
              [(ngModel)]="localThresholds.abnormalAmount"
              (ngModelChange)="onThresholdChange()"
              class="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-emerald-600">
            <div class="flex justify-between text-[10px] font-medium text-slate-400 mt-1.5">
              <span>1 000 €</span><span>50 000 €</span>
            </div>
          </div>
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
