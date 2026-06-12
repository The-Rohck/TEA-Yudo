import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

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
  private usersStorageKey = 'appUsers';

  // Usuarios base para pruebas locales; los docentes invitados se agregan en localStorage.
  private defaultUsers = [
    { username: 'tutora', password: '123456', role: 'administrador' },
    { username: 'docente', password: '123456', role: 'docente' }
  ];

  loginForm = this.fb.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  constructor(private fb: FormBuilder, private router: Router) {}

  private getUsers() {
    const storedUsers = localStorage.getItem(this.usersStorageKey);
    const customUsers = storedUsers ? JSON.parse(storedUsers) : [];
    const usersByName = new Map(this.defaultUsers.map(user => [user.username, user]));

    for (const user of customUsers) {
      usersByName.set(user.username.trim().toLowerCase(), {
        ...user,
        username: user.username.trim().toLowerCase()
      });
    }

    return Array.from(usersByName.values());
  }

  iniciarSesion() {
    if (this.loginForm.valid) {
      const username = this.loginForm.value.username?.trim().toLowerCase();
      const password = this.loginForm.value.password;
      const user = this.getUsers().find(item => item.username === username && item.password === password);

      if (user) {
        localStorage.setItem('currentUser', JSON.stringify({
          username: user.username,
          role: user.role
        }));

        this.loginError = '';
        this.isLoggingIn = true;
        setTimeout(() => {
          this.router.navigate(['/view']);
        }, 800);
      } else {
        this.loginError = 'Usuario o contrasena incorrectos.';
      }
    } else {
      this.loginForm.markAllAsTouched();
    }
  }
}
