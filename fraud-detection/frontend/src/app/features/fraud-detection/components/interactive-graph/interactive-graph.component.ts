import { Component, ElementRef, Input, OnChanges, OnDestroy, AfterViewInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Network, DataSet, Node, Edge, Options } from 'vis-network/standalone';

export interface GraphNode {
  id: string;
  label: string;
  title?: string;
  color?: string;
  size?: number;
  font?: { size: number; color: string };
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  title?: string;
  color?: string;
  width?: number;
}

@Component({
  selector: 'app-interactive-graph',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative w-full h-full">
      @if (loading) {
        <div class="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-xl">
          <div class="inline-block h-8 w-8 rounded-full border-3 border-slate-300 border-r-slate-700 animate-spin"></div>
        </div>
      } @else if (nodes.length === 0) {
        <div class="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-xl">
          <p class="text-gray-400 text-sm">Aucune donnée de graphe disponible</p>
        </div>
      }
      <div #networkContainer class="w-full h-full"></div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
  `]
})
export class InteractiveGraphComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() nodes: GraphNode[] = [];
  @Input() edges: GraphEdge[] = [];
  @Input() loading = false;
  @Input() centerNode?: string;

  @ViewChild('networkContainer') networkContainerRef?: ElementRef<HTMLDivElement>;

  private network?: Network;
  private nodesDataSet?: DataSet<Node>;
  private edgesDataSet?: DataSet<Edge>;

  ngAfterViewInit(): void {
    if (typeof window !== 'undefined' && this.networkContainerRef) {
      this.initializeNetwork();
    }
  }

  ngOnChanges(): void {
    if (this.network && typeof window !== 'undefined') {
      this.updateNetwork();
    }
  }

  ngOnDestroy(): void {
    this.network?.destroy();
  }

  private initializeNetwork(): void {
    if (!this.networkContainerRef) return;

    const container = this.networkContainerRef.nativeElement;
    
    // Initialize data sets
    this.nodesDataSet = new DataSet<Node>(this.convertNodes());
    this.edgesDataSet = new DataSet<Edge>(this.convertEdges());

    // Network configuration
    const options: Options = {
      nodes: {
        shape: 'dot',
        size: 20,
        font: {
          size: 14,
          color: '#374151'
        },
        borderWidth: 2,
        shadow: true
      },
      edges: {
        width: 2,
        color: {
          color: '#94a3b8',
          highlight: '#3b82f6',
          hover: '#3b82f6'
        },
        smooth: {
          type: 'continuous'
        }
      },
      physics: {
        stabilization: true,
        barnesHut: {
          gravitationalConstant: -2000,
          springConstant: 0.04,
          springLength: 95
        }
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        zoomView: true,
        dragView: true
      }
    };

    // Create network
    this.network = new Network(container, {
      nodes: this.nodesDataSet,
      edges: this.edgesDataSet
    }, options);

    // Center on specified node if provided
    if (this.centerNode) {
      this.network.once('stabilizationIterationsDone', () => {
        this.network?.focus(this.centerNode, {
          scale: 1.2,
          animation: true
        });
      });
    }
  }

  private updateNetwork(): void {
    if (!this.nodesDataSet || !this.edgesDataSet) return;

    this.nodesDataSet.clear();
    this.edgesDataSet.clear();

    this.nodesDataSet.add(this.convertNodes());
    this.edgesDataSet.add(this.convertEdges());

    if (this.centerNode) {
      this.network?.focus(this.centerNode, {
        scale: 1.2,
        animation: true
      });
    }
  }

  private convertNodes(): Node[] {
    return this.nodes.map(node => ({
      id: node.id,
      label: node.label,
      title: node.title || node.label,
      color: node.color || '#3b82f6',
      size: node.size || 20,
      font: node.font || { size: 14, color: '#374151' }
    }));
  }

  private convertEdges(): Edge[] {
    return this.edges.map(edge => ({
      from: edge.from,
      to: edge.to,
      label: edge.label,
      title: edge.title,
      color: edge.color || '#94a3b8',
      width: edge.width || 2
    }));
  }
}