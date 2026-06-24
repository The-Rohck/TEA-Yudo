import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, TeacherInvitation } from '../api.service';

// Reutiliza la vista para recuperar contrasena y confirmar invitaciones docentes.
@Component({
  selector: 'app-restablecer-contrasena',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './restablecer-contrasena.component.html',
  styleUrl: './restablecer-contrasena.component.css'
})
export class RestablecerContrasenaComponent implements OnInit {
  solicitudEnviada = false;
  isInvitationMode = false;
  isLoadingInvitation = false;
  isSavingPassword = false;
  invitation: TeacherInvitation | null = null;
  invitationMessage = '';
  private invitationToken = '';
  private usersStorageKey = 'appUsers';

  resetForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  invitationForm = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]]
  });

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService
  ) {}

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      const token = params.get('token') || '';
      this.isInvitationMode = !!token;
      this.invitationToken = token;

      if (token) {
        this.loadInvitation(token);
      }
    });
  }

  enviarSolicitud() {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.solicitudEnviada = true;
  }

  async confirmarInvitacion() {
    if (this.invitationForm.invalid) {
      this.invitationForm.markAllAsTouched();
      return;
    }

    const password = this.invitationForm.value.password || '';
    const confirmPassword = this.invitationForm.value.confirmPassword || '';

    if (password !== confirmPassword) {
      this.invitationMessage = 'Las contrasenas no coinciden.';
      return;
    }

    this.isSavingPassword = true;
    this.invitationMessage = '';

    try {
      const teacher = await firstValueFrom(
        this.apiService.confirmTeacherInvitation(this.invitationToken, password)
      );
      this.upsertLocalUser(teacher.mail, teacher.fullName, password);
      this.invitationMessage = 'Contrasena creada correctamente. Redirigiendo al inicio de sesion...';

      setTimeout(() => {
        this.router.navigate(['/login']);
      }, 1200);
    } catch (error) {
      this.invitationMessage = this.getErrorMessage(error, 'No se pudo confirmar la invitacion.');
    } finally {
      this.isSavingPassword = false;
    }
  }

  private async loadInvitation(token: string) {
    this.isLoadingInvitation = true;
    this.invitation = null;
    this.invitationMessage = '';

    try {
      this.invitation = await firstValueFrom(this.apiService.getTeacherInvitation(token));
    } catch (error) {
      this.invitationMessage = this.getErrorMessage(error, 'No se pudo cargar la invitacion.');
    } finally {
      this.isLoadingInvitation = false;
    }
  }

  private upsertLocalUser(mail: string, fullName: string, password: string) {
    const storedUsers = localStorage.getItem(this.usersStorageKey);
    const customUsers = storedUsers ? JSON.parse(storedUsers) : [];
    const usersByName = new Map(customUsers.map((user: any) => [user.username, user]));
    const usernames = [
      mail.trim().toLowerCase(),
      ...this.getNameLoginIdentifiers(fullName)
    ];

    for (const username of usernames) {
      usersByName.set(username, {
        username,
        password,
        role: 'docente'
      });
    }

    localStorage.setItem(this.usersStorageKey, JSON.stringify(Array.from(usersByName.values())));
  }

  private getNameLoginIdentifiers(fullName: string): string[] {
    const parts = this.normalizeLoginIdentifier(fullName)
      .split(' ')
      .filter(Boolean);

    if (parts.length < 2) {
      return [];
    }

    const firstName = parts[0];
    const surnameCandidates = new Set([parts[1]]);

    if (parts.length >= 4) {
      surnameCandidates.add(parts[parts.length - 2]);
    }

    const identifiers = new Set<string>();

    for (const surname of surnameCandidates) {
      identifiers.add(`${firstName} ${surname}`);
      identifiers.add(`${firstName}.${surname}`);
      identifiers.add(`${firstName}${surname}`);
    }

    return Array.from(identifiers);
  }

  private normalizeLoginIdentifier(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9@.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && error.error?.message) {
      return error.error.message;
    }

    return fallback;
  }
}
