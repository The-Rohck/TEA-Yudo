# Despliegue en Firebase Hosting

La aplicacion Angular queda preparada para Firebase Hosting. El build de produccion publica los archivos desde:

```powershell
dist/app/browser
```

## 1. Iniciar sesion

Ejecuta esto en una terminal normal, dentro de la carpeta `app`:

```powershell
firebase login --reauth
```

## 2. Asociar el proyecto Firebase

Copia `.firebaserc.example` como `.firebaserc` y reemplaza `tu-id-de-proyecto-firebase` por el ID real de tu proyecto:

```powershell
Copy-Item .firebaserc.example .firebaserc
```

Tambien puedes asociarlo con el CLI:

```powershell
firebase use --add
```

## 3. Compilar

```powershell
npm run build
```

## 4. Subir a Firebase Hosting

```powershell
firebase deploy --only hosting
```

## Nota sobre la API

En produccion el frontend llama a `/api`. El archivo `firebase.json` ya incluye un rewrite de `/api/**` hacia el servicio Cloud Run `tea-yudo-api` en `southamerica-west1`.

Sigue `BACKEND_DATABASE_DEPLOY.md` para publicar el backend Express y la base MySQL en Cloud SQL antes de hacer el despliegue final de Hosting.
