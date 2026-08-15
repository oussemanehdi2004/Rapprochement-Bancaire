import { Component, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface SimulationThresholds {
  mlProbability: number;
  abnormalAmount: number;
}

@Component({
  selector: 'app-threshold-simulator',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="threshold-simulator">
      <h3>Simulateur de Seuils</h3>
      <div class="simulator-controls">
        <div class="control-group">
          <label for="ml-threshold">Seuil ML (%)</label>
          <input 
            id="ml-threshold"
            type="number" 
            [(ngModel)]="localThresholds().mlProbability"
            (ngModelChange)="onThresholdChange()"
            min="0" 
            max="100" 
            step="0.1"
          />
        </div>
        <div class="control-group">
          <label for="amount-threshold">Montant Anormal (€)</label>
          <input 
            id="amount-threshold"
            type="number" 
            [(ngModel)]="localThresholds().abnormalAmount"
            (ngModelChange)="onThresholdChange()"
            min="0" 
            step="100"
          />
        </div>
      </div>
      <div class="simulator-info">
        <p>Seuil ML actuel: <strong>{{ localThresholds().mlProbability }}%</strong></p>
        <p>Montant seuil: <strong>{{ localThresholds().abnormalAmount }}€</strong></p>
      </div>
    </div>
  `,
  styles: [`
    .threshold-simulator {
      padding: 1rem;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background: #f9f9f9;
    }
    .threshold-simulator h3 {
      margin-top: 0;
      color: #333;
    }
    .simulator-controls {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .control-group {
      flex: 1;
    }
    .control-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #555;
    }
    .control-group input {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 1rem;
    }
    .simulator-info p {
      margin: 0.25rem 0;
      color: #666;
    }
    .simulator-info strong {
      color: #1976d2;
    }
  `]
})
export class ThresholdSimulatorComponent implements OnInit {
  thresholds = input.required<SimulationThresholds>();
  thresholdChange = output<SimulationThresholds>();

  localThresholds = signal<SimulationThresholds>({ mlProbability: 50.0, abnormalAmount: 10000 });

  ngOnInit(): void {
    // Initialize local thresholds from input
    this.localThresholds.set(this.thresholds());
  }

  onThresholdChange(): void {
    this.thresholdChange.emit(this.localThresholds());
  }
}
