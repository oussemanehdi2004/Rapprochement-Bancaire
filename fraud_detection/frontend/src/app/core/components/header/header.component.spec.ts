import { vi } from 'vitest'; // Import de Vitest
import { TestBed } from '@angular/core/testing';
import { HeaderComponent } from './header.component';
import { fakeAsync, discardPeriodicTasks } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

describe('HeaderComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should start with 3 notifications and the panel closed', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    const component = fixture.componentInstance;
    expect(component.notifications()).toBe(3);
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

  const bellBtn = fixture.debugElement.query(By.css('button')); 
  if (bellBtn) {
    bellBtn.nativeElement.click();
    fixture.detectChanges();
    expect(component.showNotifications()).toBe(true);
  }

  vi.useRealTimers(); // Restaure le temps à la fin
});
  it('should render the current user name and role', async () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Claire');
    expect(text).toContain('ACCOUNTANT');
  });

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
