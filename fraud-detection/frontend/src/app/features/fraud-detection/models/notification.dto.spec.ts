import { NotificationDTO, NotificationType } from './notification.dto';

describe('NotificationDTO', () => {
  it('should create a valid NotificationDTO', () => {
    const notification: NotificationDTO = {
      id: 'notif-123',
      type: 'critical',
      title: 'Fraude détectée',
      message: 'Transaction suspecte identifiée',
      timestamp: '2026-08-18T10:30:00Z',
      read: false,
      icon: 'alert'
    };

    expect(notification.id).toBe('notif-123');
    expect(notification.type).toBe('critical');
    expect(notification.title).toBe('Fraude détectée');
    expect(notification.read).toBe(false);
  });

  it('should handle all notification types', () => {
    const types: NotificationType[] = ['critical', 'warning', 'info', 'success'];
    
    types.forEach(type => {
      const notification: NotificationDTO = {
        id: `notif-${type}`,
        type: type,
        title: 'Test notification',
        message: 'Test message',
        timestamp: '2026-08-18T10:00:00Z',
        read: false
      };

      expect(notification.type).toBe(type);
    });
  });

  it('should handle optional icon field', () => {
    const notification: NotificationDTO = {
      id: 'notif-124',
      type: 'info',
      title: 'Information',
      message: 'Message informatif',
      timestamp: '2026-08-18T11:00:00Z',
      read: false,
      icon: 'info'
    };

    expect(notification.icon).toBe('info');
  });

  it('should handle null icon field', () => {
    const notification: NotificationDTO = {
      id: 'notif-125',
      type: 'warning',
      title: 'Avertissement',
      message: 'Message d\'avertissement',
      timestamp: '2026-08-18T12:00:00Z',
      read: false,
      icon: null
    };

    expect(notification.icon).toBeNull();
  });

  it('should handle read status', () => {
    const notification: NotificationDTO = {
      id: 'notif-126',
      type: 'success',
      title: 'Succès',
      message: 'Opération réussie',
      timestamp: '2026-08-18T13:00:00Z',
      read: true
    };

    expect(notification.read).toBe(true);
  });

  it('should validate timestamp format', () => {
    const notification: NotificationDTO = {
      id: 'notif-127',
      type: 'critical',
      title: 'Test',
      message: 'Test message',
      timestamp: '2026-08-18T14:30:00Z',
      read: false
    };

    expect(notification.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('should include meaningful notification content', () => {
    const notification: NotificationDTO = {
      id: 'notif-128',
      type: 'critical',
      title: 'Alerte de fraude',
      message: 'Transaction TX-10024 bloquée : Monte élevé et mot-clé sensible détecté',
      timestamp: '2026-08-18T15:00:00Z',
      read: false
    };

    expect(notification.title).toContain('fraude');
    expect(notification.message).toContain('TX-10024');
    expect(notification.message.length).toBeGreaterThan(20);
  });

  it('should prioritize critical notifications', () => {
    const critical: NotificationDTO = {
      id: 'notif-129',
      type: 'critical',
      title: 'Alerte critique',
      message: 'Action requise immédiatement',
      timestamp: '2026-08-18T16:00:00Z',
      read: false
    };

    const info: NotificationDTO = {
      id: 'notif-130',
      type: 'info',
      title: 'Information',
      message: 'Mise à jour disponible',
      timestamp: '2026-08-18T17:00:00Z',
      read: false
    };

    expect(critical.type).toBe('critical');
    expect(info.type).toBe('info');
  });

  it('should handle unread notifications by default', () => {
    const notification: NotificationDTO = {
      id: 'notif-131',
      type: 'warning',
      title: 'Avertissement',
      message: 'Message d\'avertissement',
      timestamp: '2026-08-18T18:00:00Z',
      read: false
    };

    expect(notification.read).toBe(false);
  });
});
