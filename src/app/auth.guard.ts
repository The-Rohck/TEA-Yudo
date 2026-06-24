import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService, CurrentUser } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isAuthenticated()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const roleGuard: CanActivateFn = route => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const allowedRoles = (route.data?.['roles'] || []) as CurrentUser['role'][];

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  return allowedRoles.length === 0 || allowedRoles.some(role => authService.hasRole(role))
    ? true
    : router.createUrlTree(['/view']);
};
