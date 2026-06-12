const db = require('../src/db');

// Script de migracion para mover datos desde tablas app_* antiguas al esquema oficial.
async function tableExists(tableName) {
  // Consulta information_schema para que el script pueda ejecutarse en bases con estados distintos.
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  return rows[0].total > 0;
}

async function columnExists(tableName, columnName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName]
  );
  return rows[0].total > 0;
}

async function tryQuery(sql, params = []) {
  try {
    await db.query(sql, params);
  } catch (error) {
    // Errores esperados en migraciones repetibles: significan que el cambio ya fue aplicado.
    if (![
      'ER_DUP_FIELDNAME',
      'ER_DUP_KEYNAME',
      'ER_CANT_DROP_FIELD_OR_KEY',
      'ER_BAD_FIELD_ERROR',
      'ER_NO_SUCH_TABLE',
      'ER_FK_COLUMN_CANNOT_CHANGE',
      'ER_FK_COLUMN_CANNOT_CHANGE_CHILD',
      'ER_CANNOT_ADD_FOREIGN',
      'ER_DUP_ENTRY'
    ].includes(error.code)) {
      throw error;
    }
  }
}

async function prepareTargetTables() {
  // Prepara el esquema oficial antes de mover datos desde las tablas app_* antiguas.
  await tryQuery('ALTER TABLE usuarios DROP FOREIGN KEY fk_usuario_asignatura_usuarios');
  await tryQuery('ALTER TABLE usuario_asignatura DROP FOREIGN KEY fk_usuario_asignatura_usuarios');
  await tryQuery('ALTER TABLE usuarios MODIFY rut VARCHAR(15)');
  await tryQuery('ALTER TABLE usuario_asignatura MODIFY usuario_rut VARCHAR(15)');
  await tryQuery(`
    ALTER TABLE usuario_asignatura
    ADD CONSTRAINT fk_usuario_asignatura_usuarios
      FOREIGN KEY (usuario_rut)
      REFERENCES usuarios(rut)
      ON UPDATE CASCADE
      ON DELETE CASCADE
  `);

  if (!(await columnExists('usuarios', 'mail'))) {
    await db.query('ALTER TABLE usuarios ADD COLUMN mail VARCHAR(150) NULL UNIQUE');
  }

  if (!(await columnExists('asignaturas', 'profesor_rut'))) {
    await db.query('ALTER TABLE asignaturas ADD COLUMN profesor_rut VARCHAR(15) NULL');
  }

  await tryQuery(`
    CREATE TABLE IF NOT EXISTS usuario_asignatura (
      usuario_rut VARCHAR(15) NOT NULL,
      asignatura_id VARCHAR(10) NOT NULL,
      PRIMARY KEY (usuario_rut, asignatura_id)
    )
  `);
  await tryQuery('ALTER TABLE usuario_asignatura MODIFY usuario_rut VARCHAR(15)');

  if (!(await columnExists('fichas', 'data'))) {
    await db.query('ALTER TABLE fichas ADD COLUMN data LONGTEXT NULL');
  }

  if (!(await columnExists('fichas', 'tipo'))) {
    await db.query('ALTER TABLE fichas ADD COLUMN tipo VARCHAR(150) NULL');
  }

  if (!(await columnExists('fichas', 'curso'))) {
    await db.query('ALTER TABLE fichas ADD COLUMN curso VARCHAR(300) NULL');
  }

  if (!(await columnExists('fichas', 'historial'))) {
    await db.query('ALTER TABLE fichas ADD COLUMN historial LONGTEXT NULL');
  }

  await tryQuery(`
    INSERT IGNORE INTO carreras (id_codigo, nombre)
    VALUES ('SINCAR', 'Sin carrera')
  `);

  await tryQuery(`
    INSERT IGNORE INTO diagnosticos (id_codigo, nombre, contexto_diagnostico, ajustes_pedagogicos)
    VALUES ('SINDIAG', 'Sin diagnostico', '', '')
  `);
}

async function migrateTeachers() {
  if (!(await tableExists('app_profesores'))) {
    return 0;
  }

  // Los profesores antiguos pasan a usuarios con tipo_usuario 2.
  const [rows] = await db.query('SELECT rut, nombre, mail FROM app_profesores');

  for (const teacher of rows) {
    await db.query(
      `INSERT INTO usuarios (rut, tipo_usuario, contrasena, nombre, mail)
       VALUES (?, 2, '123456', ?, ?)
       ON DUPLICATE KEY UPDATE
         nombre = VALUES(nombre),
         mail = VALUES(mail)`,
      [teacher.rut, teacher.nombre, teacher.mail]
    );
  }

  return rows.length;
}

async function migrateCourses() {
  if (!(await tableExists('app_cursos'))) {
    return 0;
  }

  const [rows] = await db.query('SELECT nombre, profesor_rut FROM app_cursos');

  for (const course of rows) {
    // El id deterministico reduce el riesgo de duplicados si la migracion se repite.
    const idCodigo = `AS${Buffer.from(course.nombre).toString('hex')}`.slice(0, 10);
    await db.query(
      `INSERT INTO asignaturas (id_codigo, nombre, nombre_docente, profesor_rut)
       VALUES (?, ?, '', ?)
       ON DUPLICATE KEY UPDATE
         nombre = VALUES(nombre),
         profesor_rut = VALUES(profesor_rut)`,
      [idCodigo, course.nombre, course.profesor_rut || null]
    );

    await db.query('DELETE FROM usuario_asignatura WHERE asignatura_id = ?', [idCodigo]);

    if (course.profesor_rut) {
      await db.query(
        `INSERT IGNORE INTO usuario_asignatura (usuario_rut, asignatura_id)
         VALUES (?, ?)`,
        [course.profesor_rut, idCodigo]
      );
    }
  }

  return rows.length;
}

async function migrateFiles() {
  if (!(await tableExists('app_archivos'))) {
    return 0;
  }

  const [rows] = await db.query('SELECT id, nombre, data, tipo, curso, fecha, historial FROM app_archivos');

  for (const file of rows) {
    // Cada archivo migrado queda asociado a un estudiante marcador para cumplir las FK.
    const fichaId = `FI${Buffer.from(`${file.id}-${file.nombre}-${file.curso}`).toString('hex')}`.slice(0, 10);
    const estudianteRut = `M${Buffer.from(String(file.id)).toString('hex')}`.slice(0, 10);

    await db.query(
      `INSERT IGNORE INTO estudiantes (rut, nombre, anio_ingreso, carrera_id)
       VALUES (?, 'Migrado desde archivo', YEAR(CURDATE()), 'SINCAR')`,
      [estudianteRut]
    );

    await db.query(
      `INSERT INTO fichas (
        id_codigo,
        rut_estudiante,
        carrera_estudiante,
        diagnostico_id,
        fecha_actualizacion,
        pdf,
        data,
        tipo,
        curso,
        historial
      )
      VALUES (?, ?, 'SINCAR', 'SINDIAG', ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        fecha_actualizacion = VALUES(fecha_actualizacion),
        pdf = VALUES(pdf),
        data = VALUES(data),
        tipo = VALUES(tipo),
        curso = VALUES(curso),
        historial = VALUES(historial)`,
      [
        fichaId,
        estudianteRut,
        file.fecha,
        file.nombre,
        file.data,
        file.tipo,
        file.curso,
        file.historial || '[]'
      ]
    );
  }

  return rows.length;
}

async function dropLegacyTables() {
  // Al finalizar se eliminan las tablas temporales para que el backend use solo el modelo oficial.
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  await tryQuery('DROP TABLE IF EXISTS app_archivos');
  await tryQuery('DROP TABLE IF EXISTS app_cursos');
  await tryQuery('DROP TABLE IF EXISTS app_profesores');
  await db.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function main() {
  await prepareTargetTables();
  const teachers = await migrateTeachers();
  const courses = await migrateCourses();
  const files = await migrateFiles();
  await dropLegacyTables();

  console.log(`Migracion completada: ${teachers} profesores, ${courses} cursos, ${files} archivos.`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
