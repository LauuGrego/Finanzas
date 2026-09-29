@echo off
REM Levanta la app para usarla desde el telefono.
REM Un solo proceso: sirve la API en /api y el frontend compilado en el resto.
REM La base y el frontend se leen al arrancar: recompila con `npm run build`
REM antes de volver a correr esto.

cd /d "%~dp0backend"

if not exist "..\frontend\dist\index.html" (
  echo.
  echo El frontend no esta compilado. Corré esto en otra terminal:
  echo     cd frontend ^&^& npm run build
  echo.
  pause
  exit /d 1
)

REM ¿Querés que se pida contraseña? Sacá el rem de la línea siguiente y
REM cambiala por algo largo. Sin esto, cualquiera que llegue al puerto 8000
REM ve tu historial financiero.
REM set FINANZAS_PASSWORD=una-clave-larga

echo.
echo   Agenda Financiera  ->  http://localhost:8000
echo.
echo   Cerrá esta ventana para apagar el server.
echo.

..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
