# Backend y base de datos en Google Cloud

Esta guia despliega:

- Frontend Angular: Firebase Hosting.
- Backend Express: Cloud Run.
- Base de datos MySQL: Cloud SQL.

Los comandos usan estos nombres por defecto:

```powershell
$PROJECT_ID = "tu-id-de-proyecto-firebase"
$REGION = "southamerica-west1"
$SQL_INSTANCE = "tea-yudo-db"
$DB_NAME = "tea_yudo"
$DB_USER = "tea_yudo_user"
$RUN_SERVICE = "tea-yudo-api"
```

## 1. Iniciar sesion y seleccionar proyecto

```powershell
firebase login --reauth
gcloud auth login
gcloud config set project $PROJECT_ID
```

## 2. Activar APIs necesarias

```powershell
gcloud services enable run.googleapis.com sqladmin.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

## 3. Crear Cloud SQL MySQL

```powershell
gcloud sql instances create $SQL_INSTANCE --database-version=MYSQL_8_0 --region=$REGION --tier=db-f1-micro --storage-size=10GB
gcloud sql databases create $DB_NAME --instance=$SQL_INSTANCE
gcloud sql users create $DB_USER --instance=$SQL_INSTANCE --password="CAMBIA_ESTA_CONTRASENA"
```

## 4. Importar la base de datos

El dump local esta en `database/tea_yudo.sql`. Cloud SQL importa desde Cloud Storage:

```powershell
$BUCKET = "$PROJECT_ID-tea-yudo-sql"
gcloud storage buckets create "gs://$BUCKET" --location=$REGION
gcloud storage cp database/tea_yudo.sql "gs://$BUCKET/tea_yudo.sql"
gcloud sql import sql $SQL_INSTANCE "gs://$BUCKET/tea_yudo.sql" --database=$DB_NAME
```

## 5. Obtener el nombre de conexion de Cloud SQL

```powershell
$INSTANCE_CONNECTION_NAME = gcloud sql instances describe $SQL_INSTANCE --format="value(connectionName)"
```

El valor queda con formato:

```text
proyecto:region:instancia
```

## 6. Desplegar el backend en Cloud Run

Desde la carpeta `app/server`:

```powershell
gcloud run deploy $RUN_SERVICE `
  --source . `
  --region $REGION `
  --allow-unauthenticated `
  --add-cloudsql-instances $INSTANCE_CONNECTION_NAME `
  --set-env-vars "DB_NAME=$DB_NAME,DB_USER=$DB_USER,DB_PASSWORD=CAMBIA_ESTA_CONTRASENA,INSTANCE_UNIX_SOCKET=/cloudsql/$INSTANCE_CONNECTION_NAME,FRONTEND_URL=https://$PROJECT_ID.web.app,SMTP_FROM=soporte@teayudocl.com"
```

Si usas correos reales, agrega tambien las variables SMTP:

```powershell
gcloud run services update $RUN_SERVICE `
  --region $REGION `
  --update-env-vars "SMTP_HOST=smtp.ejemplo.cl,SMTP_PORT=587,SMTP_SECURE=false,SMTP_USER=usuario,SMTP_PASSWORD=contrasena"
```

## 7. Probar salud del backend

```powershell
$API_URL = gcloud run services describe $RUN_SERVICE --region $REGION --format="value(status.url)"
Invoke-RestMethod "$API_URL/api/health"
```

Debe responder:

```json
{
  "ok": true,
  "database": "connected"
}
```

## 8. Desplegar Firebase Hosting

Desde la carpeta `app`, confirma que `.firebaserc` apunte al proyecto correcto:

```powershell
firebase use --add
npm run build
firebase deploy --only hosting
```

`firebase.json` ya incluye el rewrite que envia `/api/**` a Cloud Run:

```json
{
  "source": "/api/**",
  "run": {
    "serviceId": "tea-yudo-api",
    "region": "southamerica-west1"
  }
}
```

## Documentacion oficial

- Firebase Hosting puede redirigir rutas a Cloud Run con `rewrites.run`: https://firebase.google.com/docs/hosting/full-config
- Cloud Run se conecta a Cloud SQL MySQL usando una conexion Cloud SQL y socket `/cloudsql/INSTANCE_CONNECTION_NAME`: https://cloud.google.com/sql/docs/mysql/connect-run
