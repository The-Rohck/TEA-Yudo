import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../auth.service';

// Pantalla intermedia que muestra acciones disponibles segun el rol del usuario.
@Component({
  selector: 'app-acciones',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './acciones.component.html',
  styleUrl: './acciones.component.css'
})
export class AccionesComponent {
  constructor(private authService: AuthService) {}

  get canLoadFicha(): boolean {
    return this.authService.hasRole('administrador');
  }
}
