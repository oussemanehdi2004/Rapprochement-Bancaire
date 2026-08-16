import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FraudAlert } from '../models/fraud-alert.model';

@Injectable({
  providedIn: 'root'
})
export class PdfExportService {
  
  exportAlertsToPdf(alerts: FraudAlert[], title: string = 'Rapport de Détection de Fraude'): void {
    const doc = new jsPDF();
    
    // Titre du document
    doc.setFontSize(18);
    doc.setTextColor(59, 130, 246); // Bleu
    doc.text(title, 14, 22);
    
    // Date du rapport
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Généré le: ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 14, 30);
    
    // Statistiques
    const totalAlerts = alerts.length;
    const criticalAlerts = alerts.filter(a => (a.fraudScore ?? 0) >= 85).length;
    const highAlerts = alerts.filter(a => (a.fraudScore ?? 0) >= 70 && (a.fraudScore ?? 0) < 85).length;
    const totalAmount = alerts.reduce((sum, a) => sum + (a.amount || 0), 0);
    
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Statistiques', 14, 45);
    
    doc.setFontSize(10);
    doc.text(`Total alertes: ${totalAlerts}`, 14, 52);
    doc.text(`Alertes critiques: ${criticalAlerts}`, 14, 58);
    doc.text(`Alertes élevées: ${highAlerts}`, 14, 64);
    doc.text(`Montant total à risque: ${totalAmount.toLocaleString('fr-FR')} €`, 14, 70);
    
    // Tableau des alertes
    const tableData = alerts.map(alert => [
      alert.transactionId || alert.id || 'N/A',
      alert.description || 'N/A',
      alert.category || 'NON_CATEGORISE',
      `${alert.fraudScore ?? 0}%`,
      `${(alert.amount || 0).toLocaleString('fr-FR')} €`,
      (alert.fraudScore ?? 0) >= 70 ? '⚠️ FRAUDE' : '✓ OK',
      alert.date || 'N/A'
    ]);
    
    autoTable(doc, {
      startY: 80,
      head: [['ID Transaction', 'Description', 'Catégorie', 'Score', 'Montant', 'Statut', 'Date']],
      body: tableData,
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 25 }, // ID
        1: { cellWidth: 40 }, // Description
        2: { cellWidth: 25 }, // Catégorie
        3: { cellWidth: 15 }, // Score
        4: { cellWidth: 20 }, // Montant
        5: { cellWidth: 15 }, // Statut
        6: { cellWidth: 25 }, // Date
      },
      didDrawPage: (data) => {
        // Numéro de page
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `Page ${data.pageNumber}`,
          data.settings.margin.left,
          doc.internal.pageSize.height - 10
        );
      }
    });
    
    // Sauvegarder le PDF
    doc.save(`rapport-fraude-${new Date().toISOString().split('T')[0]}.pdf`);
  }
  
  exportSummaryToPdf(summary: {
    totalAlerts: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    totalAmount: number;
    fraudRate: number;
  }, title: string = 'Synthèse des Alertes'): void {
    const doc = new jsPDF();
    
    // Titre
    doc.setFontSize(18);
    doc.setTextColor(59, 130, 246);
    doc.text(title, 14, 22);
    
    // Date
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Généré le: ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 14, 30);
    
    // Tableau de synthèse
    const tableData = [
      ['Total alertes', summary.totalAlerts],
      ['Alertes critiques', summary.critical],
      ['Alertes élevées', summary.high],
      ['Alertes moyennes', summary.medium],
      ['Alertes faibles', summary.low],
      ['Montant total à risque', `${summary.totalAmount.toLocaleString('fr-FR')} €`],
      ['Taux de fraude', `${summary.fraudRate.toFixed(2)}%`]
    ];
    
    autoTable(doc, {
      startY: 40,
      head: [['Métrique', 'Valeur']],
      body: tableData,
      styles: {
        fontSize: 10,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 60, fontStyle: 'bold' },
        1: { cellWidth: 60 }
      }
    });
    
    doc.save(`synthese-alertes-${new Date().toISOString().split('T')[0]}.pdf`);
  }
}