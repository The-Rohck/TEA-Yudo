import { Routes } from '@angular/router';

import { InicioSesionComponent} from './inicio-sesion/inicio-sesion.component';
import { AccionesComponent } from './acciones/acciones.component';
import { SubirArchivoComponent } from './subir-archivo/subir-archivo.component';
import { VisualizarArchivosComponent } from './visualizar-archivos/visualizar-archivos.component';
import { RestablecerContrasenaComponent } from './restablecer-contrasena/restablecer-contrasena.component';

// Mapa principal de navegacion entre login, recuperacion, acciones y gestion de fichas.
export const routes: Routes = [
  { path: '', component: InicioSesionComponent, pathMatch: 'full', data: { animation: 'LoginPage' } },
  { path: 'login', component: InicioSesionComponent, data: { animation: 'LoginPage' } },
  { path: 'restablecer-contrasena', component: RestablecerContrasenaComponent, data: { animation: 'ResetPasswordPage' } },
  { path: 'confirmar-profesor', component: RestablecerContrasenaComponent, data: { animation: 'ResetPasswordPage' } },
  { path: 'actions', component: AccionesComponent, data: { animation: 'ActionsPage' } },
  { path: 'upload', component: SubirArchivoComponent, data: { animation: 'UploadPage' } },
  { path: 'view', component: VisualizarArchivosComponent, data: { animation: 'DashboardPage' } }
];
