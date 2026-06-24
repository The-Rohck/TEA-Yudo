import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, NgZone, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class InactivityService implements OnDestroy {
  private readonly inactivityLimitMs = 2 * 60 * 1000;
  private readonly lastActivityStorageKey = 'lastActivityAt';
  private readonly activityEvents = ['click', 'keydown', 'scroll', 'touchstart'];
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private isStarted = false;
  private sessionSubscription: Subscription | null = null;

  private readonly activityHandler = () => this.registerActivity();
  private readonly storageHandler = (event: StorageEvent) => {
    if (event.key === 'authToken' && !event.newValue) {
      this.ngZone.run(() => this.authService.logout());
      return;
    }

    if (event.key === this.lastActivityStorageKey || event.key === 'authToken') {
      this.scheduleLogout();
    }
  };

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private authService: AuthService,
    private ngZone: NgZone
  ) {}

  start(): void {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    this.sessionSubscription = this.authService.sessionChanged$.subscribe(() => this.scheduleLogout());
    this.ngZone.runOutsideAngular(() => {
      for (const eventName of this.activityEvents) {
        this.document.addEventListener(eventName, this.activityHandler, { passive: true });
      }

      window.addEventListener('storage', this.storageHandler);
    });

    if (this.authService.isAuthenticated()) {
      const lastActivity = this.getLastActivity();

      if (!lastActivity) {
        this.saveLastActivity(Date.now());
      }
    }

    this.scheduleLogout();
  }

  ngOnDestroy(): void {
    for (const eventName of this.activityEvents) {
      this.document.removeEventListener(eventName, this.activityHandler);
    }

    window.removeEventListener('storage', this.storageHandler);
    this.sessionSubscription?.unsubscribe();
    this.clearTimer();
  }

  private registerActivity(): void {
    if (!this.authService.isAuthenticated()) {
      this.clearTimer();
      return;
    }

    this.saveLastActivity(Date.now());
    this.scheduleLogout();
  }

  private scheduleLogout(): void {
    this.clearTimer();

    if (!this.authService.isAuthenticated()) {
      return;
    }

    const elapsed = Date.now() - this.getLastActivity();
    const remaining = this.inactivityLimitMs - elapsed;

    if (remaining <= 0) {
      this.expireSession();
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.timeoutId = setTimeout(() => this.expireSession(), remaining);
    });
  }

  private expireSession(): void {
    this.ngZone.run(() => {
      localStorage.removeItem(this.lastActivityStorageKey);
      this.authService.logout();
    });
  }

  private getLastActivity(): number {
    return Number(localStorage.getItem(this.lastActivityStorageKey) || 0);
  }

  private saveLastActivity(timestamp: number): void {
    localStorage.setItem(this.lastActivityStorageKey, String(timestamp));
  }

  private clearTimer(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
