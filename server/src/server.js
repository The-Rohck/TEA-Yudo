const cors = require('cors');
const crypto = require('crypto');
const express = require('express');
const nodemailer = require('nodemailer');
require('dotenv').config();

const db = require('./db');

// API local que conecta el frontend Angular con la base de datos TEA-yudo.
const app = express();
const port = Number(process.env.PORT || 3000);
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
const smtpFrom = process.env.SMTP_FROM || 'soporte@teayudocl.com';
const smtpTransporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD || ''
          }
        : undefined
    })
  : null;
const fichaAssignmentEmail = `Estimado/a Profesor/a:

Junto con saludar, le informamos que se le ha asignado una nueva ficha de PUCV Inclusiva correspondiente a un/a estudiante de su curso que requiere la implementación de ajustes razonables para favorecer su participación y proceso de aprendizaje.

Le solicitamos ingresar a la plataforma TEA-Yudo PUCV para revisar los antecedentes y recomendaciones contenidos en la ficha, con el fin de apoyar la adecuada implementación de las medidas sugeridas en el contexto de su asignatura.

En caso de requerir orientación o tener consultas respecto de los ajustes recomendados, puede contactar  en primer lugar a la tutora de la Escuela de Ingenieria  Informática y de ser necesario al equipo de PUCV Inclusiva a través de los canales institucionales correspondientes.

Agradecemos su colaboración y compromiso con el desarrollo de una educación inclusiva. Este mensaje ha sido generado de forma automática. Por favor no responder este mensaje.`;

// El frontend corre normalmente en Angular dev server, pero se puede cambiar por variable de entorno.
app.use(cors({
  origin: frontendUrl
}));
// El PDF viaja codificado en Base64, por lo que ocupa mas que el archivo original.
app.use(express.json({ limit: '50mb' }));

async function tryQuery(sql) {
  try {
    await db.query(sql);
  } catch (error) {
    if (![
      'ER_DUP_FIELDNAME',
      'ER_DUP_KEYNAME',
      'ER_CANT_DROP_FIELD_OR_KEY',
      'ER_BAD_FIELD_ERROR',
      'ER_NO_SUCH_TABLE',
      'ER_FK_COLUMN_CANNOT_CHANGE',
      'ER_FK_COLUMN_CANNOT_CHANGE_CHILD',
      'ER_CANNOT_ADD_FOREIGN',
      'ER_DUP_ENTRY',
      'ER_SPECIFIC_ACCESS_DENIED_ERROR',
      'ER_ACCESS_DENIED_ERROR'
    ].includes(error.code)) {
      throw error;
    }
  }
}

function createCode(prefix) {
  // Genera codigos cortos compatibles con las llaves VARCHAR(10) del esquema heredado.
  return `${prefix}${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 10);
}

function createSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function isPlaceholderStudentRut(rut) {
  return !rut || rut === '00000000-0' || /^M\d+$/i.test(rut);
}

async function createTeacherInternalRut() {
  // usuarios.rut sigue siendo la llave interna aunque el profesor no informe un RUT real.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const internalRut = createCode('DOC');
    const [users] = await db.query('SELECT rut FROM usuarios WHERE rut = ? LIMIT 1', [internalRut]);

    if (users.length === 0) {
      return internalRut;
    }
  }

  throw new Error('No se pudo generar el identificador interno del profesor.');
}

async function ensureApplicationColumns() {
  // Ajusta el esquema base para soportar la aplicacion actual sin exigir migraciones manuales.
  // LONGTEXT permite guardar PDFs grandes, pero MySQL puede traer un limite global muy bajo.
  await tryQuery('SET GLOBAL max_allowed_packet = 67108864');
  await tryQuery('ALTER TABLE usuarios MODIFY rut VARCHAR(15)');
  await tryQuery('ALTER TABLE usuarios ADD COLUMN mail VARCHAR(150) NULL UNIQUE');
  await tryQuery('ALTER TABLE usuarios ADD COLUMN invitacion_confirmada TINYINT(1) NOT NULL DEFAULT 0');

  await tryQuery('ALTER TABLE asignaturas ADD COLUMN profesor_rut VARCHAR(15) NULL');
  await tryQuery('ALTER TABLE asignaturas ADD INDEX idx_asignaturas_nombre (nombre)');
  await tryQuery('ALTER TABLE asignaturas ADD INDEX idx_asignaturas_profesor (profesor_rut)');
  await tryQuery(`
    CREATE TABLE IF NOT EXISTS usuario_asignatura (
      usuario_rut VARCHAR(15) NOT NULL,
      asignatura_id VARCHAR(10) NOT NULL,
      PRIMARY KEY (usuario_rut, asignatura_id)
    )
  `);
  await tryQuery('ALTER TABLE usuario_asignatura MODIFY usuario_rut VARCHAR(15)');
  await tryQuery(`
    CREATE TABLE IF NOT EXISTS estudiante_asignatura (
      estudiante_rut VARCHAR(10) NOT NULL,
      asignatura_id VARCHAR(10) NOT NULL,
      PRIMARY KEY (estudiante_rut, asignatura_id)
    )
  `);
  await tryQuery(`
    CREATE TABLE IF NOT EXISTS correo_notificaciones (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      curso VARCHAR(300) NOT NULL,
      remitente VARCHAR(300) NOT NULL,
      destinatario VARCHAR(300) NULL,
      estado VARCHAR(30) NOT NULL,
      detalle VARCHAR(500) NULL,
      PRIMARY KEY (id)
    )
  `);
  await tryQuery(`
    CREATE TABLE IF NOT EXISTS profesor_invitaciones (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      usuario_rut VARCHAR(15) NOT NULL,
      token VARCHAR(128) NOT NULL,
      fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_expiracion DATETIME NOT NULL,
      fecha_usado DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_profesor_invitaciones_token (token),
      INDEX idx_profesor_invitaciones_usuario (usuario_rut)
    )
  `);

  await tryQuery('ALTER TABLE fichas MODIFY rutEstudiante VARCHAR(15) NULL');
  await tryQuery('ALTER TABLE fichas MODIFY rut_estudiante VARCHAR(15) NULL');
  await tryQuery('ALTER TABLE fichas MODIFY carreraEstudiante VARCHAR(10) NULL');
  await tryQuery('ALTER TABLE fichas MODIFY carrera_estudiante VARCHAR(10) NULL');
  await tryQuery('ALTER TABLE fichas MODIFY diagnostico VARCHAR(10) NULL');
  await tryQuery('ALTER TABLE fichas MODIFY diagnostico_id VARCHAR(10) NULL');
  await tryQuery('ALTER TABLE fichas MODIFY FechaActualizacion DATE NULL');
  await tryQuery('ALTER TABLE fichas MODIFY fecha_actualizacion DATE NULL');
  await tryQuery('ALTER TABLE fichas ADD COLUMN data LONGTEXT NULL');
  await tryQuery('ALTER TABLE fichas ADD COLUMN tipo VARCHAR(150) NULL');
  await tryQuery('ALTER TABLE fichas ADD COLUMN curso VARCHAR(300) NULL');
  await tryQuery('ALTER TABLE fichas ADD COLUMN historial LONGTEXT NULL');
  // Una persona puede tener mas de una ficha y las cargas iniciales usan un estudiante marcador.
  await tryQuery('ALTER TABLE fichas ADD INDEX idx_fichas_estudiante (rut_estudiante)');
  await tryQuery('ALTER TABLE fichas DROP INDEX uq_fichas_estudiante');
  // Conserva una sola copia de cada ficha heredada antes de aplicar la restriccion.
  await tryQuery(`
    DELETE duplicate
    FROM fichas duplicate
    INNER JOIN fichas keeper
      ON duplicate.pdf = keeper.pdf
     AND (
       CASE
         WHEN duplicate.rut_estudiante IS NULL OR duplicate.rut_estudiante = '00000000-0' THEN 0
         WHEN duplicate.rut_estudiante LIKE 'M%' THEN 1
         ELSE 2
       END
       <
       CASE
         WHEN keeper.rut_estudiante IS NULL OR keeper.rut_estudiante = '00000000-0' THEN 0
         WHEN keeper.rut_estudiante LIKE 'M%' THEN 1
         ELSE 2
       END
       OR (
         CASE
           WHEN duplicate.rut_estudiante IS NULL OR duplicate.rut_estudiante = '00000000-0' THEN 0
           WHEN duplicate.rut_estudiante LIKE 'M%' THEN 1
           ELSE 2
         END
         =
         CASE
           WHEN keeper.rut_estudiante IS NULL OR keeper.rut_estudiante = '00000000-0' THEN 0
           WHEN keeper.rut_estudiante LIKE 'M%' THEN 1
           ELSE 2
         END
         AND duplicate.id_codigo > keeper.id_codigo
       )
     )
  `);
  await tryQuery('ALTER TABLE fichas ADD UNIQUE INDEX uq_fichas_pdf (pdf(191))');
  await tryQuery('ALTER TABLE fichas ADD INDEX idx_fichas_pdf_curso (pdf(191), curso(191))');

  await tryQuery(`
    INSERT IGNORE INTO carreras (id_codigo, nombre)
    VALUES ('SINCAR', 'Sin carrera')
  `);
  await tryQuery(`
    INSERT IGNORE INTO diagnosticos (id_codigo, nombre, contexto_diagnostico, ajustes_pedagogicos)
    VALUES ('SINDIAG', 'Sin diagnostico', '', '')
  `);
  await tryQuery(`
    INSERT IGNORE INTO estudiantes (rut, nombre, anio_ingreso, carrera_id)
    VALUES ('00000000-0', 'Sin estudiante', YEAR(CURDATE()), 'SINCAR')
  `);
}

async function syncCourseTeacher(asignaturaId, profesorRut) {
  // La relacion se guarda tanto en asignaturas.profesor_rut como en la tabla puente.
  await db.query(
    'DELETE FROM usuario_asignatura WHERE asignatura_id = ?',
    [asignaturaId]
  );

  if (profesorRut) {
    await db.query(
      `INSERT IGNORE INTO usuario_asignatura (usuario_rut, asignatura_id)
       VALUES (?, ?)`,
      [profesorRut, asignaturaId]
    );
  }
}

async function notifyCourseTeacherOfNewFicha(course) {
  const [teachers] = await db.query(
    `SELECT DISTINCT u.mail
     FROM asignaturas a
     INNER JOIN usuarios u ON u.rut = a.profesor_rut
     WHERE a.nombre = ? AND COALESCE(u.mail, '') <> ''`,
    [course]
  );

  if (teachers.length === 0) {
    const detail = `El curso "${course}" no tiene un profesor con mail asociado.`;
    await logEmailNotification(course, null, 'no_enviado', detail);
    console.warn(`No se envio correo: ${detail}`);
    return;
  }

  if (!smtpTransporter) {
    const detail = 'Falta configurar SMTP_HOST en server/.env.';
    await Promise.all(teachers.map(teacher =>
      logEmailNotification(course, teacher.mail, 'no_enviado', detail)
    ));
    console.warn(`No se envio correo: ${detail}`);
    return;
  }

  await Promise.all(teachers.map(async teacher => {
    try {
      const info = await smtpTransporter.sendMail({
        from: smtpFrom,
        to: teacher.mail,
        subject: 'Nueva ficha asignada - TEA-Yudo PUCV',
        text: fichaAssignmentEmail
      });
      await logEmailNotification(course, teacher.mail, 'enviado', info.messageId || null);
    } catch (error) {
      await logEmailNotification(course, teacher.mail, 'error', error.message);
      throw error;
    }
  }));
}

async function logEmailNotification(course, recipient, status, detail) {
  await db.query(
    `INSERT INTO correo_notificaciones (curso, remitente, destinatario, estado, detalle)
     VALUES (?, ?, ?, ?, ?)`,
    [course, smtpFrom, recipient, status, detail]
  );
}

async function createTeacherInvitation(teacherRut) {
  const token = createSecureToken();
  const expiresAt = addDays(new Date(), 7);

  await db.query(
    `INSERT INTO profesor_invitaciones (usuario_rut, token, fecha_expiracion)
     VALUES (?, ?, ?)`,
    [teacherRut, token, expiresAt]
  );

  return token;
}

async function sendTeacherInvitationEmail(teacher) {
  const token = await createTeacherInvitation(teacher.rut);
  const invitationLink = `${frontendUrl.replace(/\/$/, '')}/confirmar-profesor?token=${encodeURIComponent(token)}`;
  const logCourse = 'Invitacion profesor';

  if (!smtpTransporter) {
    const detail = `Falta configurar SMTP_HOST en server/.env. Enlace de invitacion: ${invitationLink}`;
    await logEmailNotification(logCourse, teacher.mail, 'no_enviado', detail);
    console.warn(`No se envio invitacion de profesor: ${detail}`);
    return { sent: false, detail };
  }

  const text = `Estimado/a ${teacher.fullName}:

Se ha creado una cuenta docente para usted en TEA-Yudo PUCV.

Para confirmar la cuenta y crear su contrasena, ingrese al siguiente enlace:
${invitationLink}

Este enlace vence en 7 dias. Si usted no esperaba este correo, puede ignorarlo.

Este mensaje ha sido generado de forma automatica. Por favor no responder este mensaje.`;

  const info = await smtpTransporter.sendMail({
    from: smtpFrom,
    to: teacher.mail,
    subject: 'Confirma tu cuenta docente - TEA-Yudo PUCV',
    text
  });

  await logEmailNotification(logCourse, teacher.mail, 'enviado', info.messageId || null);
  return { sent: true, detail: info.messageId || null };
}

async function ensureCourse(nombre, profesorRut = undefined, requestedId = undefined) {
  // Crea el curso si no existe; si se entrega profesorRut, actualiza tambien la asociacion.
  const [existingCourses] = await db.query(
    'SELECT id_codigo FROM asignaturas WHERE nombre = ? LIMIT 1',
    [nombre]
  );

  if (existingCourses.length > 0) {
    if (requestedId && existingCourses[0].id_codigo !== requestedId) {
      const error = new Error('Ya existe un curso con ese nombre y otro codigo/ID.');
      error.statusCode = 409;
      throw error;
    }

    if (profesorRut !== undefined) {
      await db.query(
        'UPDATE asignaturas SET profesor_rut = ? WHERE id_codigo = ?',
        [profesorRut || null, existingCourses[0].id_codigo]
      );
      await syncCourseTeacher(existingCourses[0].id_codigo, profesorRut || null);
    }
    return existingCourses[0].id_codigo;
  }

  const idCodigo = requestedId || createCode('AS');
  const [coursesWithId] = await db.query(
    'SELECT nombre FROM asignaturas WHERE id_codigo = ? LIMIT 1',
    [idCodigo]
  );

  if (coursesWithId.length > 0) {
    const error = new Error('Ese codigo/ID ya esta asociado a otro curso.');
    error.statusCode = 409;
    throw error;
  }

  await db.query(
    `INSERT INTO asignaturas (id_codigo, nombre, nombre_docente, profesor_rut)
     VALUES (?, ?, '', ?)`,
    [idCodigo, nombre, profesorRut || null]
  );
  await syncCourseTeacher(idCodigo, profesorRut || null);
  return idCodigo;
}

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    res.status(500).json({
      ok: false,
      database: 'error',
      message: error.message
    });
  }
});

app.get('/api/app/profesores', async (req, res) => {
  try {
    // GROUP_CONCAT arma la lista de cursos del profesor en una sola consulta.
    const [teachers] = await db.query(`
      SELECT
        u.nombre AS fullName,
        u.rut,
        COALESCE(u.mail, '') AS mail,
        (
          SELECT GROUP_CONCAT(DISTINCT aa.nombre ORDER BY aa.nombre SEPARATOR '||')
          FROM asignaturas aa
          LEFT JOIN usuario_asignatura ua ON ua.asignatura_id = aa.id_codigo
          WHERE (aa.profesor_rut = u.rut OR ua.usuario_rut = u.rut)
            AND LOWER(TRIM(aa.nombre)) <> 'sin curso'
        ) AS courses
      FROM usuarios u
      WHERE u.tipo_usuario = 2 OR u.tipo_usuario IS NULL
      ORDER BY u.nombre
    `);

    res.json(teachers.map(teacher => ({
      ...teacher,
      courses: teacher.courses ? teacher.courses.split('||').filter(Boolean) : []
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/app/profesores/invitacion/:token', async (req, res) => {
  const token = String(req.params.token || '').trim();

  if (!token) {
    res.status(400).json({ message: 'Token de invitacion obligatorio.' });
    return;
  }

  try {
    const [invitations] = await db.query(
      `SELECT
         pi.token,
         pi.fecha_expiracion AS fechaExpiracion,
         pi.fecha_usado AS fechaUsado,
         u.nombre AS fullName,
         u.mail
       FROM profesor_invitaciones pi
       INNER JOIN usuarios u ON u.rut = pi.usuario_rut
       WHERE pi.token = ?
       LIMIT 1`,
      [token]
    );

    if (invitations.length === 0) {
      res.status(404).json({ message: 'Invitacion no encontrada.' });
      return;
    }

    const invitation = invitations[0];
    const isExpired = invitation.fechaExpiracion && new Date(invitation.fechaExpiracion) < new Date();

    if (invitation.fechaUsado) {
      res.status(409).json({ message: 'Esta invitacion ya fue utilizada.' });
      return;
    }

    if (isExpired) {
      res.status(410).json({ message: 'Esta invitacion ya expiro. Solicita una nueva invitacion.' });
      return;
    }

    res.json({
      fullName: invitation.fullName,
      mail: invitation.mail
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/app/profesores/confirmar-invitacion', async (req, res) => {
  const token = String(req.body.token || '').trim();
  const password = String(req.body.password || '');

  if (!token) {
    res.status(400).json({ message: 'Token de invitacion obligatorio.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ message: 'La contrasena debe tener minimo 6 caracteres.' });
    return;
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [invitations] = await connection.query(
      `SELECT
         pi.id,
         pi.usuario_rut AS rut,
         pi.fecha_expiracion AS fechaExpiracion,
         pi.fecha_usado AS fechaUsado,
         u.nombre AS fullName,
         u.mail
       FROM profesor_invitaciones pi
       INNER JOIN usuarios u ON u.rut = pi.usuario_rut
       WHERE pi.token = ?
       LIMIT 1`,
      [token]
    );

    if (invitations.length === 0) {
      await connection.rollback();
      res.status(404).json({ message: 'Invitacion no encontrada.' });
      return;
    }

    const invitation = invitations[0];
    const isExpired = invitation.fechaExpiracion && new Date(invitation.fechaExpiracion) < new Date();

    if (invitation.fechaUsado) {
      await connection.rollback();
      res.status(409).json({ message: 'Esta invitacion ya fue utilizada.' });
      return;
    }

    if (isExpired) {
      await connection.rollback();
      res.status(410).json({ message: 'Esta invitacion ya expiro. Solicita una nueva invitacion.' });
      return;
    }

    await connection.query(
      `UPDATE usuarios
       SET contrasena = ?, invitacion_confirmada = 1
       WHERE rut = ?`,
      [password, invitation.rut]
    );
    await connection.query(
      'UPDATE profesor_invitaciones SET fecha_usado = NOW() WHERE id = ?',
      [invitation.id]
    );

    await connection.commit();
    res.json({
      fullName: invitation.fullName,
      mail: invitation.mail,
      rut: invitation.rut,
      role: 'docente'
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: error.message });
  } finally {
    connection.release();
  }
});

app.post('/api/app/profesores', async (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  const rut = String(req.body.rut || '').trim();
  const mail = String(req.body.mail || '').trim().toLowerCase();

  if (!fullName) {
    res.status(400).json({ message: 'El nombre completo del profesor es obligatorio.' });
    return;
  }

  if (!mail) {
    res.status(400).json({ message: 'El mail del profesor es obligatorio.' });
    return;
  }

  try {
    const savedRut = rut || await createTeacherInternalRut();
    await db.query(
      `INSERT INTO usuarios (rut, tipo_usuario, contrasena, nombre, mail, invitacion_confirmada)
       VALUES (?, 2, '', ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         nombre = VALUES(nombre),
         mail = VALUES(mail),
         invitacion_confirmada = 0`,
      [savedRut, fullName, mail]
    );
    const [savedTeachers] = await db.query(
      'SELECT rut FROM usuarios WHERE mail = ? LIMIT 1',
      [mail]
    );
    const teacher = { fullName, rut: savedTeachers[0]?.rut || savedRut, mail, courses: [] };
    const invitation = await sendTeacherInvitationEmail(teacher).catch(async error => {
      await logEmailNotification('Invitacion profesor', mail, 'error', error.message);
      console.error(`No se pudo enviar invitacion a "${mail}":`, error.message);
      return { sent: false, detail: error.message };
    });

    res.status(201).json({ ...teacher, invitation });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: 'Ya existe un profesor con ese RUT o mail.' });
      return;
    }

    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/app/profesores/:rut', async (req, res) => {
  const rut = String(req.params.rut || '').trim();

  if (!rut) {
    res.status(400).json({ message: 'El RUT del profesor es obligatorio.' });
    return;
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [teachers] = await connection.query(
      `SELECT rut
       FROM usuarios
       WHERE rut = ? AND (tipo_usuario = 2 OR tipo_usuario IS NULL)
       LIMIT 1`,
      [rut]
    );

    if (teachers.length === 0) {
      await connection.rollback();
      res.status(404).json({ message: 'Profesor no encontrado.' });
      return;
    }

    await connection.query('UPDATE asignaturas SET profesor_rut = NULL WHERE profesor_rut = ?', [rut]);
    await connection.query('DELETE FROM usuario_asignatura WHERE usuario_rut = ?', [rut]);
    await connection.query('DELETE FROM usuarios WHERE rut = ?', [rut]);

    await connection.commit();
    res.status(204).send();
  } catch (error) {
    await connection.rollback();
    console.error('No se pudo desafiliar profesor:', error);
    res.status(500).json({
      message: 'No se pudo desafiliar el profesor en la base de datos.',
      detail: error.message
    });
  } finally {
    connection.release();
  }
});

app.get('/api/app/cursos', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id_codigo AS idCodigo, nombre, profesor_rut AS profesorRut
      FROM asignaturas
      ORDER BY nombre
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/app/correos', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        fecha,
        curso,
        remitente,
        destinatario,
        estado,
        detalle
      FROM correo_notificaciones
      ORDER BY fecha DESC, id DESC
      LIMIT 200
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/app/cursos', async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const idCodigo = String(req.body.idCodigo || '').trim();
  const { profesorRut } = req.body;

  if (!nombre) {
    res.status(400).json({ message: 'El nombre del curso es obligatorio.' });
    return;
  }

  if (idCodigo.length > 10) {
    res.status(400).json({ message: 'El codigo/ID del curso puede tener hasta 10 caracteres.' });
    return;
  }

  try {
    const savedId = await ensureCourse(nombre, profesorRut || null, idCodigo || undefined);
    res.status(201).json({ idCodigo: savedId, nombre, profesorRut: profesorRut || null });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

app.put('/api/app/cursos/:nombre/profesor', async (req, res) => {
  const { profesorRut } = req.body;
  const courseName = req.params.nombre;

  try {
    const [courses] = await db.query(
      'SELECT id_codigo, nombre FROM asignaturas WHERE nombre = ? LIMIT 1',
      [courseName]
    );

    if (courses.length === 0) {
      res.status(404).json({ message: 'Curso no encontrado.' });
      return;
    }

    if (profesorRut) {
      const [teachers] = await db.query(
        `SELECT rut
         FROM usuarios
         WHERE rut = ? AND (tipo_usuario = 2 OR tipo_usuario IS NULL)
         LIMIT 1`,
        [profesorRut]
      );

      if (teachers.length === 0) {
        res.status(404).json({ message: 'Profesor no encontrado.' });
        return;
      }
    }

    await db.query(
      'UPDATE asignaturas SET profesor_rut = ? WHERE id_codigo = ?',
      [profesorRut || null, courses[0].id_codigo]
    );
    await syncCourseTeacher(courses[0].id_codigo, profesorRut || null);

    res.json({ nombre: courses[0].nombre, profesorRut: profesorRut || null });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/app/cursos/:nombre', async (req, res) => {
  try {
    const [courses] = await db.query(
      'SELECT id_codigo FROM asignaturas WHERE nombre = ?',
      [req.params.nombre]
    );

    for (const course of courses) {
      await db.query('DELETE FROM usuario_asignatura WHERE asignatura_id = ?', [course.id_codigo]);
      await db.query('DELETE FROM estudiante_asignatura WHERE asignatura_id = ?', [course.id_codigo]);
    }

    await db.query('DELETE FROM asignaturas WHERE nombre = ?', [req.params.nombre]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/app/estudiantes/cursos', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        students.rut,
        GROUP_CONCAT(DISTINCT a.nombre ORDER BY a.nombre SEPARATOR '||') AS courses
      FROM (
        SELECT estudiante_rut AS rut
        FROM estudiante_asignatura
        UNION
        SELECT rut_estudiante AS rut
        FROM fichas
        WHERE rut_estudiante IS NOT NULL
          AND rut_estudiante <> '00000000-0'
          AND rut_estudiante NOT REGEXP '^M[0-9]+$'
      ) students
      LEFT JOIN estudiante_asignatura ea ON ea.estudiante_rut = students.rut
      LEFT JOIN asignaturas a
        ON a.id_codigo = ea.asignatura_id
       AND LOWER(TRIM(a.nombre)) <> 'sin curso'
      GROUP BY students.rut
      ORDER BY students.rut
    `);

    res.json(rows.map(row => ({
      rut: row.rut,
      courses: row.courses ? row.courses.split('||').filter(Boolean) : []
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/app/estudiantes/:rut/cursos', async (req, res) => {
  const rut = req.params.rut.trim().toLowerCase().replace(/[^0-9k]/g, '');
  const nombre = String(req.body.nombre || '').trim();
  const courses = Array.isArray(req.body.courses)
    ? [...new Set(req.body.courses
        .map(course => String(course).trim())
        .filter(course => course && course.toLowerCase() !== 'sin curso'))]
    : [];
  const files = Array.isArray(req.body.files) ? req.body.files : [];

  if (!rut || rut.length > 10 || !nombre) {
    res.status(400).json({ message: 'El estudiante debe tener un RUT y un nombre validos.' });
    return;
  }

  if (files.length !== 1) {
    res.status(409).json({ message: 'Cada estudiante solo puede tener una ficha subida a la vez.' });
    return;
  }

  try {
    const fileName = String(files[0].name || '').trim();
    const fileCourse = String(files[0].course || 'Sin curso').trim() || 'Sin curso';
    const [selectedFiles] = await db.query(
      'SELECT id_codigo, rut_estudiante FROM fichas WHERE pdf = ? AND curso = ? LIMIT 1',
      [fileName, fileCourse]
    );

    if (selectedFiles.length === 0) {
      res.status(404).json({ message: 'No se encontro la ficha seleccionada.' });
      return;
    }

    const currentStudentRut = selectedFiles[0].rut_estudiante;
    if (!isPlaceholderStudentRut(currentStudentRut) && currentStudentRut !== rut) {
      res.status(409).json({ message: 'La ficha seleccionada ya pertenece a otro estudiante.' });
      return;
    }

    const [existingStudentFiles] = await db.query(
      `SELECT id_codigo
       FROM fichas
       WHERE rut_estudiante = ?
         AND id_codigo <> ?
         AND rut_estudiante <> '00000000-0'
         AND rut_estudiante NOT REGEXP '^M[0-9]+$'
       LIMIT 1`,
      [rut, selectedFiles[0].id_codigo]
    );

    if (existingStudentFiles.length > 0) {
      res.status(409).json({ message: 'El estudiante ya tiene una ficha subida.' });
      return;
    }

    await db.query(
      `INSERT INTO estudiantes (rut, nombre, anio_ingreso, carrera_id)
       VALUES (?, ?, YEAR(CURDATE()), 'SINCAR')
       ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)`,
      [rut, nombre]
    );
    await db.query('DELETE FROM estudiante_asignatura WHERE estudiante_rut = ?', [rut]);

    for (const course of courses) {
      const asignaturaId = await ensureCourse(course);
      await db.query(
        `INSERT IGNORE INTO estudiante_asignatura (estudiante_rut, asignatura_id)
         VALUES (?, ?)`,
        [rut, asignaturaId]
      );
    }

    await db.query(
      'UPDATE fichas SET rut_estudiante = ? WHERE id_codigo = ?',
      [rut, selectedFiles[0].id_codigo]
    );

    await notifyCourseTeacherOfNewFicha(fileCourse).catch(error => {
      console.error(`No se pudo enviar el correo para el curso "${fileCourse}":`, error.message);
    });

    res.json({ rut, courses });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/app/archivos', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        pdf AS name,
        data,
        COALESCE(tipo, 'application/pdf') AS type,
        curso AS course,
        rut_estudiante AS studentRut,
        fecha_actualizacion AS date,
        historial AS history
      FROM fichas
      WHERE data IS NOT NULL
      ORDER BY fecha_actualizacion DESC, pdf
    `);

    res.json(rows.map(file => ({
      ...file,
      date: file.date instanceof Date ? file.date.toISOString().slice(0, 10) : file.date,
      history: Array.isArray(file.history)
        ? file.history
        : JSON.parse(file.history || '[]')
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/app/archivos', async (req, res) => {
  const { name, data, type, course, date, history } = req.body;

  if (!name || !data || !type || !course || !date) {
    res.status(400).json({ message: 'Faltan datos obligatorios del archivo.' });
    return;
  }

  try {
    await ensureCourse(course);

    // Una ficha solo puede existir una vez, incluso si se intenta subirla en otro curso.
    const [existingFiles] = await db.query(
      'SELECT id_codigo, curso FROM fichas WHERE pdf = ? LIMIT 1',
      [name]
    );

    if (existingFiles.length > 0) {
      if (existingFiles[0].curso !== course) {
        res.status(409).json({ message: 'Esta ficha ya fue subida y esta asociada a otro curso.' });
        return;
      }

      await db.query(
        `UPDATE fichas
         SET data = ?, tipo = ?, fecha_actualizacion = ?, historial = ?
         WHERE id_codigo = ?`,
        [data, type, date, JSON.stringify(history || []), existingFiles[0].id_codigo]
      );
    } else {
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
        VALUES (?, '00000000-0', 'SINCAR', 'SINDIAG', ?, ?, ?, ?, ?, ?)`,
        [createCode('FI'), date, name, data, type, course, JSON.stringify(history || [])]
      );
      await notifyCourseTeacherOfNewFicha(course).catch(error => {
        console.error(`No se pudo enviar el correo para el curso "${course}":`, error.message);
      });
    }

    res.status(201).json({ name, data, type, course, date, history: history || [] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/app/archivos/:name/:course', async (req, res) => {
  const { name, course, date, history } = req.body;
  const currentName = req.params.name;
  const currentCourse = req.params.course;

  if (!name || !course || !date) {
    res.status(400).json({ message: 'Faltan datos obligatorios del archivo.' });
    return;
  }

  try {
    await ensureCourse(course);
    await db.query(
      `UPDATE fichas
       SET pdf = ?, curso = ?, fecha_actualizacion = ?, historial = ?
       WHERE pdf = ? AND curso = ?`,
      [name, course, date, JSON.stringify(history || []), currentName, currentCourse]
    );
    if (course !== currentCourse) {
      await notifyCourseTeacherOfNewFicha(course).catch(error => {
        console.error(`No se pudo enviar el correo para el curso "${course}":`, error.message);
      });
    }
    res.json({ name, course, date, history: history || [] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/app/archivos/:name/:course', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM fichas WHERE pdf = ? AND curso = ?',
      [req.params.name, req.params.course]
    );
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/estudiantes', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        e.rut,
        e.nombre,
        e.anio_ingreso AS anioIngreso,
        e.carrera_id AS carreraId,
        c.nombre AS carrera
      FROM estudiantes e
      INNER JOIN carreras c ON c.id_codigo = e.carrera_id
      ORDER BY e.nombre
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/estudiantes', async (req, res) => {
  const { rut, nombre, anioIngreso, carreraId } = req.body;

  if (!rut || !nombre || !anioIngreso || !carreraId) {
    res.status(400).json({ message: 'Faltan datos obligatorios del estudiante.' });
    return;
  }

  try {
    await db.query(
      'INSERT INTO estudiantes (rut, nombre, anio_ingreso, carrera_id) VALUES (?, ?, ?, ?)',
      [rut, nombre, anioIngreso, carreraId]
    );
    res.status(201).json({ rut, nombre, anioIngreso, carreraId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/carreras', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id_codigo AS idCodigo, nombre
      FROM carreras
      ORDER BY nombre
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/asignaturas', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id_codigo AS idCodigo,
        nombre,
        nombre_docente AS nombreDocente
      FROM asignaturas
      ORDER BY nombre
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/diagnosticos', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id_codigo AS idCodigo,
        nombre,
        contexto_diagnostico AS contextoDiagnostico,
        ajustes_pedagogicos AS ajustesPedagogicos
      FROM diagnosticos
      ORDER BY nombre
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/fichas', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        f.id_codigo AS idCodigo,
        f.rut_estudiante AS rutEstudiante,
        e.nombre AS nombreEstudiante,
        f.carrera_estudiante AS carreraEstudiante,
        c.nombre AS carrera,
        f.diagnostico_id AS diagnosticoId,
        d.nombre AS diagnostico,
        f.fecha_actualizacion AS fechaActualizacion,
        f.pdf
      FROM fichas f
      INNER JOIN estudiantes e ON e.rut = f.rut_estudiante
      INNER JOIN carreras c ON c.id_codigo = f.carrera_estudiante
      INNER JOIN diagnosticos d ON d.id_codigo = f.diagnostico_id
      ORDER BY f.fecha_actualizacion DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada.' });
});

ensureApplicationColumns()
  .then(() => {
    // El servidor se expone solo despues de preparar las columnas necesarias.
    app.listen(port, () => {
      console.log(`API TEA-yudo ejecutandose en http://localhost:${port}`);
    });
  })
  .catch(error => {
    console.error('No se pudieron preparar las tablas de la aplicacion:', error);
    process.exit(1);
  });
