import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

// Contratos usados por el frontend para tipar las respuestas del backend.
export interface Carrera {
  idCodigo: string;
  nombre: string;
}

export interface Estudiante {
  rut: string;
  nombre: string;
  anioIngreso: number;
  carreraId: string;
  carrera?: string;
}

export interface Asignatura {
  idCodigo: string;
  nombre: string;
  nombreDocente: string;
}

export interface Diagnostico {
  idCodigo: string;
  nombre: string;
  contextoDiagnostico: string;
  ajustesPedagogicos: string;
}

export interface Ficha {
  idCodigo: string;
  rutEstudiante: string;
  nombreEstudiante: string;
  carreraEstudiante: string;
  carrera: string;
  diagnosticoId: string;
  diagnostico: string;
  fechaActualizacion: string;
  pdf: string;
}

export interface Teacher {
  fullName: string;
  rut: string;
  mail: string;
  courses?: string[];
  invitation?: {
    sent: boolean;
    detail?: string | null;
  };
}

export interface TeacherInvitation {
  fullName: string;
  mail: string;
}

export interface ConfirmedTeacher extends TeacherInvitation {
  rut: string;
  role: 'docente';
}

export interface AppCourse {
  idCodigo?: string;
  nombre: string;
  profesorRut?: string | null;
}

export interface StudentCourseAssociation {
  rut: string;
  courses: string[];
}

export interface EmailNotification {
  id: number;
  fecha: string;
  curso: string;
  remitente: string;
  destinatario: string | null;
  estado: string;
  detalle: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  // Punto unico de configuracion para todas las llamadas HTTP del frontend.
  private readonly apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  getCarreras(): Observable<Carrera[]> {
    return this.http.get<Carrera[]>(`${this.apiUrl}/carreras`);
  }

  getEstudiantes(): Observable<Estudiante[]> {
    return this.http.get<Estudiante[]>(`${this.apiUrl}/estudiantes`);
  }

  createEstudiante(estudiante: Estudiante): Observable<Estudiante> {
    return this.http.post<Estudiante>(`${this.apiUrl}/estudiantes`, estudiante);
  }

  getAsignaturas(): Observable<Asignatura[]> {
    return this.http.get<Asignatura[]>(`${this.apiUrl}/asignaturas`);
  }

  getDiagnosticos(): Observable<Diagnostico[]> {
    return this.http.get<Diagnostico[]>(`${this.apiUrl}/diagnosticos`);
  }

  getFichas(): Observable<Ficha[]> {
    return this.http.get<Ficha[]>(`${this.apiUrl}/fichas`);
  }

  getAppTeachers(): Observable<Teacher[]> {
    return this.http.get<Teacher[]>(`${this.apiUrl}/app/profesores`);
  }

  // Endpoints propios de la aplicacion para gestionar profesores, cursos y asociaciones.
  createAppTeacher(teacher: Teacher): Observable<Teacher> {
    return this.http.post<Teacher>(`${this.apiUrl}/app/profesores`, teacher);
  }

  getTeacherInvitation(token: string): Observable<TeacherInvitation> {
    return this.http.get<TeacherInvitation>(
      `${this.apiUrl}/app/profesores/invitacion/${encodeURIComponent(token)}`
    );
  }

  confirmTeacherInvitation(token: string, password: string): Observable<ConfirmedTeacher> {
    return this.http.post<ConfirmedTeacher>(
      `${this.apiUrl}/app/profesores/confirmar-invitacion`,
      { token, password }
    );
  }

  deleteAppTeacher(rut: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/app/profesores/${encodeURIComponent(rut)}`);
  }

  getAppCourses(): Observable<AppCourse[]> {
    return this.http.get<AppCourse[]>(`${this.apiUrl}/app/cursos`);
  }

  getEmailNotifications(): Observable<EmailNotification[]> {
    return this.http.get<EmailNotification[]>(`${this.apiUrl}/app/correos`);
  }

  createAppCourse(course: AppCourse): Observable<AppCourse> {
    return this.http.post<AppCourse>(`${this.apiUrl}/app/cursos`, course);
  }

  updateAppCourseTeacher(nombre: string, profesorRut: string | null): Observable<AppCourse> {
    // encodeURIComponent permite enviar cursos con espacios o caracteres especiales en la URL.
    return this.http.put<AppCourse>(
      `${this.apiUrl}/app/cursos/${encodeURIComponent(nombre)}/profesor`,
      { profesorRut }
    );
  }

  deleteAppCourse(nombre: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/app/cursos/${encodeURIComponent(nombre)}`);
  }

  getStudentCourseAssociations(): Observable<StudentCourseAssociation[]> {
    return this.http.get<StudentCourseAssociation[]>(`${this.apiUrl}/app/estudiantes/cursos`);
  }

  updateStudentCourses(
    rut: string,
    nombre: string,
    courses: string[],
    files: { name: string; course: string }[]
  ): Observable<StudentCourseAssociation> {
    return this.http.put<StudentCourseAssociation>(
      `${this.apiUrl}/app/estudiantes/${encodeURIComponent(rut)}/cursos`,
      { nombre, courses, files }
    );
  }
}
