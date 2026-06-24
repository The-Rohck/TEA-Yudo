import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../api.service';
import { AuthService } from '../auth.service';

// Maneja el inicio de sesion local para administradores y docentes registrados.
@Component({
  selector: 'app-inicio-sesion',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './inicio-sesion.component.html',
  styleUrl: './inicio-sesion.component.css'
})
export class InicioSesionComponent {
  isLoggingIn = false;
  loginError = '';
  loginForm = this.fb.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private authService: AuthService
  ) {}

  async iniciarSesion() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const username = this.loginForm.value.username?.trim().toLowerCase() || '';
    const password = this.loginForm.value.password || '';
    this.loginError = '';
    this.isLoggingIn = true;

    try {
      const authenticatedUser = await firstValueFrom(this.apiService.login(username, password));
      this.authService.setSession({
        username: authenticatedUser.username,
        role: authenticatedUser.role,
        rut: authenticatedUser.rut,
        fullName: authenticatedUser.fullName
      }, authenticatedUser.token);
      setTimeout(() => {
        this.router.navigate(['/view']);
      }, 800);
    } catch (error) {
      this.isLoggingIn = false;
      this.loginError = this.getErrorMessage(error, 'Usuario o contrasena incorrectos.');
    }
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && error.status !== 401 && error.error?.message) {
      return error.error.message;
    }

    return fallback;
  }
}
