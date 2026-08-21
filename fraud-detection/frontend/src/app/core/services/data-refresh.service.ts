import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DataRefreshService {
  private refreshSubject = new Subject<void>();
  /** Observable émis à chaque fois que des données sont ingérées (multi-banking ou fraud CSV) */
  refresh$: Observable<void> = this.refreshSubject.asObservable();

  /** Déclenche un rafraîchissement global des pages qui écoutent (Dashboard, Transactions, Rapports, Graphe) */
  trigger(): void {
    this.refreshSubject.next();
  }
}
