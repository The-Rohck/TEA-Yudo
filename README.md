# TEA-Yudo

TEA-Yudo es una aplicacion para gestionar fichas PDF de estudiantes, asociarlas a cursos y profesores, y revisar informacion relevante como diagnosticos, ajustes razonables, historial y graficos generales.

## Primer uso

1. Inicia la aplicacion y entra desde la pantalla de inicio de sesion.
2. Usa una de las cuentas locales de prueba:
   - Administradora: `Karla Carreño` / `123456`
   - Docente: `docente` / `123456`
3. Si entras como administradora, comienza creando la estructura basica desde `Opciones`:
   - Agrega profesores.
   - Agrega cursos.
   - Asocia cada curso con su profesor correspondiente.
4. Luego sube una o varias fichas PDF desde `Opciones > Agregar ficha` o desde la pantalla `Cargar Ficha`.
5. Revisa las fichas desde `Visualizar Fichas`. Puedes entrar por profesor, curso o estudiante para ver los datos extraidos del PDF.
6. Si una ficha corresponde a un estudiante que cursa varias asignaturas, usa `Asociar cursos` para vincularlo con los cursos necesarios.
7. Consulta los graficos generales para ver resumenes por curso, diagnostico y categorias de ajustes.

## Roles disponibles

La cuenta administradora puede registrar profesores, crear cursos, asociar profesores con cursos, subir fichas, editar fichas, revisar registros de correos y desafiliar profesores.

La cuenta docente puede revisar las fichas y cursos asociados a su usuario, pero no puede administrar la estructura general del sistema.

## Recomendaciones

- Sube solamente archivos PDF.
- Crea al menos un curso antes de intentar cargar fichas.
- Registra profesores antes de asociarlos a cursos.
- Manten las fichas actualizadas usando la opcion `Editar` cuando necesites cambiar metadatos o agregar nuevos PDF.
- Usa `Cerrar sesion` al terminar, especialmente si compartes el equipo.

## Ejecutar en desarrollo

Instala las dependencias y levanta el servidor de desarrollo:

```bash
npm install
npm start
```

Luego abre `http://localhost:4200/` en el navegador.
