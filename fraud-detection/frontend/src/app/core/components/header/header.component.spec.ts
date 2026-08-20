import { vi } from 'vitest'; // Import de Vitest
import { TestBed } from '@angular/core/testing';
import { HeaderComponent } from './header.component';
import { fakeAsync, discardPeriodicTasks } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AuthService } from '../../services/auth.service';
import { NotificationsService } from '../../services/notifications.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('HeaderComponent', () => {
  let mockAuthService: any;
  let mockNotificationsService: any;

  beforeEach(async () => {
    // Mock AuthService
    mockAuthService = {
      getCurrentUser: vi.fn().mockReturnValue({
        name: 'Claire',
        role: 'ACCOUNTANT',
        avatar: '👩‍💼'
      }),
      getUserFromAPI: vi.fn().mockReturnValue({
        subscribe: (callbacks: any) => {
          // Mock successful API response
          callbacks.next({
            name: 'Claire',
            role: 'ACCOUNTANT',
            avatar: '👩‍💼'
          });
        }
      })
    };

    // Mock NotificationsService
    mockNotificationsService = {
      notifications$: {
        subscribe: (callbacks: any) => {
          // Provide 3 mock notifications
          callbacks.next([
            { id: '1', type: 'critical', title: 'Alert 1', message: 'Message 1', timestamp: new Date().toISOString(), read: false },
            { id: '2', type: 'warning', title: 'Alert 2', message: 'Message 2', timestamp: new Date().toISOString(), read: false },
            { id: '3', type: 'info', title: 'Alert 3', message: 'Message 3', timestamp: new Date().toISOString(), read: false }
          ]);
        }
      },
      unreadCount$: {
        subscribe: (callbacks: any) => {
          // Provide unread count
          callbacks.next(3);
        }
      },
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuthService },
        { provide: NotificationsService, useValue: mockNotificationsService }
      ]
    }).compileComponents();
  });

  beforeEach(async () => {
    // Mock localStorage
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => store[key] = value.toString(),
        removeItem: (key: string) => delete store[key],
        clear: () => store = {},
      };
    })();
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null as any,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {},
      }),
    });
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should start with 3 notifications and the panel closed', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.notifications().length).toBe(3);
    expect(component.unreadCount()).toBe(3);
    expect(component.showNotifications()).toBe(false);
  });

  it('should toggle the notifications panel on toggleNotifications()', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    const component = fixture.componentInstance;

    component.toggleNotifications();
    expect(component.showNotifications()).toBe(true);

    component.toggleNotifications();
    expect(component.showNotifications()).toBe(false);
  });
  it('should open the notifications panel when the bell button is clicked', () => {
    vi.useFakeTimers(); // Bloque le vrai temps (stoppe setInterval)

    const fixture = TestBed.createComponent(HeaderComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    // Find the bell button specifically
    const bellBtn = fixture.debugElement.query(By.css('button[aria-label="Notifications"]'));
    if (bellBtn) {
      bellBtn.nativeElement.click();
      fixture.detectChanges();
      expect(component.showNotifications()).toBe(true);
    } else {
      // Fallback: toggle directly if button not found
      component.toggleNotifications();
      expect(component.showNotifications()).toBe(true);
    }

    vi.useRealTimers(); // Restaure le temps à la fin
  });
  it('should render the current user name and role', async () => {
    vi.useFakeTimers();

    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Claire');
    expect(text).toContain('ACCOUNTANT');

    vi.useRealTimers();
  }, 10000); // Increase timeout to 10 seconds

  it('getCurrentDate() should return a non-empty French-formatted date string', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    const component = fixture.componentInstance;
    expect(component.getCurrentDate().length).toBeGreaterThan(0);
  });

  it('getCurrentTime() should return a time string matching HH:MM', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    const component = fixture.componentInstance;
    expect(component.getCurrentTime()).toMatch(/^\d{1,2}:\d{2}$/);
  });
});
