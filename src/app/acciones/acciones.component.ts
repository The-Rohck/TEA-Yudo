import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

// Pantalla intermedia que muestra acciones disponibles segun el rol del usuario.
@Component({
  selector: 'app-acciones',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './acciones.component.html',
  styleUrl: './acciones.component.css'
})
export class AccionesComponent {
  // Por ahora el rol queda fijo en tutora; la vista de fichas aplica permisos reales.
  userRole: 'Tutora' | 'Profesor' = 'Tutora';

  get canLoadFicha(): boolean {
    return this.userRole === 'Tutora';
  }
}
