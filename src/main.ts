import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// Arranque principal de Angular con la configuracion global de rutas y proveedores.
bootstrapApplication(AppComponent, appConfig);
