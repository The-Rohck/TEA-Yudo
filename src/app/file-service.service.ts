import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

// Representa una ficha PDF persistida localmente y en la API.
export interface UploadedFile {
  name: string;
  data: string;
  type: string;
  course?: string;
  date?: string;
  studentRut?: string;
  history?: FileHistoryEntry[];
}

export interface FileHistoryEntry {
  action: string;
  date: string;
  description: string;
}

export type SaveFileResult = 'created' | 'replaced' | 'skipped';

@Injectable({
  providedIn: 'root'
})
export class FileServiceService {
  // Las fichas se mantienen en localStorage como respaldo y se sincronizan con la API.
  private storageKey = 'uploadedFiles';
  private apiUrl = 'http://localhost:3000/api/app/archivos';
  private removedExampleFileNames = new Set([
    'ejemplo fop caso baja vision.pdf',
    'ejemplo fop caso tdah.pdf',
    'ejemplo fop caso tea.pdf'
  ]);

  constructor(private http: HttpClient) { }

  async loadFilesFromApi(): Promise<void> {
    const localFiles = this.getFiles();
    const files = await firstValueFrom(this.http.get<UploadedFile[]>(this.apiUrl));

    // Si la base aun esta vacia, se migra el respaldo local para no perder fichas existentes.
    if (files.length === 0 && localFiles.length > 0) {
      for (const file of localFiles) {
        await this.saveFileToApi(file);
      }
      return;
    }

    localStorage.setItem(this.storageKey, JSON.stringify(this.removeDuplicateFiles(files)));
  }

  saveFile(file: File, course: string = 'Sin curso', replaceExisting: boolean = false): Promise<SaveFileResult> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const files = this.getFiles();
          const normalizedCourse = course.trim() || 'Sin curso';
          // Una ficha solo puede guardarse una vez, aunque se intente asociarla a otro curso.
          const existingFileIndex = files.findIndex(item =>
            this.normalizeFileNameKey(item.name) === this.normalizeFileNameKey(file.name)
          );
          const savedFile: UploadedFile = {
            name: file.name,
            data: reader.result as string,
            type: file.type,
            course: normalizedCourse,
            date: new Date().toISOString().slice(0, 10),
            history: [
              {
                action: 'Creacion',
                date: new Date().toISOString(),
                description: `Ficha subida en el curso ${normalizedCourse}.`
              }
            ]
          };

          if (existingFileIndex !== -1) {
            if (!replaceExisting) {
              resolve('skipped');
              return;
            }

            // Al reemplazar se conserva el historial previo y se agrega el nuevo evento.
            const currentFile = files[existingFileIndex];
            files[existingFileIndex] = {
              ...savedFile,
              history: [
                ...(currentFile.history || []),
                {
                  action: 'Reemplazo',
                  date: new Date().toISOString(),
                  description: `PDF reemplazado por ${file.name}.`
                }
              ]
            };
            await this.saveFileToApi(files[existingFileIndex]);
            const uniqueFiles = this.removeDuplicateFiles(files);
            localStorage.setItem(this.storageKey, JSON.stringify(uniqueFiles));
            resolve('replaced');
            return;
          }

          files.push(savedFile);
          await this.saveFileToApi(savedFile);
          localStorage.setItem(this.storageKey, JSON.stringify(this.removeDuplicateFiles(files)));
          resolve('created');
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  getFiles(): UploadedFile[] {
    const stored = localStorage.getItem(this.storageKey);
    const files: UploadedFile[] = stored ? JSON.parse(stored) : [];
    // Los PDF de ejemplo ya no forman parte de la experiencia real del sistema.
    const activeFiles = files.filter(file => !this.isRemovedExampleFile(file.name));
    const filesWithCourse = activeFiles.map(file => ({
      ...file,
      course: file.course || 'Sin curso',
      date: file.date || new Date().toISOString().slice(0, 10),
      history: file.history || [
        {
          action: 'Creacion',
          date: new Date().toISOString(),
          description: `Ficha registrada en el curso ${file.course || 'Sin curso'}.`
        }
      ]
    }));
    const uniqueFiles = this.removeDuplicateFiles(filesWithCourse);
    if (uniqueFiles.length !== files.length || activeFiles.some(file => !file.course)) {
      localStorage.setItem(this.storageKey, JSON.stringify(uniqueFiles));
    }
    return uniqueFiles;
  }

  async deleteFile(index: number) {
    const files = this.getFiles();
    const [deletedFile] = files.splice(index, 1);
    localStorage.setItem(this.storageKey, JSON.stringify(files));
    if (deletedFile) {
      await firstValueFrom(this.http.delete<void>(this.getFileUrl(deletedFile.name, deletedFile.course || 'Sin curso')));
    }
  }

  async updateFile(index: number, changes: Pick<UploadedFile, 'name' | 'course' | 'date'>): Promise<void> {
    const files = this.getFiles();

    if (!files[index]) {
      return;
    }

    const currentFile = files[index];
    const newName = changes.name.trim();
    const newCourse = changes.course?.trim() || 'Sin curso';
    const newDate = changes.date || currentFile.date || new Date().toISOString().slice(0, 10);
    const updates: string[] = [];

    // El historial deja trazabilidad legible de los campos que realmente cambiaron.
    if (currentFile.name !== newName) {
      updates.push(`nombre: ${currentFile.name} -> ${newName}`);
    }

    if ((currentFile.course || 'Sin curso') !== newCourse) {
      updates.push(`curso: ${currentFile.course || 'Sin curso'} -> ${newCourse}`);
    }

    if ((currentFile.date || '') !== newDate) {
      updates.push(`fecha: ${currentFile.date || 'Sin fecha'} -> ${newDate}`);
    }

    const updatedFile = {
      ...files[index],
      name: newName,
      course: newCourse,
      date: newDate,
      history: [
        ...(currentFile.history || []),
        {
          action: 'Actualizacion',
          date: new Date().toISOString(),
          description: updates.length ? updates.join('; ') : 'Ficha actualizada sin cambios visibles.'
        }
      ]
    };
    files[index] = updatedFile;

    localStorage.setItem(this.storageKey, JSON.stringify(this.removeDuplicateFiles(files)));
    await firstValueFrom(this.http.put<void>(
      this.getFileUrl(currentFile.name, currentFile.course || 'Sin curso'),
      updatedFile
    ));
  }

  cleanDuplicateFiles(): void {
    const files = this.getFiles();
    localStorage.setItem(this.storageKey, JSON.stringify(files));
  }

  private removeDuplicateFiles(files: UploadedFile[]) {
    const seenKeys = new Set<string>();
    return files.filter(file => {
      // El nombre identifica la ficha aunque una copia heredada tenga otro curso.
      const fileKey = this.normalizeFileNameKey(file.name);

      if (seenKeys.has(fileKey)) {
        return false;
      }

      seenKeys.add(fileKey);
      return true;
    });
  }

  private normalizeFileNameKey(fileName: string): string {
    return fileName
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  private normalizeCourseKey(courseName: string): string {
    return courseName
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  private isRemovedExampleFile(fileName: string): boolean {
    return this.removedExampleFileNames.has(this.normalizeFileNameKey(fileName));
  }

  private saveFileToApi(file: UploadedFile): Promise<UploadedFile> {
    return firstValueFrom(this.http.post<UploadedFile>(this.apiUrl, file));
  }

  private getFileUrl(fileName: string, course: string): string {
    return `${this.apiUrl}/${encodeURIComponent(fileName)}/${encodeURIComponent(course)}`;
  }
}
