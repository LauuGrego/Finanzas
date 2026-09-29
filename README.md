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
| `FINANZAS_DB`       | `backend/finance.db`   | Ruta del archivo SQLite. Fuera del repo, en un lugar con backup. |
| `FINANZAS_PASSWORD` | *(vacío)*              | Si está puesta, exige usuario y contraseña. Vacío = sin auth. |
| `FINANZAS_USER`     | `lautaro`              | Usuario para la contraseña de arriba.                        |
| `FINANZAS_STATIC`   | `frontend/dist`        | Dónde está el frontend compilado.                            |
| `FINANZAS_CORS`     | `localhost:5173`       | Orígenes permitidos. `*` solo si el frontend vive en otro host. |

Sin `FINANZAS_PASSWORD` la API queda abierta a quien tenga la URL. La app no
tiene modelo de usuarios, así que **esa variable es lo único que separa tu
historial financiero del resto de internet**. Sin ella, mantenela en una red
privada y no la publiques.

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

**Desde afuera de la casa.** Dos caminos, y la elección importa:

- **Tailscale** (recomendado). Es una red privada entre tus dispositivos: la
  PC y el teléfono se ven por IP, y el puerto 8000 **no queda expuesto en
  internet**. Gratis, sin abrir puertos en el router, y la app sigue siendo
  inaccesible para cualquiera que no tenga tu cuenta.
  Descargá Tailscale en ambos, y entrás por `http://100.x.y.z:8000`.

- **Cloudflare Tunnel**. Te da una URL pública con HTTPS y no requiere abrir
  puertos, pero cualquiera que se sepa la URL llega al login. Con
  `FINANZAS_PASSWORD` puesta es aceptable para una app de una persona; sin ella,
  es publicar tu historial financiero.

No hace falta servidor propio en ningún caso: con la PC siempre encendida alcanza.

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

**Nada se borra de verdad, se da de baja.**

Cuentas y categorías tienen `active`. Al darlas de baja desaparecen de los
selectores pero sus movimientos históricos siguen siendo legibles. Solo se
pueden editar o borrar los movimientos que no son parte de una transferencia.

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
    main.py            FastAPI, auth opcional, sirve el frontend compilado
    config.py          Variables de entorno leídas una vez al arrancar
    database.py        Engine SQLite, PRAGMAs, sesión por request
    money.py           Centavos <-> pesos (el único lugar donde se convierte)
    enums.py           Tipos de movimiento, categoría y cuenta
    models/            Tablas SQLAlchemy
    schemas/           Contrato de la API (Pydantic)
    routers/           Endpoints
    services/          Lógica financiera
  tests/               43 tests
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
