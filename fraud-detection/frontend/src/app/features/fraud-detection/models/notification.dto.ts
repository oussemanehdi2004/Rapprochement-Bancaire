/**
 * DTO pour les notifications de fraude
 * Correspond au schéma Notification dans api-spec.yaml
 */
export type NotificationType = 'critical' | 'warning' | 'info' | 'success';

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  icon?: string | null;
}
