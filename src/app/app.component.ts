import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

// Componente raiz: solo aloja el router para renderizar cada pantalla de la app.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {}
