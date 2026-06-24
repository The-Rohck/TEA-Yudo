import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { InactivityService } from './inactivity.service';

// Componente raiz: solo aloja el router para renderizar cada pantalla de la app.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  constructor(private inactivityService: InactivityService) {}

  ngOnInit(): void {
    this.inactivityService.start();
  }
}
