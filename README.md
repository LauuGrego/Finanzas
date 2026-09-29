# 💰 Agenda Financiera Personal

Una agenda personal para saber qué dinero tenés, qué gastaste, qué tenés que
payer y cómo venís administrando la plata.

Single-user, sin cuentas ni login, corriendo íntegramente en tu computadora.

```
React + TypeScript  ──HTTP──>  FastAPI  ──>  SQLite (un solo archivo)
```

## Arranque

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

En el primer arranque se crean las tablas, 10 categorías y dos cuentas
(Banco y Efectivo).

## Tests

```bash
cd backend
../.venv/Scripts/python -m pytest tests -q
```

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

`POST /transfers` genera dos movimientos vinculados por `transfer_id`, uno que
sale de la cuenta origen y otro que entra en la destino. No llevan categoría y
**quedan excluidos de los totales de ingresos y gastos**: mover plata entre tus
propias cuentas no es gastar ni ganar. El saldo total no cambia.

**Nada se borra de verdad, se da de baja.**

Cuentas y categorías tienen `active`. Al darlas de baja desaparecen de los
selectores pero sus movimientos históricos siguen siendo legibles. Solo se
pueden editar o borrar los movimientos que no son parte de una transferencia.

## API

| Método     | Ruta                              | Qué hace                        |
| ---------- | --------------------------------- | ------------------------------- |
| `GET`      | `/accounts`                       | Lista con saldo calculado       |
| `POST`     | `/accounts`                       | Crea una cuenta                 |
| `PUT`      | `/accounts/{id}`                  | Edita                           |
| `DELETE`   | `/accounts/{id}`                  | Da de baja                      |
| `GET`      | `/accounts/{id}/transactions`     | Movimientos de una cuenta       |
| `GET`      | `/categories`                     | Filtro por `?type=`             |
| `POST`     | `/categories`                     | Crea                            |
| `PUT`      | `/categories/{id}`                | Edita                           |
| `DELETE`   | `/categories/{id}`                | Da de baja                      |
| `GET`      | `/transactions`                   | Filtros: `month`, `category_id`, `account_id`, `type`, `search`, `start`, `end` |
| `POST`     | `/transactions`                   | Crea un gasto o ingreso         |
| `PUT`      | `/transactions/{id}`              | Edita                           |
| `DELETE`   | `/transactions/{id}`              | Elimina                         |
| `POST`     | `/transfers`                      | Transfiere entre cuentas        |
| `GET`      | `/dashboard?month=YYYY-MM`        | Saldo, resumen, categorías, últimos movimientos |
| `GET`      | `/calendar/month?month=YYYY-MM`   | Cada día del mes con su resumen |
| `GET`      | `/calendar/day?day=YYYY-MM-DD`    | Un día en detalle               |
| `GET`      | `/reports/monthly?months=6`       | Ingresos vs gastos por mes      |
| `GET`      | `/reports/balance-evolution`      | Saldo acumulado mes a mes       |
| `GET`      | `/reports/categories?month=`      | Gastos por categoría            |

## Tus datos

Todo vive en `backend/finance.db`, un archivo SQLite. Para hacer un backup:

```bash
cd backend
cp finance.db ../finance-2026-09-29.db
```

Conviene hacerlo de vez en cuando, sobre todo antes de tocar algo. El archivo
está en `.gitignore` justamente para que tus datos nunca terminen en un repo.

## Estructura

```
backend/
  app/
    main.py            FastAPI, CORS, seed inicial
    database.py        Engine SQLite, PRAGMAs, sesión por request
    money.py           Centavos <-> pesos (el único lugar donde se convierte)
    enums.py           Tipos de movimiento, categoría y cuenta
    models/            Tablas SQLAlchemy
    schemas/           Contrato de la API (Pydantic)
    routers/           Endpoints
    services/          Lógica financiera
  tests/               29 tests
frontend/
  src/
    pages/             Dashboard, Agenda, Movimientos, Cuentas, Estadísticas, Config
    components/        Modal, FormModal, Card, Button, TransactionItem, Layout
    hooks/useAsync.ts  Carga de datos con loading/error/reload
    services/api.ts    Cliente HTTP tipado
    utils/format.ts    Moneda y fechas en es-AR
    types/             Tipos compartidos con la API
```

## Lo que falta (V2 en adelante)

Gastos recurrentes, cuotas, presupuestos, metas, exportación a CSV y backups
desde la interfaz. El campo `upcoming` del dashboard ya está en el contrato de
la API para recibirlos.
