import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api.service';
import { FileServiceService } from '../file-service.service';

// Pantalla clasica de carga de fichas PDF asociadas a un curso.
@Component({
  selector: 'app-subir-archivo',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './subir-archivo.component.html',
  styleUrl: './subir-archivo.component.css'
})
export class SubirArchivoComponent {
  // Estado del formulario de subida clasico; la vista de visualizacion usa un modal propio.
  selectedFiles: File[] = [];
  courseName: string = '';
  courses: string[] = [];
  uploadMessage: string = '';
  private coursesStorageKey = 'appCourses';

  constructor(
    private fileService: FileServiceService,
    private apiService: ApiService
  ) {
    this.loadCourses();
  }

  async loadCourses() {
    let savedCourses: string[] = [];

    try {
      // Se prioriza la API y se usa localStorage solo como respaldo cuando el backend falla.
      const apiCourses = await firstValueFrom(this.apiService.getAppCourses());
      savedCourses = apiCourses.map(course => course.nombre);
      localStorage.setItem(this.coursesStorageKey, JSON.stringify(savedCourses));
      await this.fileService.loadFilesFromApi();
    } catch (error) {
      const storedCourses = localStorage.getItem(this.coursesStorageKey);
      savedCourses = storedCourses ? JSON.parse(storedCourses) : [];
    }

    const fileCourses = this.fileService.getFiles().map(file => file.course || 'Sin curso');
    // Combina cursos creados explicitamente con cursos ya presentes en fichas guardadas.
    this.courses = Array.from(new Set([...savedCourses, ...fileCourses])).sort();
    this.courseName = this.courses[0] || '';
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);

    if (files.length === 0) {
      this.selectedFiles = [];
      this.uploadMessage = '';
      return;
    }

    const pdfFiles = files.filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));

    // Se bloquean cargas mixtas para evitar guardar archivos que luego PDF.js no pueda leer.
    if (pdfFiles.length === files.length) {
      this.selectedFiles = pdfFiles;
      this.uploadMessage = `${pdfFiles.length} archivo(s) PDF seleccionado(s).`;
    } else {
      this.selectedFiles = [];
      this.uploadMessage = 'Por favor, selecciona solo archivos PDF validos.';
    }
  }

  async uploadFile() {
    if (this.selectedFiles.length === 0 || !this.courseName.trim()) {
      this.uploadMessage = 'Selecciona archivos PDF y un curso del listado.';
      return;
    }

    const confirmed = window.confirm('Estas seguro de que quieres subir los archivos seleccionados?');

    if (confirmed) {
      try {
        for (const file of this.selectedFiles) {
          await this.fileService.saveFile(file, this.courseName);
        }

        this.uploadMessage = 'Archivo(s) subido(s) exitosamente.';
        this.selectedFiles = [];
        this.courseName = this.courses[0] || '';
      } catch (error) {
        this.uploadMessage = 'Error al subir el archivo.';
      }
    } else {
      this.uploadMessage = 'Subida cancelada.';
    }
  }
}
