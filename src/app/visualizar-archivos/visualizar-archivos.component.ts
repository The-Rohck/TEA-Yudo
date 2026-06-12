import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService, EmailNotification } from '../api.service';
import { FileHistoryEntry, FileServiceService, UploadedFile } from '../file-service.service';
import * as pdfjsLib from 'pdfjs-dist';

// Panel principal de administracion, lectura y asignacion de fichas.
// Configurar el worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.min.mjs';

// Datos resumidos que alimentan los graficos de diagnosticos y ajustes.
interface FichaChartInfo {
  fileName: string;
  course: string;
  diagnostico: string;
  ajustesPresentacion: number;
  ajustesOrganizacion: number;
  ajustesAmbienteAprendizaje: number;
  totalAjustes: number;
}

interface StudentFichaSummary {
  key: string;
  nombre: string;
  rut: string;
  carrera: string;
  courses: string[];
  files: UploadedFile[];
}

interface Teacher {
  fullName: string;
  rut: string;
  mail: string;
  courses?: string[];
}

interface AppUser {
  username: string;
  password: string;
  role: string;
}

@Component({
  selector: 'app-visualizar-archivos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './visualizar-archivos.component.html',
  styleUrl: './visualizar-archivos.component.css'
})
export class VisualizarArchivosComponent implements OnInit {
  // Estado principal de navegacion y visualizacion de fichas.
  files: UploadedFile[] = [];
  fichaChartInfo: FichaChartInfo[] = [];
  studentsWithFicha: StudentFichaSummary[] = [];
  selectedFile: UploadedFile | null = null;
  selectedTeacher: Teacher | null = null;
  isViewingUnassignedCourses: boolean = false;
  selectedCourse: string | null = null;
  pdfReadError: string = '';
  showFullHistory: boolean = false;
  currentUser: { username: string; role: string } | null = null;
  extractedData: {
    nombre: string;
    rut: string;
    carrera: string;
    anoIngreso: string;
    fechaIngreso: string;
    fechaActualizacion: string;
    antecedentesEducacionSuperior: string;
    diagnosticoEspecificaciones: string;
    observaciones: string;
    contacto: string;
    ajustesRazonables: { criterio: string; estrategias: string[] }[];
    ajustesPresentacion: string[];
    ajustesOrganizacion: string[];
    ajustesAmbienteAprendizaje: string[];
  } | null = null;
  isLoading: boolean = false;
  // Estado de modales y formularios administrados desde esta misma pantalla.
  isUploadModalOpen: boolean = false;
  isProfileModalOpen: boolean = false;
  isEditFichaModalOpen: boolean = false;
  isAddTeacherModalOpen: boolean = false;
  isAddCourseModalOpen: boolean = false;
  isManageCourseTeacherModalOpen: boolean = false;
  isManageStudentCoursesModalOpen: boolean = false;
  isEmailNotificationsModalOpen: boolean = false;
  isOptionsMenuOpen: boolean = false;
  studentCategoryFilter: 'todos' | 'con-cursos' | 'sin-asignaturas' = 'todos';
  selectedUploadFiles: File[] = [];
  uploadCourse: string = '';
  uploadMessage: string = '';
  profileUsername: string = '';
  profilePassword: string = '';
  profileMessage: string = '';
  teacherFullName: string = '';
  teacherRut: string = '';
  teacherMail: string = '';
  teacherMessage: string = '';
  newCourseId: string = '';
  newCourseName: string = '';
  newCourseTeacherRut: string = '';
  courseMessage: string = '';
  selectedAssociationCourse: string = '';
  selectedAssociationTeacherRut: string = '';
  associationMessage: string = '';
  selectedStudentForCourses: StudentFichaSummary | null = null;
  selectedStudentCourses: string[] = [];
  studentCourseMessage: string = '';
  emailNotifications: EmailNotification[] = [];
  emailNotificationsMessage: string = '';
  editingFichaIndex: number | null = null;
  editingFichaName: string = '';
  editingFichaCourse: string = '';
  editingFichaDate: string = '';
  editingFichaMessage: string = '';
  editingFichaFiles: File[] = [];
  disaffiliatingTeacherRut: string = '';
  isProcessingCharts: boolean = false;
  isInitializing: boolean = true;
  apiStatusMessage: string = '';
  // Catalogos sincronizados con API y localStorage para mantener respaldo local.
  savedCourses: string[] = [];
  registeredTeachers: Teacher[] = [];
  studentCourseAssociations = new Map<string, string[]>();
  private teachersStorageKey = 'appTeachers';
  private usersStorageKey = 'appUsers';
  private coursesStorageKey = 'appCourses';
  private readonly noCurrentCoursesLabel = 'Ya no cursan asignaturas';

  constructor(
    private fileService: FileServiceService,
    private apiService: ApiService,
    private router: Router,
    private elementRef: ElementRef
  ) {}

  async ngOnInit() {
    try {
      // Carga en orden: usuario, catalogos, limpieza local y fichas visibles.
      this.loadCurrentUser();
      await this.loadSavedCourses();
      await this.loadRegisteredTeachers();
      await this.loadStudentCourseAssociations();
      this.fileService.cleanDuplicateFiles();
      await this.loadFiles();
    } catch (error) {
      console.error('No se pudo inicializar la pantalla:', error);
      this.apiStatusMessage = 'No se pudieron cargar los datos iniciales. Revisa que el backend este iniciado.';
    } finally {
      this.isInitializing = false;
    }
  }

  async loadFiles() {
    try {
      await this.fileService.loadFilesFromApi();
    } catch (error) {
      console.error('No se pudieron cargar archivos desde la API:', error);
      this.apiStatusMessage = 'No se pudo conectar con la API. Mostrando datos locales si existen.';
    }

    // Los docentes solo ven fichas de cursos asociados; administrador ve todo.
    this.files = this.fileService.getFiles().filter(file => this.canViewFile(file));
    await this.generateFichaChartInfo();
  }

  get allCourses(): string[] {
    const fileCourseNames = this.fileService.getFiles()
      .map(file => file.course || 'Sin curso');
    const studentCourseNames = Array.from(this.studentCourseAssociations.values()).flat();
    // Une cursos creados, cursos historicos de fichas y asignaturas actuales de estudiantes.
    return this.uniqueRealCourses([
      ...this.savedCourses,
      ...fileCourseNames,
      ...studentCourseNames
    ]);
  }

  get courses(): string[] {
    return this.allCourses.filter(course => this.canViewCourse(course));
  }

  get visibleTeachers(): Teacher[] {
    if (this.canUploadFicha) {
      return this.registeredTeachers;
    }

    const teacher = this.currentTeacher;
    return teacher ? [teacher] : [];
  }

  get currentTeacher(): Teacher | null {
    if (!this.currentUser || this.canUploadFicha) {
      return null;
    }

    // El docente puede iniciar sesion con correo, RUT o nombre segun los datos locales.
    const normalizedUsername = this.normalizeUserKey(this.currentUser.username);
    return this.registeredTeachers.find(teacher =>
      this.normalizeUserKey(teacher.mail) === normalizedUsername ||
      this.normalizeUserKey(teacher.rut) === normalizedUsername ||
      this.normalizeUserKey(teacher.fullName) === normalizedUsername
    ) || null;
  }

  get selectedCourseFiles(): UploadedFile[] {
    if (!this.selectedCourse) {
      return [];
    }

    return this.filesByCourse(this.selectedCourse);
  }

  get courseStats(): { name: string; count: number; percent: number }[] {
    if (this.files.length === 0) {
      return [];
    }

    const counts = new Map<string, number>();

    for (const file of this.files) {
      const currentCourses = this.getCurrentCoursesForFile(file);
      const chartCourses = currentCourses.length ? currentCourses : [this.noCurrentCoursesLabel];

      for (const course of chartCourses) {
        if (course === this.noCurrentCoursesLabel || this.canViewCourse(course)) {
          counts.set(course, (counts.get(course) || 0) + 1);
        }
      }
    }

    return this.buildPercentStats(
      Array.from(counts.entries()).map(([name, count]) => ({ name, count })),
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es')
    );
  }

  get diagnosticoStats(): { name: string; count: number; percent: number }[] {
    if (this.fichaChartInfo.length === 0) {
      return [];
    }

    const counts = new Map<string, { name: string; count: number }>();
    for (const ficha of this.fichaChartInfo) {
      // Una ficha puede reportar mas de un diagnostico separado por slash.
      for (const diagnostico of this.getDiagnosticosForChart(ficha.diagnostico)) {
        const key = this.normalizeDiagnosticoKey(diagnostico);
        const existing = counts.get(key);
        counts.set(key, {
          name: existing?.name || this.getDiagnosticoDisplayName(diagnostico),
          count: (existing?.count || 0) + 1
        });
      }
    }

    return this.buildPercentStats(
      Array.from(counts.values()),
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es')
    );
  }

  private buildPercentStats(
    items: { name: string; count: number }[],
    sortFn: (
      a: { name: string; count: number; percent: number },
      b: { name: string; count: number; percent: number }
    ) => number
  ): { name: string; count: number; percent: number }[] {
    const total = items.reduce((sum, item) => sum + item.count, 0);

    if (total === 0) {
      return items.map(item => ({ ...item, percent: 0 })).sort(sortFn);
    }

    const stats = items.map((item, index) => {
      const exactPercent = (item.count / total) * 100;
      return {
        ...item,
        index,
        percent: Math.floor(exactPercent),
        remainder: exactPercent - Math.floor(exactPercent)
      };
    });
    let remainingPercent = 100 - stats.reduce((sum, item) => sum + item.percent, 0);

    [...stats]
      .sort((a, b) => b.remainder - a.remainder || b.count - a.count || a.index - b.index)
      .forEach(item => {
        if (remainingPercent > 0) {
          item.percent += 1;
          remainingPercent -= 1;
        }
      });

    return stats
      .map(({ remainder, index, ...item }) => item)
      .sort(sortFn);
  }

  get unassignedCourses(): string[] {
    if (!this.canUploadFicha) {
      return [];
    }

    return this.allCourses.filter(course => !this.getTeacherForCourse(course));
  }

  get visibleTeacherCourses(): string[] {
    if (this.isViewingUnassignedCourses) {
      return this.unassignedCourses;
    }

    if (!this.selectedTeacher) {
      return [];
    }

    return (this.selectedTeacher.courses || [])
      .filter(course => this.canViewCourse(course))
      .sort();
  }

  get studentsWithCoursesCount(): number {
    return this.studentsWithFicha.filter(student => this.hasStudentCourses(student)).length;
  }

  get studentsWithoutCoursesCount(): number {
    return this.studentsWithFicha.filter(student => !this.hasStudentCourses(student)).length;
  }

  get filteredStudentsWithFicha(): StudentFichaSummary[] {
    if (this.studentCategoryFilter === 'con-cursos') {
      return this.studentsWithFicha.filter(student => this.hasStudentCourses(student));
    }

    if (this.studentCategoryFilter === 'sin-asignaturas') {
      return this.studentsWithFicha.filter(student => !this.hasStudentCourses(student));
    }

    return this.studentsWithFicha;
  }

  setStudentCategoryFilter(filter: 'todos' | 'con-cursos' | 'sin-asignaturas') {
    this.studentCategoryFilter = filter;
  }

  hasStudentCourses(student: StudentFichaSummary): boolean {
    return student.courses.length > 0;
  }

  getStudentCoursesDisplay(student: StudentFichaSummary): string {
    return this.hasStudentCourses(student)
      ? student.courses.join(', ')
      : 'Ya no cursa asignaturas';
  }

  getFileCurrentCoursesDisplay(file: UploadedFile): string {
    const currentCourses = this.getCurrentCoursesForFile(file);
    return currentCourses.length
      ? currentCourses.join(', ')
      : this.noCurrentCoursesLabel;
  }

  private getDiagnosticosForChart(diagnostico: string): string[] {
    const items = diagnostico
      .split('/')
      .map(item => this.getDiagnosticoDisplayName(item))
      .filter(item => item.length > 0);

    return items.length ? items : ['Sin diagnostico'];
  }

  private getDiagnosticoDisplayName(diagnostico: string): string {
    const cleaned = diagnostico
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\s*[-–—]\s*/g, ' - ');
    const key = this.normalizeDiagnosticoKey(cleaned);

    if (
      key.includes('trastornopordeficitdeatencion') ||
      key.includes('tdah') ||
      key.includes('deficitdeatencion')
    ) {
      return 'Trastorno por Deficit de Atencion TDAH';
    }

    return cleaned || 'Sin diagnostico';
  }

  private normalizeDiagnosticoKey(diagnostico: string): string {
    return diagnostico
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\btdah\b/g, 'trastornopordeficitdeatencion')
      .replace(/[^a-z0-9]/g, '');
  }

  get ajustesStats(): { name: string; count: number }[] {
    const presentacion = this.fichaChartInfo.reduce((total, ficha) => total + ficha.ajustesPresentacion, 0);
    const organizacion = this.fichaChartInfo.reduce((total, ficha) => total + ficha.ajustesOrganizacion, 0);
    const ambienteAprendizaje = this.fichaChartInfo.reduce((total, ficha) => total + ficha.ajustesAmbienteAprendizaje, 0);

    return [
      { name: 'Presentacion', count: presentacion },
      { name: 'Organizacion', count: organizacion },
      { name: 'Ambiente de Aprendizaje', count: ambienteAprendizaje }
    ];
  }

  get maxDiagnosticoCount(): number {
    const counts = this.diagnosticoStats.map(item => item.count);
    return counts.length ? Math.max(...counts) : 0;
  }

  get maxAjustesCount(): number {
    const counts = this.ajustesStats.map(item => item.count);
    return counts.length ? Math.max(...counts) : 0;
  }

  get maxFilesInCourse(): number {
    const counts = this.courseStats.map(course => course.count);
    return counts.length ? Math.max(...counts) : 0;
  }

  get mostLoadedCourse(): string {
    const sortedStats = [...this.courseStats].sort((a, b) => b.count - a.count);
    return sortedStats.length ? sortedStats[0].name : 'Sin cursos';
  }

  getBarWidth(count: number): string {
    if (this.maxFilesInCourse === 0) {
      return '0%';
    }

    return `${Math.max((count / this.maxFilesInCourse) * 100, 8)}%`;
  }

  getCustomBarWidth(count: number, max: number): string {
    if (max === 0) {
      return '0%';
    }

    return `${Math.max((count / max) * 100, 8)}%`;
  }

  filesByCourse(course: string): UploadedFile[] {
    const normalizedCourse = this.normalizeCourseKey(course);
    return this.files.filter(file => this.getCurrentCoursesForFile(file)
      .some(item => this.normalizeCourseKey(item) === normalizedCourse));
  }

  hasRealCourse(course?: string): boolean {
    return !!course && this.normalizeCourseKey(course) !== this.normalizeCourseKey('Sin curso');
  }

  canDeleteCourse(course: string): boolean {
    return this.canUploadFicha && this.filesByCourse(course).length === 0;
  }

  async deleteCourse(course: string, event: Event) {
    event.stopPropagation();

    if (!this.canDeleteCourse(course)) {
      return;
    }

    const normalizedCourseName = this.normalizeCourseKey(course);
    // El curso se elimina localmente y luego se intenta reflejar en la API.
    this.savedCourses = this.savedCourses.filter(item => this.normalizeCourseKey(item) !== normalizedCourseName);
    localStorage.setItem(this.coursesStorageKey, JSON.stringify(this.savedCourses));
    try {
      await firstValueFrom(this.apiService.deleteAppCourse(course));
    } catch (error) {
      console.error('No se pudo eliminar el curso desde la API:', error);
    }
    this.registeredTeachers = this.registeredTeachers.map(teacher => ({
      ...teacher,
      courses: (teacher.courses || []).filter(item => this.normalizeCourseKey(item) !== normalizedCourseName)
    }));
    this.saveRegisteredTeachers();

    if (this.selectedCourse === course) {
      this.selectedCourse = null;
    }
  }

  getFileIndex(file: UploadedFile): number {
    return this.files.findIndex(item => item.data === file.data && item.name === file.name && item.course === file.course);
  }

  private async generateFichaChartInfo() {
    this.isProcessingCharts = true;
    this.studentsWithFicha = [];
    const chartInfo: FichaChartInfo[] = [];
    const studentsByKey = new Map<string, StudentFichaSummary>();

    // Cada PDF se lee una sola vez para alimentar graficos y el resumen de estudiantes.
    for (const file of this.files) {
      try {
        const text = await this.extractTextFromPDF(file.data);
        const data = this.parseExtractedData(text);

        if (data) {
          const normalizedRut = this.normalizeRut(data.rut);
          if (normalizedRut) {
            file.studentRut = normalizedRut;
          }

          this.populateAjustesPorSubseccion(data);
          this.addStudentFichaSummary(studentsByKey, file, data.nombre, data.rut, data.carrera);

          chartInfo.push({
            fileName: file.name,
            course: file.course || 'Sin curso',
            diagnostico: data.diagnosticoEspecificaciones || 'Sin diagnostico',
            ajustesPresentacion: data.ajustesPresentacion.length,
            ajustesOrganizacion: data.ajustesOrganizacion.length,
            ajustesAmbienteAprendizaje: data.ajustesAmbienteAprendizaje.length,
            totalAjustes: data.ajustesPresentacion.length + data.ajustesOrganizacion.length + data.ajustesAmbienteAprendizaje.length
          });
        }
      } catch (error) {
        chartInfo.push({
          fileName: file.name,
          course: file.course || 'Sin curso',
          diagnostico: 'No se pudo leer',
          ajustesPresentacion: 0,
          ajustesOrganizacion: 0,
          ajustesAmbienteAprendizaje: 0,
          totalAjustes: 0
        });
      }
    }

    this.fichaChartInfo = chartInfo;
    this.studentsWithFicha = Array.from(studentsByKey.values())
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    this.isProcessingCharts = false;
  }

  private addStudentFichaSummary(
    studentsByKey: Map<string, StudentFichaSummary>,
    file: UploadedFile,
    nombre: string,
    rut: string,
    carrera: string
  ): void {
    const normalizedRut = this.normalizeRut(rut);
    const normalizedName = this.normalizeUserKey(nombre);
    const key = normalizedRut || normalizedName || `${file.name}|${file.course || 'Sin curso'}`;
    const existingStudent = studentsByKey.get(key);

    if (existingStudent) {
      existingStudent.files.push(file);
      return;
    }

    studentsByKey.set(key, {
      key,
      nombre: nombre || 'Estudiante sin nombre informado',
      rut: rut || 'No informado',
      carrera: carrera || 'No informada',
      courses: this.getCurrentCoursesForStudentFile(file, normalizedRut),
      files: [file]
    });
  }

  async loadStudentCourseAssociations() {
    try {
      const associations = await firstValueFrom(this.apiService.getStudentCourseAssociations());
      this.studentCourseAssociations = new Map(associations.map(association => [
        this.normalizeRut(association.rut),
        this.uniqueRealCourses(association.courses)
      ]));
    } catch (error) {
      console.error('No se pudieron cargar cursos de estudiantes desde la API:', error);
      this.studentCourseAssociations = new Map();
    }
  }

  canManageStudentCourses(student: StudentFichaSummary): boolean {
    return !!this.normalizeRut(student.rut);
  }

  openManageStudentCoursesModal(student: StudentFichaSummary) {
    if (!this.canUploadFicha || !this.canManageStudentCourses(student)) {
      return;
    }

    this.selectedStudentForCourses = student;
    this.selectedStudentCourses = [...student.courses];
    this.studentCourseMessage = '';
    this.isManageStudentCoursesModalOpen = true;
  }

  closeManageStudentCoursesModal() {
    this.isManageStudentCoursesModalOpen = false;
    this.selectedStudentForCourses = null;
    this.selectedStudentCourses = [];
    this.studentCourseMessage = '';
  }

  async openEmailNotificationsModal() {
    this.closeOptionsMenu();
    this.isEmailNotificationsModalOpen = true;
    this.emailNotificationsMessage = 'Cargando registro de correos...';

    try {
      this.emailNotifications = await firstValueFrom(this.apiService.getEmailNotifications());
      this.emailNotificationsMessage = this.emailNotifications.length === 0
        ? 'Aun no hay intentos de correo registrados.'
        : '';
    } catch (error) {
      console.error('No se pudo cargar el registro de correos:', error);
      this.emailNotifications = [];
      this.emailNotificationsMessage = 'No se pudo cargar el registro de correos.';
    }
  }

  closeEmailNotificationsModal() {
    this.isEmailNotificationsModalOpen = false;
    this.emailNotifications = [];
    this.emailNotificationsMessage = '';
  }

  isStudentCourseSelected(course: string): boolean {
    const normalizedCourse = this.normalizeCourseKey(course);
    return this.selectedStudentCourses.some(item => this.normalizeCourseKey(item) === normalizedCourse);
  }

  toggleStudentCourse(course: string, checked: boolean) {
    const normalizedCourse = this.normalizeCourseKey(course);
    const coursesWithoutCurrent = this.selectedStudentCourses
      .filter(item => this.normalizeCourseKey(item) !== normalizedCourse);
    this.selectedStudentCourses = checked
      ? [...coursesWithoutCurrent, course].sort()
      : coursesWithoutCurrent;
    this.studentCourseMessage = '';
  }

  clearSelectedStudentCourses() {
    this.selectedStudentCourses = [];
    this.studentCourseMessage = 'El estudiante quedara en la categoria "Ya no cursan asignaturas" al guardar.';
  }

  async saveStudentCourses() {
    if (!this.selectedStudentForCourses) {
      return;
    }

    const rut = this.normalizeRut(this.selectedStudentForCourses.rut);

    if (!rut) {
      this.studentCourseMessage = 'La ficha debe incluir el RUT del estudiante.';
      return;
    }

    try {
      const association = await firstValueFrom(this.apiService.updateStudentCourses(
        rut,
        this.selectedStudentForCourses.nombre,
        this.selectedStudentCourses,
        this.selectedStudentForCourses.files.map(file => ({
          name: file.name,
          course: file.course || 'Sin curso'
        }))
      ));
      const courses = [...association.courses].sort();
      this.studentCourseAssociations.set(rut, courses);
      this.selectedStudentForCourses.courses = courses;
      this.selectedStudentForCourses.files.forEach(file => file.studentRut = rut);
      this.selectedStudentCourses = courses;
      await this.loadSavedCourses();
      await this.loadRegisteredTeachers();
      this.refreshSelectedTeacher();
      await this.generateFichaChartInfo();
      this.studentCourseMessage = 'Cursos del estudiante actualizados correctamente.';
    } catch (error) {
      console.error('No se pudieron guardar cursos del estudiante:', error);
      this.studentCourseMessage = error instanceof HttpErrorResponse && error.error?.message
        ? error.error.message
        : 'No se pudieron actualizar los cursos del estudiante.';
    }
  }

  selectCourse(course: string) {
    if (!this.canViewCourse(course)) {
      return;
    }

    this.selectedCourse = course;
    this.closeViewer();
  }

  backToCourses() {
    this.selectedCourse = null;
    this.closeViewer();
  }

  selectTeacher(teacher: Teacher) {
    if (!this.canViewTeacher(teacher)) {
      return;
    }

    this.selectedTeacher = teacher;
    this.isViewingUnassignedCourses = false;
    this.selectedCourse = null;
    this.closeViewer();
  }

  selectUnassignedCourses() {
    if (!this.canUploadFicha) {
      return;
    }

    this.selectedTeacher = null;
    this.isViewingUnassignedCourses = true;
    this.selectedCourse = null;
    this.closeViewer();
  }

  backToTeachers() {
    this.selectedTeacher = null;
    this.isViewingUnassignedCourses = false;
    this.selectedCourse = null;
    this.closeViewer();
  }

  getTeacherCoursesCount(teacher: Teacher): number {
    return (teacher.courses || []).filter(course =>
      this.allCourses.some(item => this.normalizeCourseKey(item) === this.normalizeCourseKey(course))
    ).length;
  }

  getSelectedTeacherTitle(): string {
    if (this.isViewingUnassignedCourses) {
      return 'Cursos sin profesor asignado';
    }

    return this.selectedTeacher?.fullName || 'Profesor';
  }

  getSelectedTeacherSubtitle(): string {
    if (this.isViewingUnassignedCourses) {
      return 'Cursos pendientes de asignar';
    }

    return this.selectedTeacher?.mail || '';
  }

  getTeacherForCourse(course: string): Teacher | null {
    const normalizedCourse = this.normalizeCourseKey(course);
    return this.registeredTeachers.find(teacher =>
      (teacher.courses || []).some(item => this.normalizeCourseKey(item) === normalizedCourse)
    ) || null;
  }

  getTeacherDisplayForCourse(course: string): string {
    return this.getTeacherForCourse(course)?.fullName || 'Sin profesor asignado';
  }

  canViewCourse(course: string): boolean {
    if (this.canUploadFicha) {
      return true;
    }

    // Para docentes, el acceso depende de las asociaciones profesor-curso.
    const teacher = this.currentTeacher;
    if (!teacher) {
      return false;
    }

    const normalizedCourse = this.normalizeCourseKey(course);
    return (teacher.courses || []).some(item => this.normalizeCourseKey(item) === normalizedCourse);
  }

  private canViewFile(file: UploadedFile): boolean {
    if (this.canUploadFicha) {
      return true;
    }

    return this.getCurrentCoursesForFile(file).some(course => this.canViewCourse(course));
  }

  private getCurrentCoursesForFile(file: UploadedFile): string[] {
    const rut = this.normalizeRut(file.studentRut || '');
    return this.getCurrentCoursesForStudentFile(file, rut);
  }

  private getCurrentCoursesForStudentFile(file: UploadedFile, rut: string): string[] {
    if (rut && this.studentCourseAssociations.has(rut)) {
      return this.studentCourseAssociations.get(rut) || [];
    }

    const originalCourse = file.course || 'Sin curso';
    return this.hasRealCourse(originalCourse) ? [originalCourse] : [];
  }

  canViewTeacher(teacher: Teacher): boolean {
    if (this.canUploadFicha) {
      return true;
    }

    const currentTeacher = this.currentTeacher;
    return !!currentTeacher && this.normalizeTeacherKey(currentTeacher.rut) === this.normalizeTeacherKey(teacher.rut);
  }

  isDisaffiliatingTeacher(teacher: Teacher | null): boolean {
    return !!teacher && this.disaffiliatingTeacherRut === this.normalizeTeacherKey(teacher.rut);
  }

  loadCurrentUser() {
    const storedUser = localStorage.getItem('currentUser');
    this.currentUser = storedUser ? JSON.parse(storedUser) : null;
    this.profileUsername = this.currentUser?.username || '';
    this.profilePassword = '';
  }

  get canUploadFicha(): boolean {
    return this.currentUser?.role === 'administrador';
  }

  toggleOptionsMenu() {
    this.isOptionsMenuOpen = !this.isOptionsMenuOpen;
  }

  @HostListener('document:click', ['$event'])
  closeOptionsMenuOnOutsideClick(event: MouseEvent) {
    if (!this.isOptionsMenuOpen) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const optionsContainer = this.elementRef.nativeElement.querySelector('.header-actions');

    if (target && optionsContainer && !optionsContainer.contains(target)) {
      this.closeOptionsMenu();
    }
  }

  closeOptionsMenu() {
    this.isOptionsMenuOpen = false;
  }

  openProfileModal() {
    this.closeOptionsMenu();
    this.profileUsername = this.currentUser?.username || '';
    this.profilePassword = '';
    this.profileMessage = '';
    this.isProfileModalOpen = true;
  }

  closeProfileModal() {
    this.isProfileModalOpen = false;
    this.profilePassword = '';
    this.profileMessage = '';
  }

  saveProfile() {
    const username = this.profileUsername.trim().toLowerCase();
    const password = this.profilePassword.trim();

    if (!username) {
      this.profileMessage = 'Ingresa un nombre.';
      return;
    }

    if (password.length < 6) {
      this.profileMessage = 'Ingresa una contrasena de minimo 6 caracteres.';
      return;
    }

    const updatedUser = {
      username,
      password,
      role: this.currentUser?.role || 'docente'
    };
    // Se reemplaza el usuario actual sin duplicar nombres anteriores en localStorage.
    const previousUsername = this.currentUser?.username || username;
    const users = this.getProfileUsers()
      .filter(user => {
        const storedUsername = user.username.trim().toLowerCase();
        return storedUsername !== previousUsername.trim().toLowerCase() && storedUsername !== username;
      });

    users.push(updatedUser);
    localStorage.setItem(this.usersStorageKey, JSON.stringify(users));

    localStorage.setItem('currentUser', JSON.stringify({
      username: updatedUser.username,
      role: updatedUser.role
    }));
    this.currentUser = {
      username: updatedUser.username,
      role: updatedUser.role
    };
    this.profilePassword = '';
    this.profileMessage = 'Perfil actualizado correctamente.';
  }

  cerrarSesion() {
    this.closeOptionsMenu();
    localStorage.removeItem('currentUser');
    this.currentUser = null;
    this.router.navigate(['/login']);
  }

  openAddTeacherModal() {
    if (!this.canUploadFicha) {
      return;
    }

    this.closeOptionsMenu();
    this.teacherFullName = '';
    this.teacherRut = '';
    this.teacherMail = '';
    this.teacherMessage = '';
    this.isAddTeacherModalOpen = true;
  }

  openManageTeachersModal() {
    if (!this.canUploadFicha) {
      return;
    }

    this.closeOptionsMenu();
    this.teacherFullName = '';
    this.teacherRut = '';
    this.teacherMail = '';
    this.teacherMessage = '';
    this.isAddTeacherModalOpen = true;
  }

  closeAddTeacherModal() {
    this.isAddTeacherModalOpen = false;
    this.teacherFullName = '';
    this.teacherRut = '';
    this.teacherMail = '';
    this.teacherMessage = '';
  }

  async addTeacher() {
    const fullName = this.teacherFullName.trim();
    const rut = this.teacherRut.trim();
    const mail = this.teacherMail.trim().toLowerCase();

    if (!fullName) {
      this.teacherMessage = 'Ingresa el nombre completo.';
      return;
    }

    if (!mail) {
      this.teacherMessage = 'Ingresa el mail.';
      return;
    }

    if (!this.isValidEmail(mail)) {
      this.teacherMessage = 'Ingresa un mail valido.';
      return;
    }

    const normalizedRut = this.normalizeTeacherKey(rut);
    const teacherExists = this.registeredTeachers.some(teacher =>
      (normalizedRut && this.normalizeTeacherKey(teacher.rut) === normalizedRut) ||
      teacher.mail.toLowerCase() === mail
    );

    if (teacherExists) {
      this.teacherMessage = 'Ya existe un profesor con ese RUT o mail.';
      return;
    }

    try {
      const createdTeacher = await firstValueFrom(this.apiService.createAppTeacher({ fullName, rut, mail, courses: [] }));
      await this.loadRegisteredTeachers();
      this.teacherMessage = createdTeacher.invitation?.sent
        ? 'Profesor agregado. Se envio un correo para crear su contrasena.'
        : 'Profesor agregado. Revisa el registro de correos para obtener el enlace de invitacion.';
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.error?.message) {
        this.teacherMessage = error.error.message;
        return;
      }

      this.teacherMessage = 'No se pudo guardar el profesor en la base de datos.';
      return;
    }

    this.teacherFullName = '';
    this.teacherRut = '';
    this.teacherMail = '';
  }

  async disaffiliateTeacher(teacher: Teacher, event?: Event) {
    event?.stopPropagation();

    if (!this.canUploadFicha) {
      return;
    }

    const normalizedRut = this.normalizeTeacherKey(teacher.rut);
    if (this.disaffiliatingTeacherRut === normalizedRut) {
      return;
    }

    const confirmed = window.confirm(
      `Desafiliar a ${teacher.fullName}? Se quitaran sus cursos asociados y su acceso docente.`
    );

    if (!confirmed) {
      return;
    }

    const previousTeachers = [...this.registeredTeachers];
    this.disaffiliatingTeacherRut = normalizedRut;
    this.teacherMessage = `Desafiliando a ${teacher.fullName}...`;

    this.registeredTeachers = this.registeredTeachers
      .filter(item => this.normalizeTeacherKey(item.rut) !== normalizedRut);
    this.saveRegisteredTeachers();
    this.removeLocalTeacherUser(teacher);

    if (this.selectedTeacher && this.normalizeTeacherKey(this.selectedTeacher.rut) === normalizedRut) {
      this.selectedTeacher = null;
      this.selectedCourse = null;
      this.isViewingUnassignedCourses = false;
      this.closeViewer();
    }

    try {
      await firstValueFrom(this.apiService.deleteAppTeacher(teacher.rut));
      await this.loadRegisteredTeachers();
      this.teacherMessage = 'Profesor desafiliado correctamente.';
    } catch (error) {
      this.registeredTeachers = previousTeachers;
      this.saveRegisteredTeachers();
      this.teacherMessage = error instanceof HttpErrorResponse && error.error?.message
        ? error.error.message
        : 'No se pudo desafiliar el profesor.';
      window.alert(this.teacherMessage);
    } finally {
      this.disaffiliatingTeacherRut = '';
    }
  }

  async loadRegisteredTeachers() {
    try {
      const apiTeachers = await firstValueFrom(this.apiService.getAppTeachers());
      const localTeachers = this.getTeachers()
        .map(teacher => ({ ...teacher, courses: teacher.courses || [] }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));

      // Si la API esta vacia, se suben profesores y cursos guardados localmente.
      if (apiTeachers.length === 0 && localTeachers.length > 0) {
        for (const teacher of localTeachers) {
          const savedTeacher = await firstValueFrom(this.apiService.createAppTeacher(teacher));
          for (const course of teacher.courses || []) {
            await firstValueFrom(this.apiService.createAppCourse({ nombre: course, profesorRut: savedTeacher.rut }));
          }
        }
        this.registeredTeachers = this.normalizeTeachersCourses(await firstValueFrom(this.apiService.getAppTeachers()));
        this.saveRegisteredTeachers();
        return;
      }

      this.registeredTeachers = this.normalizeTeachersCourses(apiTeachers);
      this.saveRegisteredTeachers();
      return;
    } catch (error) {
      console.error('No se pudieron cargar profesores desde la API:', error);
    }

    this.registeredTeachers = this.normalizeTeachersCourses(this.getTeachers())
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  private saveRegisteredTeachers() {
    localStorage.setItem(this.teachersStorageKey, JSON.stringify(this.registeredTeachers));
  }

  async loadSavedCourses() {
    try {
      const courses = await firstValueFrom(this.apiService.getAppCourses());
      const storedCourses = localStorage.getItem(this.coursesStorageKey);
      const localCourses: string[] = storedCourses ? JSON.parse(storedCourses) : [];

      if (courses.length === 0 && localCourses.length > 0) {
        for (const course of localCourses) {
          await firstValueFrom(this.apiService.createAppCourse({ nombre: course }));
        }
        this.savedCourses = localCourses.sort();
        return;
      }

      this.savedCourses = courses.map(course => course.nombre).sort();
      localStorage.setItem(this.coursesStorageKey, JSON.stringify(this.savedCourses));
      return;
    } catch (error) {
      console.error('No se pudieron cargar cursos desde la API:', error);
    }

    const storedCourses = localStorage.getItem(this.coursesStorageKey);
    this.savedCourses = storedCourses ? JSON.parse(storedCourses) : [];
  }

  openAddCourseModal() {
    if (!this.canUploadFicha) {
      return;
    }

    this.closeOptionsMenu();
    this.newCourseId = '';
    this.newCourseName = '';
    this.newCourseTeacherRut = this.selectedTeacher?.rut || '';
    this.courseMessage = '';
    this.isAddCourseModalOpen = true;
  }

  closeAddCourseModal() {
    this.isAddCourseModalOpen = false;
    this.newCourseId = '';
    this.newCourseName = '';
    this.newCourseTeacherRut = '';
    this.courseMessage = '';
  }

  openManageCourseTeacherModal(course: string, event?: Event) {
    event?.stopPropagation();

    if (!this.canUploadFicha) {
      return;
    }

    this.openCourseTeacherModal(course);
  }

  openManageAllCourseTeachersModal() {
    if (!this.canUploadFicha) {
      return;
    }

    this.closeOptionsMenu();
    this.openCourseTeacherModal(this.allCourses[0] || '');
  }

  openManageTeacherCoursesModal(teacher: Teacher | null) {
    if (!this.canUploadFicha || !teacher) {
      return;
    }

    const teacherCourses = (teacher.courses || [])
      .filter(course => this.allCourses.some(item => this.normalizeCourseKey(item) === this.normalizeCourseKey(course)));
    const firstCourse = teacherCourses[0] || this.unassignedCourses[0] || this.allCourses[0] || '';

    this.openCourseTeacherModal(firstCourse, teacher.rut);
  }

  private openCourseTeacherModal(course: string, teacherRut?: string) {
    const currentTeacher = this.getTeacherForCourse(course);
    this.selectedAssociationCourse = course;
    this.selectedAssociationTeacherRut = teacherRut || currentTeacher?.rut || '';
    this.associationMessage = '';
    this.isManageCourseTeacherModalOpen = true;
  }

  closeManageCourseTeacherModal() {
    this.isManageCourseTeacherModalOpen = false;
    this.selectedAssociationCourse = '';
    this.selectedAssociationTeacherRut = '';
    this.associationMessage = '';
  }

  onAssociationCourseChange(course: string) {
    this.selectedAssociationCourse = course;
    this.selectedAssociationTeacherRut = this.getTeacherForCourse(course)?.rut || '';
    this.associationMessage = '';
  }

  async saveCourseTeacherAssociation() {
    if (!this.selectedAssociationCourse) {
      this.associationMessage = 'Selecciona un curso.';
      return;
    }

    try {
      await firstValueFrom(this.apiService.updateAppCourseTeacher(
        this.selectedAssociationCourse,
        this.selectedAssociationTeacherRut || null
      ));
      this.updateLocalCourseAssociation(this.selectedAssociationCourse, this.selectedAssociationTeacherRut || null);
      this.saveRegisteredTeachers();
      await this.loadRegisteredTeachers();
      this.refreshSelectedTeacher();
      this.associationMessage = this.selectedAssociationTeacherRut
        ? 'Curso asociado correctamente.'
        : 'Curso desvinculado correctamente.';
    } catch (error) {
      this.associationMessage = 'No se pudo actualizar el profesor del curso.';
    }
  }

  async unlinkCourseTeacherAssociation() {
    this.selectedAssociationTeacherRut = '';
    await this.saveCourseTeacherAssociation();
  }

  async addCourse() {
    const courseId = this.newCourseId.trim();
    const courseName = this.normalizeCourseDisplayName(this.newCourseName);

    if (courseId.length > 10) {
      this.courseMessage = 'El codigo/ID del curso puede tener hasta 10 caracteres.';
      return;
    }

    if (!courseName) {
      this.courseMessage = 'Ingresa el nombre del curso.';
      return;
    }

    const normalizedCourseName = this.normalizeCourseKey(courseName);
    const courseExists = this.courses.some(course => this.normalizeCourseKey(course) === normalizedCourseName);

    if (courseExists) {
      this.courseMessage = 'Ese curso ya existe.';
      return;
    }

    try {
      await firstValueFrom(this.apiService.createAppCourse({
        idCodigo: courseId || undefined,
        nombre: courseName,
        profesorRut: this.newCourseTeacherRut || null
      }));
      await this.loadSavedCourses();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.error?.message) {
        this.courseMessage = error.error.message;
        return;
      }

      this.courseMessage = 'No se pudo guardar el curso en la base de datos.';
      return;
    }

    if (this.newCourseTeacherRut) {
      const normalizedTeacherRut = this.normalizeTeacherKey(this.newCourseTeacherRut);
      this.registeredTeachers = this.registeredTeachers.map(teacher => {
        if (this.normalizeTeacherKey(teacher.rut) !== normalizedTeacherRut) {
          return teacher;
        }

        return {
          ...teacher,
          courses: [...(teacher.courses || []), courseName].sort()
        };
      });
      this.saveRegisteredTeachers();
      this.selectedTeacher = this.registeredTeachers.find(teacher => this.normalizeTeacherKey(teacher.rut) === normalizedTeacherRut) || this.selectedTeacher;
      await this.loadRegisteredTeachers();
    }

    this.newCourseId = '';
    this.newCourseName = '';
    this.courseMessage = 'Curso agregado correctamente.';
  }

  private updateLocalCourseAssociation(courseName: string, teacherRut: string | null) {
    const normalizedCourseName = this.normalizeCourseKey(courseName);
    const normalizedTeacherRut = teacherRut ? this.normalizeTeacherKey(teacherRut) : '';

    // Primero se quita el curso de todos y luego se agrega al profesor elegido.
    this.registeredTeachers = this.registeredTeachers.map(teacher => {
      const coursesWithoutCurrent = (teacher.courses || [])
        .filter(course => this.normalizeCourseKey(course) !== normalizedCourseName);

      if (normalizedTeacherRut && this.normalizeTeacherKey(teacher.rut) === normalizedTeacherRut) {
        return {
          ...teacher,
          courses: [...coursesWithoutCurrent, courseName].sort()
        };
      }

      return {
        ...teacher,
        courses: coursesWithoutCurrent
      };
    });
  }

  private refreshSelectedTeacher() {
    if (!this.selectedTeacher) {
      return;
    }

    const normalizedSelectedRut = this.normalizeTeacherKey(this.selectedTeacher.rut);
    this.selectedTeacher = this.registeredTeachers.find(teacher =>
      this.normalizeTeacherKey(teacher.rut) === normalizedSelectedRut
    ) || null;

    if (!this.selectedTeacher) {
      this.isViewingUnassignedCourses = true;
    }
  }

  private normalizeCourseDisplayName(courseName: string): string {
    return courseName
      .trim()
      .replace(/[-_/]+/g, ' ')
      .replace(/\s+/g, ' ');
  }

  private normalizeCourseKey(courseName: string): string {
    return this.normalizeCourseDisplayName(courseName)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private uniqueRealCourses(courses: string[]): string[] {
    const coursesByKey = new Map<string, string>();

    for (const course of courses) {
      const courseName = this.normalizeCourseDisplayName(course || '');
      const courseKey = this.normalizeCourseKey(courseName);

      if (!courseKey || courseKey === this.normalizeCourseKey('Sin curso')) {
        continue;
      }

      if (!coursesByKey.has(courseKey)) {
        coursesByKey.set(courseKey, courseName);
      }
    }

    return Array.from(coursesByKey.values()).sort((a, b) => a.localeCompare(b, 'es'));
  }

  private normalizeTeachersCourses(teachers: Teacher[]): Teacher[] {
    return teachers
      .map(teacher => ({
        ...teacher,
        courses: this.uniqueRealCourses(teacher.courses || [])
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  }

  private getTeachers(): Teacher[] {
    const storedTeachers = localStorage.getItem(this.teachersStorageKey);
    return storedTeachers ? JSON.parse(storedTeachers) : [];
  }

  private getProfileUsers(): AppUser[] {
    const storedUsers = localStorage.getItem(this.usersStorageKey);
    return storedUsers ? JSON.parse(storedUsers) : [];
  }

  private upsertLocalUser(user: AppUser): void {
    const normalizedUsername = user.username.trim().toLowerCase();
    const users = this.getProfileUsers()
      .filter(item => item.username.trim().toLowerCase() !== normalizedUsername);

    users.push({
      ...user,
      username: normalizedUsername
    });
    localStorage.setItem(this.usersStorageKey, JSON.stringify(users));
  }

  private removeLocalTeacherUser(teacher: Teacher): void {
    const teacherKeys = [
      teacher.mail,
      teacher.rut,
      teacher.fullName
    ].map(value => this.normalizeUserKey(value));

    const users = this.getProfileUsers()
      .filter(user => !teacherKeys.includes(this.normalizeUserKey(user.username)));

    localStorage.setItem(this.usersStorageKey, JSON.stringify(users));
  }

  private normalizeRut(rut: string): string {
    return rut
      .trim()
      .toLowerCase()
      .replace(/[^0-9k]/g, '');
  }

  private normalizeTeacherKey(rut: string): string {
    return rut
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  isGeneratedTeacherRut(rut: string): boolean {
    return /^doc[a-z0-9]+$/i.test(rut.trim());
  }

  private normalizeUserKey(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9@.]/g, '');
  }

  private isValidEmail(mail: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail);
  }

  openUploadModal(course?: string, event?: Event) {
    event?.stopPropagation();

    if (!this.canUploadFicha) {
      return;
    }

    this.closeOptionsMenu();
    this.isUploadModalOpen = true;
    this.selectedUploadFiles = [];
    this.uploadCourse = course || this.courses[0] || '';
    this.uploadMessage = '';
  }

  closeUploadModal() {
    this.isUploadModalOpen = false;
    this.selectedUploadFiles = [];
    this.uploadCourse = '';
    this.uploadMessage = '';
  }

  onUploadFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);

    if (files.length === 0) {
      this.selectedUploadFiles = [];
      this.uploadMessage = '';
      return;
    }

    const pdfFiles = files.filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === files.length) {
      this.selectedUploadFiles = pdfFiles;
      this.uploadMessage = `${pdfFiles.length} archivo(s) PDF seleccionado(s).`;
    } else {
      this.selectedUploadFiles = [];
      this.uploadMessage = 'Selecciona solo archivos PDF validos.';
      input.value = '';
    }
  }

  async uploadSelectedFiles() {
    if (this.selectedUploadFiles.length === 0 || !this.uploadCourse.trim()) {
      this.uploadMessage = 'Selecciona archivos PDF e ingresa el curso.';
      return;
    }

    try {
      const uploadedCourse = this.uploadCourse.trim();
      await this.validateSingleFichaPerStudent(this.selectedUploadFiles);
      // La subida masiva reutiliza el servicio para validar duplicados y persistir historial.
      for (const file of this.selectedUploadFiles) {
        await this.fileService.saveFile(file, uploadedCourse);
      }

      this.uploadMessage = 'Archivo(s) subido(s) exitosamente.';
      this.selectedUploadFiles = [];
      this.uploadCourse = '';
      await this.loadFiles();
      this.selectedCourse = uploadedCourse;
      this.closeViewer();
    } catch (error) {
      console.error('No se pudieron subir los archivos:', error);
      this.uploadMessage = this.getUploadErrorMessage(error);
    }
  }

  private getUploadErrorMessage(error: unknown): string {
    if (error instanceof Error && !(error instanceof HttpErrorResponse)) {
      return error.message;
    }

    if (!(error instanceof HttpErrorResponse)) {
      return 'No se pudieron subir los archivos. Intenta nuevamente.';
    }

    if (error.status === 0) {
      return 'No se pudo conectar con la API. Revisa que el backend este iniciado.';
    }

    if (error.status === 413) {
      return 'El PDF es demasiado pesado para subirlo.';
    }

    return error.error?.message || 'No se pudieron subir los archivos. Intenta nuevamente.';
  }

  private async validateSingleFichaPerStudent(files: File[]): Promise<void> {
    const existingRuts = new Set(
      this.studentsWithFicha
        .map(student => this.normalizeRut(student.rut))
        .filter(Boolean)
    );
    const selectedRuts = new Set<string>();

    for (const file of files) {
      const rut = await this.extractStudentRutFromFile(file);

      if (!rut) {
        continue;
      }

      if (existingRuts.has(rut)) {
        throw new Error('El estudiante ya tiene una ficha subida.');
      }

      if (selectedRuts.has(rut)) {
        throw new Error('No puedes subir mas de una ficha para el mismo estudiante.');
      }

      selectedRuts.add(rut);
    }
  }

  private async extractStudentRutFromFile(file: File): Promise<string> {
    try {
      const dataUrl = await this.readFileAsDataUrl(file);
      const text = await this.extractTextFromPDF(dataUrl);
      return this.normalizeRut(this.parseExtractedData(text)?.rut || '');
    } catch (error) {
      console.warn(`No se pudo detectar el RUT en "${file.name}":`, error);
      return '';
    }
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  openEditFichaModal(file: UploadedFile) {
    const fileIndex = this.getFileIndex(file);

    if (fileIndex === -1) {
      return;
    }

    this.editingFichaIndex = fileIndex;
    this.editingFichaName = file.name;
    this.editingFichaCourse = file.course || this.courses[0] || '';
    this.editingFichaDate = file.date || new Date().toISOString().slice(0, 10);
    this.editingFichaFiles = [];
    this.editingFichaMessage = '';
    this.isEditFichaModalOpen = true;
  }

  closeEditFichaModal() {
    this.isEditFichaModalOpen = false;
    this.editingFichaIndex = null;
    this.editingFichaName = '';
    this.editingFichaCourse = '';
    this.editingFichaDate = '';
    this.editingFichaFiles = [];
    this.editingFichaMessage = '';
  }

  onEditFichaFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);

    if (files.length === 0) {
      this.editingFichaFiles = [];
      this.editingFichaMessage = '';
      return;
    }

    const pdfFiles = files.filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === files.length) {
      this.editingFichaFiles = pdfFiles;
      this.editingFichaMessage = `${pdfFiles.length} archivo(s) PDF listo(s) para agregar.`;
    } else {
      this.editingFichaFiles = [];
      this.editingFichaMessage = 'Selecciona solo archivos PDF validos.';
      input.value = '';
    }
  }

  async saveEditedFicha() {
    if (this.editingFichaIndex === null) {
      return;
    }

    const name = this.editingFichaName.trim();
    const course = this.editingFichaCourse.trim();
    const date = this.editingFichaDate;

    if (!name || !course || !date) {
      this.editingFichaMessage = 'Ingresa el nombre de la ficha, el curso y la fecha.';
      return;
    }

    try {
      await this.fileService.updateFile(this.editingFichaIndex, { name, course, date });
      let createdCount = 0;
      let replacedCount = 0;

      // Los PDF agregados desde la edicion reemplazan coincidencias del mismo curso.
      for (const file of this.editingFichaFiles) {
        const result = await this.fileService.saveFile(file, course, true);

        if (result === 'created') {
          createdCount++;
        }

        if (result === 'replaced') {
          replacedCount++;
        }
      }

      await this.loadFiles();
      this.selectedFile = this.files.find(file => file.name === name && file.course === course) || null;
      this.extractedData = null;
      this.selectedCourse = course;
      this.editingFichaMessage = this.getEditFichaSuccessMessage(createdCount, replacedCount);
      this.editingFichaFiles = [];
      this.resetFileInput('editingFichaFiles');
    } catch (error) {
      this.editingFichaMessage = 'Error al guardar la ficha o agregar los PDF.';
    }
  }

  private resetFileInput(inputId: string): void {
    const input = document.getElementById(inputId) as HTMLInputElement | null;

    if (input) {
      input.value = '';
    }
  }

  private getEditFichaSuccessMessage(createdCount: number, replacedCount: number): string {
    const messages: string[] = ['Ficha actualizada correctamente'];

    if (createdCount > 0) {
      messages.push(`${createdCount} PDF agregado(s)`);
    }

    if (replacedCount > 0) {
      messages.push(`${replacedCount} PDF reemplazado(s)`);
    }

    return `${messages.join(', ')}.`;
  }

  getFileHistory(file: UploadedFile | null): FileHistoryEntry[] {
    return [...(file?.history || [])].sort((a, b) => b.date.localeCompare(a.date));
  }

  getVisibleFileHistory(file: UploadedFile | null): FileHistoryEntry[] {
    const history = this.getFileHistory(file);
    return this.showFullHistory ? history : history.slice(0, 3);
  }

  getHiddenHistoryCount(file: UploadedFile | null): number {
    return Math.max(this.getFileHistory(file).length - 3, 0);
  }

  toggleFullHistory() {
    this.showFullHistory = !this.showFullHistory;
  }

  formatHistoryDate(date: string): string {
    return new Date(date).toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getSystemUpdateDate(file: UploadedFile | null): string {
    const latestUpdate = this.getFileHistory(file)
      .find(item => item.action === 'Actualizacion' || item.action === 'Reemplazo');

    if (!latestUpdate) {
      return 'Sin actualizaciones';
    }

    return new Date(latestUpdate.date).toLocaleDateString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  getAjusteDisplayName(criterio: string): string {
    return criterio.trim() === 'Entorno' ? 'Ambiente de Aprendizaje' : criterio;
  }

  async viewFile(file: UploadedFile) {
    if (this.selectedFile && this.selectedFile.data === file.data) {
      this.closeViewer();
      return;
    }

    this.selectedFile = file;
    this.isLoading = true;
    this.extractedData = null;
    this.pdfReadError = '';
    this.showFullHistory = false;
    this.scrollToFichaDetail();

    try {
      const text = await this.extractTextFromPDF(file.data);
      this.extractedData = this.parseExtractedData(text);
      if (this.extractedData) {
        this.populateAjustesPorSubseccion(this.extractedData);
      }
    } catch (error) {
      console.error('Error extracting data:', error);
      this.pdfReadError = error instanceof Error ? error.message : 'No se pudo leer el PDF guardado.';
      this.extractedData = null;
    } finally {
      this.isLoading = false;
      this.scrollToFichaDetail();
    }
  }

  private scrollToFichaDetail(): void {
    // Espera a que Angular inserte el bloque del visor antes de desplazar la pagina.
    setTimeout(() => {
      document.getElementById('ficha-detail')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  }

  private normalizeForSearch(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private normalizePdfText(value: string): string {
    return value
      .replace(/Ã¡/g, 'á')
      .replace(/Ã©/g, 'é')
      .replace(/Ã­/g, 'í')
      .replace(/Ã³/g, 'ó')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã±/g, 'ñ')
      .replace(/Ã/g, 'Á')
      .replace(/Ã‰/g, 'É')
      .replace(/Ã/g, 'Í')
      .replace(/Ã“/g, 'Ó')
      .replace(/Ãš/g, 'Ú')
      .replace(/Ã‘/g, 'Ñ');
  }

  private async extractTextFromPDF(dataUrl: string): Promise<string> {
    const pdfData = this.dataUrlToPdfBytes(dataUrl);

    // Cargar el PDF
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

    let fullText = '';
    // PDF.js entrega texto por pagina; se concatena para aplicar expresiones regulares luego.
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  }

  private dataUrlToPdfBytes(dataUrl: string): Uint8Array {
    const base64Marker = ';base64,';
    const base64Index = dataUrl.indexOf(base64Marker);

    if (!dataUrl || base64Index === -1) {
      throw new Error('El archivo guardado no tiene formato PDF valido.');
    }

    const base64 = base64Index === -1
      ? dataUrl
      : dataUrl.slice(base64Index + base64Marker.length).replace(/\s/g, '');
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }

    const signature = String.fromCharCode(...bytes.slice(0, 4));

    if (signature !== '%PDF') {
      throw new Error('El archivo guardado no parece ser un PDF valido.');
    }

    return bytes;
  }

  private parseExtractedData(text: string): typeof this.extractedData {
    const normalizedText = this.normalizePdfText(text)
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t\u00A0]+/g, ' ')
      .replace(/\r\n|\r|\n/g, ' ')
      .trim();

    // Ayudante para extraer campos entre titulos variables del formato FOP.
    const getField = (regex: RegExp) => {
      const match = normalizedText.match(regex);
      return match ? match[1].trim().replace(/\s+/g, ' ') : '';
    };

    const nombre = getField(/NOMBRE\s*[:\-]?\s*([\s\S]*?)(?=RUT\s*[:\-]?|RUN\s*[:\-]?|CARRERA\s*[:\-]?|DIAGN[ÓO]STICO\s*[:\-]?)/i);
    const rut = getField(/RUT\s*[:\-]?\s*([0-9\.\-\s]+?)(?=CARRERA\s*[:\-]?|DIAGN[ÓO]STICO\s*[:\-]?|FECHA\s*[:\-]?|$)/i);
    const carrera = getField(/CARRERA\s*[:\-]?\s*([\s\S]*?)(?=DIAGN[ÓO]STICO\s*[:\-]?|FECHA\s*[:\-]?|$)/i);
    const fechaIngreso = getField(/FECHA\s*(?:DE\s*)?INGRESO\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    const anoIngreso = getField(/A[ÑN]O\s*(?:DE\s*)?INGRESO\s*[:\-]?\s*([0-9]{4})/i) || (fechaIngreso.match(/(\d{4})/)?.[1] || '');
    const fechaActualizacion = getField(/FECHA\s*(?:DE\s*)?ACTUALIZACI[ÓO]N\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    const diagnosticoEspecificaciones = getField(/DIAGN[ÓO]STICO\s*[:\-]?\s*([\s\S]*?)(?=FECHA\s*[:\-]?|A CONTINUACI[ÓO]N|ESTRATEGIAS|Criterio|Observaciones|CONTACTO|$)/i);
    const antecedentesEducacionSuperior = getField(/A\s+continuaci[óo]n,\s*se\s+contextualiza\s+la\s+condici[óo]n\s+del\s+estudiante\s*[:\-]?\s*([\s\S]*?)(?=A\s+partir\s+de\s+lo\s+anterior|ajustes\s+razonables|Criterio\s+Estrategias|Observaciones|CONTACTO|$)/i);
    const observaciones = getField(/Observaciones\s*[:\-]?\s*([\s\S]*?)(?=CONTACTO|Si\s+tiene\s+alguna\s+consulta|Correo\s+electr[óo]nico|Anexo|Direcci[óo]n|$)/i);
    const contacto = getField(/CONTACTO\s*([\s\S]*?)(?=$)/i);

    const ajustesRazonables = this.parseAjustesRazonables(this.getAjustesSection(normalizedText));

    return {
      nombre,
      rut,
      carrera,
      anoIngreso,
      fechaIngreso,
      fechaActualizacion,
      antecedentesEducacionSuperior,
      diagnosticoEspecificaciones,
      observaciones,
      contacto,
      ajustesRazonables,
      ajustesPresentacion: [],
      ajustesOrganizacion: [],
      ajustesAmbienteAprendizaje: []
    };
  }

  private populateAjustesPorSubseccion(data: NonNullable<typeof this.extractedData>): void {
    // Clasifica estrategias por categoria para poder contarlas en los graficos.
    for (const ajuste of data.ajustesRazonables) {
      const criterio = this.normalizeForSearch(ajuste.criterio);
      if (criterio.includes('presentaci') || criterio.includes('representaci') || criterio.includes('informacion')) {
        data.ajustesPresentacion = [...data.ajustesPresentacion, ...ajuste.estrategias];
      } else if (criterio.includes('organizaci') || criterio.includes('tiempo') || criterio.includes('horario')) {
        data.ajustesOrganizacion = [...data.ajustesOrganizacion, ...ajuste.estrategias];
      } else if (criterio.includes('entorno') || criterio.includes('ambiente') || criterio.includes('aprendizaje')) {
        data.ajustesAmbienteAprendizaje = [...data.ajustesAmbienteAprendizaje, ...ajuste.estrategias];
      }
    }
  }

  private getAjustesSection(text: string): string {
    const startMatch = text.match(/(?:Ajustes\s+razonables|Criterio\s+Estrategias|Estrategias\s+de\s+apoyo|A\s+continuaci[óo]n)/i);
    const startIndex = startMatch?.index ?? 0;
    const sliced = text.slice(startIndex);
    const endMatch = sliced.match(/\s(?:Observaciones|Contacto|Anexo|Direcci[óo]n|Firma|Responsable)\b/i);

    return endMatch?.index ? sliced.slice(0, endMatch.index) : sliced;
  }

  private parseAjustesRazonables(text: string): { criterio: string; estrategias: string[] }[] {
    const cleaned = this.normalizePdfText(text)
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t\u00A0]+/g, ' ')
      .replace(/\r\n|\r|\n/g, ' ')
      .replace(/(?:Ajustes\s+razonables|Criterio\s*Estrategias|Estrategias\s+de\s+apoyo)/gi, ' ')
      .trim();

    const criterioPattern = this.getCriterioPattern();
    const headingRegex = new RegExp(criterioPattern, 'gi');
    const headings = Array.from(cleaned.matchAll(headingRegex));
    // Cuando hay encabezados claros, cada bloque se interpreta como un criterio.
    const ajustes = headings.map((match, index) => {
      const criterio = match[0].trim();
      const contentStart = (match.index || 0) + match[0].length;
      const contentEnd = headings[index + 1]?.index ?? cleaned.length;
      const estrategias = this.parseEstrategias(cleaned.slice(contentStart, contentEnd));

      return { criterio, estrategias };
    }).filter(ajuste => ajuste.estrategias.length > 0 && !this.isHiddenAjusteCriterion(ajuste.criterio));

    if (ajustes.length > 0) {
      return ajustes;
    }

    // Fallback para PDFs donde el texto llega sin encabezados de criterio reconocibles.
    const estrategias = this.parseEstrategias(cleaned);
    return estrategias.length ? [{ criterio: 'Ajustes razonables', estrategias }] : [];
  }

  private parseEstrategias(text: string): string[] {
    const cleaned = text
      .replace(/\*\*|\*|__|_/g, ' ')
      .replace(/&#x09;/gi, ' ')
      .replace(/\b(?:Criterio|Estrategias?)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned
      .split(/\s+(?:[-–•]|\d+[.)])\s+/)
      .map(item => item.replace(/^\s*(?:[-–•]|\d+[.)])\s*/, '').trim())
      .map(item => this.removeLeakedCategoryText(item))
      .map(item => item.replace(/\s{2,}/g, ' '))
      .filter(item => item.length > 3 && !this.isHiddenAjusteStrategy(item));
  }

  private isHiddenAjusteCriterion(value: string): boolean {
    if (value.trim() === 'entorno') {
      return true;
    }

    if (value.trim() === 'organización' || value.trim() === 'organizacion') {
      return true;
    }

    const normalized = this.normalizeForSearch(value).replace(/[^a-z0-9]/g, '');
    return normalized === 'ajustesrazonables' || normalized === 'criterio' || normalized === 'estrategias';
  }

  private isHiddenAjusteStrategy(value: string): boolean {
    const normalized = this.normalizeForSearch(value).replace(/[^a-z0-9]/g, '');
    return normalized === 'ajustesrazonables' || normalized === 'criterio' || normalized === 'estrategias' || normalized === 'entorno';
  }

  private getCriterioPattern(): string {
    const presentacion = '\\bPresentaci(?:[óo]n|\\s*n)\\b(?:\\s+y\\s+\\brepresentaci(?:[óo]n|\\s*n)\\b(?:\\s+de\\s+la\\s+\\binformaci(?:[óo]n|\\s*n)\\b)?)?';
    const representacion = '\\bRepresentaci(?:[óo]n|\\s*n)\\b\\s+de\\s+la\\s+\\binformaci(?:[óo]n|\\s*n)\\b';
    const entorno = '\\bEntorno\\b';
    const ambienteAprendizaje = '\\bAmbiente\\b\\s+de\\s+\\bAprendizaje\\b';
    const organizacion = '\\bOrganizaci(?:[óo]n|\\s*n)\\b(?:\\s+del\\s+\\btiempo\\b(?:\\s+y\\s+(?:el\\s+)?\\bhorario\\b)?)?';
    const tiempo = '\\bTiempo\\b\\s+y\\s+(?:el\\s+)?\\bhorario\\b';

    return `(${presentacion}|${representacion}|${entorno}|${ambienteAprendizaje}|${organizacion}|${tiempo})`;
  }

  private removeLeakedCategoryText(value: string): string {
    const categoryRegex = new RegExp(`\\s+${this.getCriterioPattern()}(?:\\s*[:\\-–])?[\\s\\S]*$`, 'i');
    return value.replace(categoryRegex, '').trim();
  }

  downloadFile(file: UploadedFile) {
    // Crear un elemento <a> temporal para descargar el archivo
    const link = document.createElement('a');
    link.href = file.data;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  closeViewer() {
    this.selectedFile = null;
    this.extractedData = null;
    this.pdfReadError = '';
    this.showFullHistory = false;
  }
}
