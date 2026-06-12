# Backend TEA-yudo

<!-- Documenta como levantar la API local que usa el frontend Angular. -->

API local para conectar Angular con la base de datos MySQL/MariaDB `tea_yudo`.

## Configuracion inicial

1. Copia `.env.example` como `.env`.
2. Ajusta los datos de conexion si tu MySQL no usa `root` sin contrasena.
3. Instala dependencias:

```bash
npm install
```

4. Ejecuta el backend:

```bash
npm run dev
```

La API queda disponible en:

```text
http://localhost:3000
```

## Prueba rapida

Abre:

```text
http://localhost:3000/api/health
```

Si la conexion funciona, deberias ver:

```json
{
  "ok": true,
  "database": "connected"
}
```

## Envio de correos

Para notificar al profesor cuando se asocia una nueva ficha a su curso, configura
estas variables en `.env`:

```text
SMTP_HOST=smtp.ejemplo.cl
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario
SMTP_PASSWORD=contrasena
SMTP_FROM=soporte@teayudocl.com
FRONTEND_URL=http://localhost:4200
```

Si SMTP no esta configurado o el curso no tiene un profesor con mail asociado,
la ficha se guarda igualmente y el backend registra el motivo.

Al agregar un profesor nuevo, el backend envia un enlace a
`/confirmar-profesor?token=...` para que confirme su cuenta y cree su
contrasena. Si SMTP no esta configurado, el enlace queda registrado en el
detalle del historial de correos para poder probar el flujo en local.

Los ultimos 200 intentos de notificacion se pueden consultar en:

```text
http://localhost:3000/api/app/correos
```
