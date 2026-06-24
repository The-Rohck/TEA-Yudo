import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';

export interface CurrentUser {
  username: string;
  role: 'administrador' | 'docente';
  rut?: string;
  fullName?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userStorageKey = 'currentUser';
  private readonly tokenStorageKey = 'authToken';
  private readonly sessionChangedSubject = new Subject<void>();
  readonly sessionChanged$ = this.sessionChangedSubject.asObservable();

  constructor(private router: Router) {}

  getCurrentUser(): CurrentUser | null {
    const storedUser = localStorage.getItem(this.userStorageKey);

    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser) as CurrentUser;
    } catch {
      this.clearSession();
      return null;
    }
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenStorageKey);
  }

  isAuthenticated(): boolean {
    return !!this.getCurrentUser() && !!this.getToken();
  }

  hasRole(role: CurrentUser['role']): boolean {
    return this.getCurrentUser()?.role === role;
  }

  setSession(user: CurrentUser, token: string): void {
    localStorage.setItem(this.userStorageKey, JSON.stringify(user));
    localStorage.setItem(this.tokenStorageKey, token);
    localStorage.setItem('lastActivityAt', String(Date.now()));
    this.sessionChangedSubject.next();
  }

  updateCurrentUser(user: CurrentUser): void {
    localStorage.setItem(this.userStorageKey, JSON.stringify(user));
  }

  logout(redirect = true): void {
    this.clearSession();

    if (redirect) {
      this.router.navigate(['/login']);
    }
  }

  private clearSession(): void {
    localStorage.removeItem(this.userStorageKey);
    localStorage.removeItem(this.tokenStorageKey);
    localStorage.removeItem('lastActivityAt');
    this.sessionChangedSubject.next();
  }
}
