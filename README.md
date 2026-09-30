# Agenda Financiera Personal

Una agenda personal para saber qué dinero tenés, qué gastaste, qué tenés que
payer y cómo venés administrando la plata.

Single-user, sin cuentas ni login, corriendo íntegramente en tu computadora.

```
React + TypeScript  ─HTTP─>  FastAPI  ─>  SQLite (un solo archivo)
```

## Arranque (desarrollo)

Dos terminales, desde la raíz del proyecto.

**1. Backend** (puerto 8000)

```bash
cd backend
python -m venv ../.venv          # solo la primera vez
../.venv/Scripts/pip install -r requirements.txt
../.venv/Scripts/python -m uvicorn app.main:app --reload
```

**2. Frontend** (puerto 5173)

```bash
cd frontend
npm install                       # solo la primera vez
npm run dev
```

Abrí <http://localhost:5173>. La API queda documentada en
<http://127.0.0.1:8000/docs>.

En el primer arranque se crean las tablas, 10 categorías con su color y las tres
cuentas donde vive la plata: **Banco**, **Billetera virtual** y **Efectivo**.

## Tests

```bash
cd backend
../.venv/Scripts/python -m pytest tests -q
```

## Deploy

En producción es **un solo proceso**: FastAPI sirve la API en `/api` y el
frontend compilado en todo lo demás. Una URL, un puerto, sin CORS.

```bash
# 1. Compilar el frontend (hay que hacerlo antes de arrancar)
cd frontend && npm run build

# 2. Arrancar el servidor
cd ../backend
FINANZAS_DB=/var/lib/finanzas/finance.db \
FINANZAS_PASSWORD=una-clave-larga \
../.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

El frontend ya está incluido en el repo como build, así que en el servidor
basta con clonar, `pip install -r requirements.txt` y lo de arriba.

### Variables de entorno

| Variable            | Por defecto            | Para qué sirve                                              |
| ------------------- | ---------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`      | *(vacío)*              | Conexión a PostgreSQL. Vacío = usar el SQLite local.        |
| `FINANZAS_DB`       | `backend/finance.db`   | Ruta del archivo SQLite, cuando no hay `DATABASE_URL`.      |
| `FINANZAS_PASSWORD` | *(vacío)*              | La clave de la app. Vacío = sin password, no publiques.     |
| `FINANZAS_USER`     | `lautaro`              | Usuario para HTTP Basic (curl y `/docs`).                   |
| `FINANZAS_STATIC`   | `frontend/dist`        | Dónde está el frontend compilado.                           |
| `FINANZAS_CORS`     | `localhost:5173`       | Orígenes permitidos, separados por coma.                    |
| `FINANZAS_SESSION_DAYS` | `30`                | Días que dura la sesión iniciada.                           |

Sin `FINANZAS_PASSWORD` la API queda abierta a quien tenga la URL. La app no
tiene modelo de usuarios, así que **esa variable es lo único que separa tu
historial financiero del resto de internet**. Sin ella, mantenela en una red
privada y no la publiques.

### En la nube: Supabase + Render + Vercel

Los tres gratis. La decisión de fondo: **un server free no tiene disco
persistente**, así que la base no puede ser un archivo local. Va a un PostgreSQL
administrado y la API se conecta por red.

```
Vercel   (frontend, estático)  ──HTTPS──>  Render  (FastAPI)  ──>  Supabase  (PostgreSQL)
```

**1. Supabase** — New project. La región importa, porque después va en el host de
la URL. En *Project Settings →
Database*, activá solo el guard **Password**; los demás déjalos apagados. Copiá
la *Connection string* de la pestaña **Connection pooler**, en el modo **Session
pooler**. No la de *Direct connection*.

**Por qué el pooler y no el directo.** El host directo es
`db.<ref>.supabase.co`, y no tiene registro DNS tipo A: solo AAAA. Desde una red
sin IPv6 no resuelve nunca, y el error es un `getaddrinfo failed` que no
menciona bases de datos. El pooler sí tiene IPv4.

Los dos se parecen pero no son intercambiables:

| | Direct connection | Session pooler |
| --- | --- | --- |
| Host | `db.<ref>.supabase.co` | `aws-0-<region>.pooler.supabase.com` |
| Puerto | `5432` | `5432` |
| Usuario | `postgres` | `postgres.<ref>` |

El pooler además mete el ref del proyecto dentro del usuario. La región va en el
host y tiene que ser la del proyecto, que se ve arriba a la derecha del panel.

El 5432 del pooler es el que funciona con SQLAlchemy sin tocar nada. El 6543 es
el *Transaction* pooler y necesita `?pgbouncer=true` al final de la URL.

**2. Render** — conectá el repo con GitHub. `render.yaml` ya está escrito, así
que toma el plan, el comando de arranque y el health check solo. Completá las
tres variables que pide:

| Variable            | Valor                                             |
| ------------------- | ------------------------------------------------- |
| `DATABASE_URL`      | La del Session pooler de Supabase                  |
| `FINANZAS_PASSWORD` | Una clave larga que inventes vos                  |
| `FINANZAS_CORS`     | `https://tu-app.vercel.app`                       |

**3. Vercel** — importá el repo, pero en *Settings → Build & Deployment* poné
*Root Directory* en `frontend`. Es el ajuste que más se olvida y sin él el build
falla con `cd: frontend: No such file or directory`: Vercel entra derecho a esa
carpeta, y el `vercel.json` que define el build tiene que estar adentro de ella,
no en la raíz del repo. Después en *Settings → Environment Variables* agregá:

| Nombre           | Valor                              |
| ---------------- | ---------------------------------- |
| `VITE_API_URL`   | `https://tu-api.onrender.com`      |

Sin `VITE_API_URL` el frontend busca `/api` en su propio dominio, que es lo
correcto cuando FastAPI sirve el frontend, pero no cuando la API está en otro
lado.

**Dos cosas que conviene saber del plan gratis de Render:** el servicio se
duerme tras 15 minutos sin uso y tarda 30-60 segundos en volver, así que la
primera apertura del día se demora. Y no tiene disco persistente, que es
justamente por qué la base está en Supabase.

### Desde el teléfono

**En la misma Wi-Fi, sin nada más.** El servidor escucha en `0.0.0.0`, así que
alcanza con la IP local de la máquina:

```bash
hostname -I                      # Linux
ipconfig                          # Windows
```

```
http://192.168.100.5:8000
```

En Windows, si el Firewall pregunta, permití Python en redes privadas.

**Desde afuera de la casa, con Tailscale.**

Tailscale arma una red privada entre tus dispositivos usando WireGuard. El
puerto 8000 **no queda abierto en internet**: solo llega quien tenga tu
cuenta, y el tráfico va cifrado. No hay que abrir puertos en el router,
ni comprar un dominio, ni configurar un certificado HTTPS.

En la PC (una vez):

```bash
winget install --id Tailscale.Tailscale
```

Abrí el ícono de Tailscale en la bandeja del sistema → **Log in**, con la misma
cuenta que vayas a usar en el teléfono. Después:

```bash
tailscale ip -4          # tu IP dentro de la red, algo como 100.x.y.z
```

En el teléfono, instalá Tailscale desde la App Store y logueate con **la misma
cuenta**. Después abrí en el navegador del teléfono:

```
http://100.x.y.z:8000
```

Funciona con 4G, en la calle, en el trabajo. También podés usar el nombre de
MagicDNS en vez de la IP, que es más cómodo de escribir:
`http://<nombre-de-la-pc>:8000`

Lo que **no** hace Tailscale es mantener la PC prendida. Si la compu se
suspende, el teléfono no llega. Para que aguante:

```
Configuración > Sistema > Energía > pantalla y suspensión > "Nunca" (con el enchufe)
```

Ojo con la alternativa: **Cloudflare Tunnel** da una URL pública con HTTPS
(`https://finanzas.tunombre.com`) sin abrir puertos, pero cualquiera que se
sepa la URL llega al login. Con `FINANZAS_PASSWORD` es aceptable para una app
de una persona; sin ella, es publicar el historial financiero. Para uso
personal, Tailscale es la opción más simple y la que menos superficie expone.

### Que arranque solo

`iniciar.bat` en la raíz levanta el server con un doble clic. Si querés que
levante con la PC sin tocarlo, creá una tarea programada que lo ejecute al
iniciar sesión:

```powershell
$accion = New-ScheduledTaskAction -Execute "C:\...\Finanzas\iniciar.bat"
$al     = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "Finanzas" -Action $accion -Trigger $al `
  -Description "Agenda Financiera: API + frontend en el puerto 8000"
```

### Después de tocar algo

`npm run build` **antes** de reiniciar el servidor. El build se lee al arrancar,
así que si compilás después, el navegador sigue pidiendo los assets viejos.

## Decisiones que conviene conocer

**El saldo nunca se guarda, se calcula.**

```
saldo de una cuenta = saldo inicial + ingresos - gastos
```

Esto evita que el saldo se desincronice de los movimientos. Cambiar o borrar un
movimiento actualiza el saldo solo.

**El dinero se guarda como enteros de centavos.**

SQLite no maneja `Decimal` de forma confiable, así que la columna es un
`BIGINT` de centavos y la API habla pesos decimales. La conversión ocurre en los
bordes (`backend/app/money.py`). Nunca se usa `float` para plata.

**Una transferencia no es un gasto.**

`POST /api/transfers` genera dos movimientos vinculados por `transfer_id`, uno
que sale de la cuenta origen y otro que entra en la destino. No llevan categoría
y **quedan excluidos de los totales de ingresos y gastos**: mover plata entre
tus propias cuentas no es gastar ni ganar. El saldo total no cambia.

**No se puede gastar ni transferir más de lo que hay.**

Un gasto o una salida que dejaría la cuenta en negativo se rechaza con `422`. El
ingreso nunca se bloquea y una cuenta de tipo **Crédito** queda exenta: en una
tarjeta el saldo negativo es la deuda, que es lo que significa una tarjeta, y
bloquearlo la volvería inútil.

Al editar hay una trampa. El saldo que se compara ya tiene descontado el
movimiento que se está guardando, así que comparar contra el saldo tal cual
bloquearía incluso el guardado sin cambios. Se devuelve el aporte del propio
movimiento antes de comparar, y solo si la cuenta no cambia: si se muda de
cuenta, el saldo de la nueva todavía no lo tiene descontado. Por eso al editar
puede guardar un gasto más grande que el saldo de la cuenta.

El modal de movimiento y el de transferencia muestran el disponible y
deshabilitan *Guardar* mientras el monto no entre, así que el error se ve antes
de tocar nada. El backend igual lo rechaza igual: el botón es cortesía, la regla
está en el servidor.

**Nada se borra de verdad, se da de baja.**

Cuentas y categorías tienen `active`. Al darlas de baja desaparecen de los
selectores pero sus movimientos históricos siguen siendo legibles. Todo lo que
se da de baja se puede volver a activar desde la misma pantalla: Cuentas y
Configuración listan las dadas de baja con un botón *Reactivar*.

**Todo lo que se carga se puede deshacer.**

Un movimiento se borra con `DELETE /api/transactions/{id}`. Si es parte de una
transferencia, el borrado se lleva **las dos patas**, en el mismo commit: si se
borrara una sola, la plata aparecería de la nada en la otra cuenta y los saldos
dejarían de cuadrar sin forma de arreglarlo desde la app. Da igual desde cuál de
las dos filas se pida, es la misma transferencia.

Lo que **no** se puede es editar una transferencia. Cambiarle el monto a una
pata sola dejaría la otra desactualizada, así que el camino es borrarla y
volver a hacerla.

Las cuentas y las categorías nunca se borran de verdad, se dan de baja, así que
sus movimientos quedan legibles siempre.

**Sin emojis: categorías con color, navegación con íconos.**

El tema es oscuro y la interfaz no usa emojis. Cada categoría tiene un `color`
hexadecimal que se elige de una paleta de diez en Configuración y se usa como
punto de color en la agenda, la lista de movimientos y los gráficos. La
navegación y las acciones usan SVG en línea (`frontend/src/components/Icon.tsx`),
así que el ícono hereda el color del texto y no hay que cargar ninguna fuente
de íconos.

**La API vive bajo `/api`.**

En desarrollo el proxy de Vite reenvía `/api` al backend sin reescribirlo; en
producción FastAPI responde ahí directamente y sirve el resto de las rutas como
`index.html` para que funcione el enrutado del lado del cliente.

**Una sola clave, en una cookie firmada.**

No hay tabla de usuarios: una persona, una clave. El login manda la clave al
API, que devuelve una cookie firmada con HMAC. No hay sesiones guardadas en el
server, así que reiniciar la app no cierra ninguna sesión, y cambiar la clave
las cierra todas.

La cookie es `httpOnly`, o sea que JavaScript no la puede leer y un XSS no
llegaría a robarla. Y va como `SameSite=None` cuando la petición llega por
HTTPS, porque Vercel y Render son sitios distintos: sin eso el navegador la
descarta antes de que llegue al API.

**La base se puede cambiar sin tocar el código.**

`DATABASE_URL` decide el motor. Sin la variable, SQLite local. Con ella,
PostgreSQL. Los tipos, los enums (que son texto, no enums nativos) y las
consultas son los mismos en los dos, así que no hay dos caminos de código que
se puedan desincronizar.

Dos diferencias que costaron bugs, y que aparecieron recién al probar contra un
PostgreSQL de verdad:

SQLite ignora `VARCHAR(36)` y PostgreSQL no. El `transfer_id` se armaba con ids
de cuenta y monto, y con montos grandes pasaba los 36 caracteres. Ahora es un
UUID, que son 36 exactos.

Y `postgresql://` no significa lo mismo para SQLAlchemy y para nosotros:
SQLAlchemy lo lee como *psycopg2*, y el driver instalado es *psycopg 3*. La URL
que copia cualquiera de la consola de Supabase fallaba con
`ModuleNotFoundError: psycopg2`, un error de imports que no dice nada de bases
de datos. Ahora `database.normalize_url()` le agrega el `+psycopg` que falta.

## API

Todas las rutas cuelgan de `/api`.

| Método   | Ruta                             | Qué hace                        |
| -------- | -------------------------------- | ------------------------------- |
| `GET`    | `/api/health`                    | Chequeo para monitoreo         |
| `GET`    | `/api/accounts`                  | Lista con saldo calculado       |
| `POST`   | `/api/accounts`                  | Crea una cuenta                 |
| `PUT`    | `/api/accounts/{id}`             | Edita                           |
| `DELETE` | `/api/accounts/{id}`             | Da de baja                      |
| `GET`    | `/api/accounts/{id}/transactions` | Movimientos de una cuenta      |
| `GET`    | `/api/categories`                | Filtro por `?type=`             |
| `POST`   | `/api/categories`                | Crea                            |
| `PUT`    | `/api/categories/{id}`           | Edita                           |
| `DELETE` | `/api/categories/{id}`           | Da de baja                      |
| `GET`    | `/api/transactions`              | Filtros: `month`, `category_id`, `account_id`, `type`, `search`, `start`, `end` |
| `POST`   | `/api/transactions`              | Crea un gasto o ingreso         |
| `PUT`    | `/api/transactions/{id}`         | Edita                           |
| `DELETE` | `/api/transactions/{id}`         | Elimina                         |
| `POST`   | `/api/transfers`                 | Transfiere entre cuentas        |
| `GET`    | `/api/dashboard?month=YYYY-MM`   | Saldo, resumen, categorías, últimos movimientos |
| `GET`    | `/api/calendar/month?month=YYYY-MM` | Cada día del mes con su resumen |
| `GET`    | `/api/calendar/day?day=YYYY-MM-DD`  | Un día en detalle             |
| `GET`    | `/api/reports/monthly?months=6`  | Ingresos vs gastos por mes      |
| `GET`    | `/api/reports/balance-evolution` | Saldo acumulado mes a mes       |
| `GET`    | `/api/reports/categories?month=` | Gastos por categoría            |

## Tus datos

Todo vive en un archivo SQLite. En desarrollo es `backend/finance.db`; en un
deploy, donde apunte `FINANZAS_DB`.

Como el servidor usa WAL, el backup se hace copiando los tres archivos juntos
o, mejor, con el comando de SQLite que baja el checkpoint:

```bash
sqlite3 /var/lib/finanzas/finance.db ".backup '/var/lib/finanzas/backup-2026-09-29.db'"
```

El archivo está en `.gitignore` justamente para que tus datos nunca terminen en
un repo.

## Estructura

```
backend/
  app/
    main.py            FastAPI, login, sirve el frontend compilado
    auth.py            Cookie firmada con HMAC y HTTP Basic
    config.py          Variables de entorno leídas una vez al arrancar
    database.py        Engine SQLite, PRAGMAs, sesión por request
    money.py           Centavos <-> pesos (el único lugar donde se convierte)
    enums.py           Tipos de movimiento, categoría y cuenta
    models/            Tablas SQLAlchemy
    schemas/           Contrato de la API (Pydantic)
    routers/           Endpoints
    services/          Lógica financiera
  tests/               118 tests
frontend/
  src/
    pages/             Dashboard, Agenda, Movimientos, Cuentas, Estadísticas, Config
    components/        Modal, FormModal, Card, Button, TransactionItem, Layout, Icon
    hooks/useAsync.ts  Carga de datos con loading/error/reload
    services/api.ts    Cliente HTTP tipado
    utils/format.ts    Moneda y fechas en es-AR
    utils/colors.ts    Paleta de categorías y resolución de colores
    types/             Tipos compartidos con la API
```

## Lo que falta (V2 en adelante)

Gastos recurrentes, cuotas, presupuestos, metas, exportación a CSV y backups
desde la interfaz. El campo `upcoming` del dashboard ya está en el contrato de
la API para recibirlos.
