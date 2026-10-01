# Plan de fases

Documento original del proyecto, escrito **antes** de construir. Se conserva tal
cual porque es el registro de las decisiones y del criterio original.

> **Ojo: es un plan, no una descripción del estado actual.** Abajo, en
> [Estado real](#estado-real-marzo-2026), está qué se hizo distinto y por qué.
> Varias cosas que acá dice "no vamos a hacer" hoy sí están, y al revés.

---

# 💰 Agenda Financiera Personal

## 1. Concepto

No queremos crear:

> "una plataforma de gestión financiera".

Queremos crear:

> **una agenda personal que me permita saber qué dinero tengo, qué gasté, qué tengo que pagar y cómo estoy administrando mi plata.**

La aplicación será **single-user**.

No tendrá:

- registro de usuarios;
- login;
- roles;
- permisos;
- múltiples perfiles;
- integración bancaria;
- inversiones;
- criptomonedas;
- sistemas contables;
- microservicios;
- infraestructura cloud compleja.

Todo eso queda afuera.

---

# 2. Stack definitivo

```text
Frontend
React
TypeScript
Vite
CSS / Tailwind CSS
Recharts

        │
        │ HTTP / REST
        ▼

Backend
Python
FastAPI
Pydantic
SQLAlchemy / SQLModel

        │
        ▼

Database
SQLite
```

SQLite es especialmente conveniente acá porque no necesita un servidor separado y
toda la base puede estar en un único archivo. Además, soporta transacciones
ACID. ([SQLite][3])

---

# 3. Estructura del proyecto

La mantendría muy sencilla:

```text
personal-finance/
│
├── backend/
│   │
│   ├── app/
│   │   ├── main.py
│   │   ├── database.py
│   │   │
│   │   ├── models/
│   │   │   ├── account.py
│   │   │   ├── category.py
│   │   │   ├── transaction.py
│   │   │   ├── recurring.py
│   │   │   └── installment.py
│   │   │
│   │   ├── schemas/
│   │   │   ├── account.py
│   │   │   ├── category.py
│   │   │   ├── transaction.py
│   │   │   ├── recurring.py
│   │   │   └── installment.py
│   │   │
│   │   ├── routers/
│   │   │   ├── accounts.py
│   │   │   ├── categories.py
│   │   │   ├── transactions.py
│   │   │   ├── recurring.py
│   │   │   ├── installments.py
│   │   │   ├── dashboard.py
│   │   │   └── reports.py
│   │   │
│   │   └── services/
│   │       ├── transaction_service.py
│   │       ├── dashboard_service.py
│   │       └── recurring_service.py
│   │
│   ├── tests/
│   │
│   ├── requirements.txt
│   └── finance.db
│
├── frontend/
│   │
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── App.tsx
│   │   └── main.tsx
│   │
│   └── package.json
│
├── README.md
└── .gitignore
```

No agregaría capas artificiales solamente para "hacer arquitectura".

---

# 4. Modelo de datos

Acá quiero hacer una pequeña corrección respecto al plan anterior.

Para una aplicación financiera personal, **el saldo no debería ser el dato
principal almacenado**.

El saldo se puede calcular a partir de los movimientos.

Tendríamos:

## Account

Representa dónde tenés dinero.

```text
Account
----------------
id
name
type
initial_balance
created_at
active
```

Ejemplos:

```text
Banco
Mercado Pago
Efectivo
Ualá
```

---

# 5. Category

```text
Category
----------------
id
name
type
icon
active
```

`type`:

```text
EXPENSE
INCOME
```

Ejemplo:

```text
EXPENSE
Comida
Transporte
Servicios
Entretenimiento
Compras

INCOME
Sueldo
Freelance
Otros
```

---

# 6. Transaction

Esta será la entidad más importante.

```text
Transaction
----------------
id
account_id
category_id
type
amount
description
date
created_at
```

Tipos:

```text
EXPENSE
INCOME
```

Ejemplo:

```text
id: 42
account: Mercado Pago
category: Comida
type: EXPENSE
amount: 12500
description: Supermercado
date: 28/09/2026
```

---

# 7. ¿Y las transferencias?

Sí las vamos a contemplar, pero **sin crear una entidad innecesaria**.

Ejemplo:

```text
Banco
-$50.000

Mercado Pago
+$50.000
```

La interfaz tendrá:

**Transferir dinero**

y el backend generará los dos movimientos relacionados.

Esto es importante porque:

> Transferir plata ≠ gastar plata.

---

# 8. Recurrentes

Después del MVP:

```text
RecurringExpense
----------------
id
account_id
category_id
description
amount
frequency
next_date
active
```

Ejemplo:

```text
Netflix
$15.000
Mensual
Día 3
```

---

# 9. Cuotas

```text
Installment
----------------
id
account_id
category_id
description
total_amount
installment_amount
total_installments
current_installment
start_date
```

Ejemplo:

```text
Notebook

Total: $1.200.000
12 cuotas
$100.000

Actual: 3/12
```

No necesitamos modelar cada cuota como una entidad independiente inicialmente.

---

# 10. Dashboard

Será la pantalla principal.

## Arriba

```text
SEPTIEMBRE 2026

Dinero disponible

$650.000
```

Y debajo:

```text
Ingresos       Gastos        Balance

$1.200.000     $550.000      +$650.000
```

---

## Después

### Distribución de gastos

```text
Comida              $150.000
Transporte           $80.000
Servicios             $70.000
Compras              $200.000
Entretenimiento       $50.000
```

---

## Últimos movimientos

```text
Hoy

Supermercado             -$25.000
Netflix                  -$15.000
Freelance               +$100.000
```

---

## Próximos compromisos

```text
03/10  Netflix            $15.000
05/10  Internet           $35.000
10/10  Cuota celular      $45.000
```

---

# 11. Agenda

La agenda será una de las funciones principales.

```text
        SEPTIEMBRE 2026

 L   M   X   J   V   S   D

     1   2   3   4   5   6
         $5  $15

 7   8   9  10  11  12  13
 $8      $20     $35

14  15  16  17  18  19  20
         $15         $40

21  22  23  24  25  26  27
 $20     $10     $45

28  29  30
 $25     $15
```

Al seleccionar un día:

```text
28 DE SEPTIEMBRE

INGRESOS
+ $100.000
Freelance

GASTOS
- $25.000
Supermercado

- $15.000
Netflix

BALANCE DEL DÍA
+$60.000
```

---

# 12. Crear gasto

La regla:

> **Registrar un gasto tiene que llevar segundos.**

Formulario:

```text
Nuevo gasto

Monto
$25.000

Categoría
[ Comida ]

Descripción
Supermercado

Cuenta
[ Mercado Pago ]

Fecha
28/09/2026

[ GUARDAR ]
```

Nada más.

Los campos obligatorios:

- monto;
- categoría;
- fecha.

Descripción y cuenta pueden tener valores predeterminados.

---

# 13. Crear ingreso

```text
Nuevo ingreso

Monto
$100.000

Categoría
[ Freelance ]

Descripción
Trabajo diseño web

Cuenta
[ Banco ]

Fecha
28/09/2026

[ GUARDAR ]
```

---

# 14. Cuentas

Pantalla:

```text
MIS CUENTAS

Banco
$500.000

Mercado Pago
$100.000

Efectivo
$50.000

────────────────

TOTAL
$650.000
```

Al entrar a una cuenta:

```text
Mercado Pago

Saldo
$100.000

Últimos movimientos

Supermercado      -$25.000
Netflix           -$15.000
Transferencia     +$50.000
```

---

# 15. Historial

```text
MOVIMIENTOS

[ Septiembre ▼ ]
[ Todas las categorías ▼ ]

28/09
Supermercado             -$25.000

27/09
Transporte                -$5.000

26/09
Netflix                  -$15.000

25/09
Freelance               +$100.000
```

Acciones:

```text
✏ Editar
🗑 Eliminar
```

---

# 16. Estadísticas

No necesitamos veinte gráficos.

Solamente:

### Gastos por categoría

Gráfico circular/donut.

### Ingresos vs gastos

Gráfico mensual.

### Evolución del saldo

Gráfico de línea.

### Comparación mensual

```text
             Ingresos       Gastos

Junio        $900.000      $600.000
Julio       $1.000.000     $650.000
Agosto      $1.100.000     $700.000
Septiembre  $1.200.000     $550.000
```

Eso alcanza.

---

# 17. Recurrentes — V2

Una vez que el MVP funcione:

```text
Gastos recurrentes

Netflix
$15.000
Cada mes
Día 3

Internet
$35.000
Cada mes
Día 5
```

La aplicación genera el movimiento correspondiente.

---

# 18. Cuotas — V2

Registrar:

```text
Compra
Celular

Total
$600.000

Cuotas
12

Valor
$50.000
```

Mostrar:

```text
Cuota 1/12 ✓
Cuota 2/12 ✓
Cuota 3/12 ←
Cuota 4/12
...
Cuota 12/12
```

Y:

```text
Pendiente:
$450.000
```

---

# 19. Presupuesto — V3

Esto lo dejaría fuera del MVP.

Después podemos agregar:

```text
Presupuesto de septiembre

Comida
$200.000

Gastado
$145.000

72,5%
```

Y:

```text
Transporte
$100.000

Gastado
$95.000

95%
```

No necesitamos un complejo sistema presupuestario.

---

# 20. Metas — V3

También después.

```text
🎯 Comprar PC

Objetivo
$2.000.000

Ahorrado
$750.000

37,5%
```

Podríamos simplemente asociar aportes a la meta.

---

# 21. Backup

Esto sí lo considero **importante**, aunque sea una aplicación personal.

Como SQLite vive en un archivo, hacer un backup es muy sencillo: la base es
literalmente un archivo de base de datos y SQLite está diseñado como formato de
archivo de aplicación. ([SQLite][4])

Agregaríamos:

```text
Configuración

[ Exportar backup ]

[ Restaurar backup ]
```

El backup podría ser:

```text
finance-2026-09-28.db
```

Además:

```text
Exportar CSV
```

para poder abrir tus movimientos en Excel.

---

# 22. Seguridad

Como es exclusivamente para vos:

### Inicialmente

Nada de:

- usuarios;
- JWT;
- OAuth;
- roles;
- permisos.

Si la aplicación corre solamente en tu PC, no tiene sentido.

Más adelante, si la querés usar desde el celular a través de Internet, recién ahí
analizamos autenticación.

---

# 23. Tests

Sí vamos a tener tests, pero tampoco exageraría.

### Backend

Probar principalmente:

```text
Crear gasto
Editar gasto
Eliminar gasto

Crear ingreso

Calcular saldo

Filtrar movimientos

Calcular gastos mensuales

Calcular gastos por categoría

Crear transferencia

Calcular cuotas
```

No necesitamos testear absolutamente cada getter/setter.

---

# 24. API

La API será pequeña.

```text
GET    /accounts
POST   /accounts
PUT    /accounts/{id}
DELETE /accounts/{id}

GET    /categories
POST   /categories
PUT    /categories/{id}
DELETE /categories/{id}

GET    /transactions
GET    /transactions/{id}
POST   /transactions
PUT    /transactions/{id}
DELETE /transactions/{id}

POST   /transfers

GET    /dashboard

GET    /reports/monthly
GET    /reports/categories
```

Después:

```text
GET    /recurring
POST   /recurring
PUT    /recurring/{id}
DELETE /recurring/{id}

GET    /installments
POST   /installments
```

FastAPI nos dará documentación interactiva de estos endpoints mediante
OpenAPI/Swagger automáticamente. ([FastAPI][1])

---

# 25. Frontend

La navegación:

```text
┌──────────────────────────┐
│ 💰 Finanzas              │
├──────────────────────────┤
│                          │
│ 🏠 Inicio                │
│ 📅 Agenda                │
│ 💸 Movimientos           │
│ 🏦 Cuentas               │
│ 📊 Estadísticas          │
│                          │
│ ─────────────────────    │
│                          │
│ 🔄 Recurrentes           │
│ 💳 Cuotas                │
│                          │
│ ⚙️ Configuración         │
│                          │
└──────────────────────────┘
```

En celular sería una navegación inferior:

```text
🏠       📅       ➕       📊       ⚙️
Inicio  Agenda   Nuevo   Stats   Config.
```

---

# 26. Diseño visual

Buscaría algo:

**minimalista / moderno / personal**

No quiero que parezca:

❌ banco
❌ software empresarial
❌ planilla de Excel

Sí quiero que parezca:

✅ aplicación personal
✅ limpia
✅ rápida
✅ agradable de usar

### Componentes principales

```text
Card
Button
Modal
Input
Select
DatePicker
TransactionItem
AccountCard
CategoryCard
Chart
Calendar
```

---

# 27. FASE 1 — Preparación

Crear repositorio:

```text
personal-finance
```

Configurar:

```text
Git
Python
FastAPI
React
TypeScript
Vite
SQLite
```

Crear `.gitignore`.

Primer commit:

```text
Initial project setup
```

---

# 28. FASE 2 — Base de datos

Crear:

```text
accounts
categories
transactions
```

Primero.

No crear todavía recurrentes ni cuotas.

Relaciones:

```text
Account
   │
   └──── Transaction
               │
               └──── Category
```

Crear datos iniciales:

```text
Comida
Transporte
Servicios
Entretenimiento
Compras
Otros

Sueldo
Freelance
Otros
```

---

# 29. FASE 3 — Backend básico

Implementar:

```text
GET /accounts
POST /accounts
PUT /accounts/{id}
DELETE /accounts/{id}

GET /categories
POST /categories
PUT /categories/{id}
DELETE /categories/{id}

GET /transactions
POST /transactions
PUT /transactions/{id}
DELETE /transactions/{id}
```

Probar todo desde Swagger.

---

# 30. FASE 4 — Lógica financiera

Implementar:

### Saldo

```text
Saldo =
Saldo inicial
+ ingresos
- gastos
```

### Balance mensual

```text
Ingresos del mes
- gastos del mes
```

### Gastos por categoría

```text
SUM(expenses)
GROUP BY category
```

### Balance diario

```text
Ingresos del día
- gastos del día
```

---

# 31. FASE 5 — Frontend

Crear:

```text
Dashboard
Transactions
Accounts
Categories
Calendar
```

Conectar con la API.

---

# 32. FASE 6 — Dashboard

Primera pantalla funcional.

Debe mostrar:

```text
Saldo
Ingresos
Gastos
Balance

Últimos movimientos

Gastos por categoría
```

Cuando esto funcione, ya tendremos algo útil.

---

# 33. FASE 7 — Agenda

Agregar:

```text
Calendario
Movimientos diarios
Resumen diario
Navegación mensual
```

---

# 34. FASE 8 — Pulido del MVP

Antes de agregar funcionalidades:

- responsive;
- validaciones;
- estados de carga;
- errores;
- confirmación al eliminar;
- formato de moneda;
- formato de fechas;
- navegación;
- diseño;
- accesibilidad básica.

### Resultado

## 🎉 MVP

Ya podés usar la aplicación diariamente.

---

# 35. FASE 9 — Recurrentes

Agregar:

```text
RecurringExpense
```

Y generación automática de movimientos.

---

# 36. FASE 10 — Cuotas

Agregar:

```text
Installment
```

Con:

- cantidad;
- monto;
- cuota actual;
- cuotas restantes;
- fecha;
- total pendiente.

---

# 37. FASE 11 — Estadísticas

Agregar:

```text
Gastos por categoría
Ingresos vs gastos
Evolución mensual
Evolución del saldo
```

---

# 38. FASE 12 — Presupuestos

Agregar solamente:

```text
Budget
----------------
id
category_id
month
year
amount
```

Y calcular:

```text
presupuesto
gastado
restante
porcentaje
```

---

# 39. FASE 13 — Metas

```text
SavingGoal
----------------
id
name
target_amount
current_amount
target_date
```

Nada más.

---

# 40. FASE 14 — Backup

Agregar:

```text
Exportar DB
Importar DB
Exportar CSV
```

Y eventualmente:

```text
Backup automático
```

---

# 41. Qué NO vamos a hacer

Esto es importante para mantener el proyecto bajo control.

No vamos a implementar inicialmente:

```text
❌ Multiusuario
❌ Login
❌ Roles
❌ OAuth
❌ JWT
❌ Bancos
❌ APIs bancarias
❌ Inversiones
❌ Criptomonedas
❌ Acciones
❌ Sistema contable
❌ Facturación
❌ IA
❌ OCR
❌ Microservicios
❌ Docker obligatorio
❌ Kubernetes
❌ Cloud compleja
❌ App móvil nativa
```

Si algún día realmente necesitás alguna de esas cosas, se analiza en ese momento.

---

# 42. Roadmap definitivo

```text
                  AGENDA FINANCIERA
                         │
                         ▼
                ┌─────────────────┐
                │    SETUP        │
                │ React + FastAPI │
                │ SQLite           │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │ BASE DE DATOS   │
                │ Accounts        │
                │ Categories      │
                │ Transactions    │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │    BACKEND      │
                │ CRUD + lógica   │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │    FRONTEND     │
                │ Dashboard       │
                │ Movimientos     │
                │ Cuentas         │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │     AGENDA      │
                └────────┬────────┘
                         │
                         ▼
                  ★ MVP USABLE ★
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
          Recurrentes  Cuotas   Estadísticas
              │          │          │
              └──────────┼──────────┘
                         ▼
                    Presupuestos
                         │
                         ▼
                       Metas
                         │
                         ▼
                  Backup / CSV
```

## 🎯 Prioridad real

Yo marcaría las prioridades así:

| Función            | Prioridad   |
| ------------------ | ----------- |
| Registrar gastos   | 🔴 Esencial |
| Registrar ingresos | 🔴 Esencial |
| Ver saldo          | 🔴 Esencial |
| Cuentas            | 🔴 Esencial |
| Categorías         | 🔴 Esencial |
| Historial          | 🔴 Esencial |
| Dashboard          | 🔴 Esencial |
| Agenda             | 🔴 Esencial |
| Recurrentes        | 🟠 V2       |
| Cuotas             | 🟠 V2       |
| Estadísticas       | 🟠 V2       |
| Presupuestos       | 🟡 V3       |
| Metas              | 🟡 V3       |
| Exportación        | 🟡 V3       |
| OCR                | ⚪ Futuro    |
| IA                 | ⚪ Futuro    |
| Bancos             | ⚪ Futuro    |

### Una decisión adicional que tomaría desde ahora

**Usaría pesos argentinos como moneda inicial y permitiría configurar el
símbolo/formato**, pero no construiría todavía un sistema multi-moneda.

Y manejaría los montos como **valores decimales**, nunca como `float`, para
evitar errores de precisión monetaria.

Con este alcance, el proyecto deja de ser "una aplicación financiera enorme" y
pasa a ser algo mucho más razonable: **una pequeña aplicación personal que
podemos construir completa, mantener fácilmente y realmente usar todos los
días**.

[1]: https://fastapi.tiangolo.com/es/features/?utm_source=chatgpt.com "Funcionalidades - FastAPI"
[2]: https://react.dev/learn?utm_source=chatgpt.com "Quick Start – React"
[3]: https://sqlite.org/about.html?utm_source=chatgpt.com "About SQLite"
[4]: https://www.sqlite.org/appfileformat.html?utm_source=chatgpt.com "SQLite As An Application File Format"

---
---

# Estado real (marzo 2026)

Lo que pasó después de escribir el plan. **FASES 1 a 8 completas**, más un
montón de cosas que el plan no pedía.

## Desvíos

| Plan decía | Realidad | Por qué |
| --- | --- | --- |
| "Sin login, sin usuarios" (§1, §22, §41) | **Login con contraseña**, cookie firmada HMAC-SHA256 | La app pasó a estar en la nube para abrirse desde el celular. Una agenda financiera sin contraseña en internet es una cuenta bancaria al aire. Sigue siendo single-user: no hay usuarios ni roles. |
| SQLite (§2) | **PostgreSQL** en producción (Supabase), SQLite en dev y tests | Render free tier no tiene disco persistente: con SQLite el archivo se perdía en cada redeploy. |
| `Category.icon` (§5) | `Category.color` | No emojis en la interfaz. El color reemplaza al ícono y se elige de una paleta de diez. |
| Categorías aparte en el frontend (§31) | Mergen en **Configuración** | Dos pantallas para lo mismo. |
| Sin navbar de recurrentes/cuotas (§25) | No están, así que no hay links muertos | — |
| FASE 11 Estadísticas = V2 | **Estadísticas está dentro del MVP** | Son tres gráficos y ya usaban los datos que existían. |
| FASE 8 "formato de moneda" | Pesos argentinos, `es-AR` | — |
| Sin refuerzos de saldo | **No se puede gastar ni transferir más de lo que hay** | Pedido posterior. Bloquea en 422; las cuentas de tipo Crédito quedan exentas porque su saldo negativo es la deuda. |
| Sin thinking en transferencias | **Una transferencia mal hecha se puede deshacer**, y van las dos patas | Antes quedaban clavadas: la UI escondía el botón de borrar y la API mandaba a un endpoint inexistente. |

## Decisiones que el plan no anticipó

- **El saldo nunca se guarda**, se calcula de los movimientos. Esto ya estaba en
  el plan (§4) y se respetó: es la decisión de diseño más importante del proyecto.
- **Transferencias excluidas de ingresos y gastos.** Mover plata entre cuentas
  propias no es gastar ni ganar.
- **Nada se borra de verdad.** Cuentas y categorías se dan de baja (`active`) y
  se pueden reactivar. Solo los movimientos se borran.
- **Todo bajo `/api`**, en un solo proceso: FastAPI sirve la API y el frontend
  compilado. También soporta deploy partido (Vercel + Render).
- **Deploy gratuito**: Supabase + Render + Vercel, en el tier gratis.
- **Tests**: 118, cuando el plan hablaba de "no exagerar".

## Fases 9 a 14

Las seis siguen sin empezar, en el orden del plan:

| Fase | Qué | Estado |
| --- | --- | --- |
| 9 | Recurrentes | No empezada |
| 10 | Cuotas | No empezada |
| 11 | Estadísticas | **Ya existe** (se adelantó) |
| 12 | Presupuestos | No empezada |
| 13 | Metas | No empezada |
| 14 | Backup / CSV | No empezada |

Sobre el backup: el plan lo marcaba importante en §21 pero lo dejaba para el
final. En producción sigue siendo el agujero más grande — la base vive en
Supabase y si algo se rompe no hay copia. Los gastos recurrentes y las cuotas
tienen el campo `upcoming` ya reservado en el contrato del dashboard para cuando
se hagan.

## Deuda técnica conocida

- **242 DeprecationWarnings** en Python 3.14, de `asyncio.iscoroutinefunction`
  en FastAPI/Starlette. Ruido en el log, no rompe nada. Se va bumpeando FastAPI.
- **Un bug sin causa raíz cerrada**: guardar income/gasto en producción daba
  "Failed to fetch" en algunos casos. Se descartaron todas las causas
  alcanzables (preflight, CORS, insert en Postgres, `pool_pre_ping`, path del
  frontend) pero nunca se pudo reproducir sin una sesión válida. Un middleware
  nuevo volvió los 500 legibles desde la web, así que si vuelve a pasar se va a
  ver el error real en vez de "Failed to fetch".
- **Contraseña de Supabase expuesta** y sin rotar. Hay que cambiarla en el
  dashboard y actualizar `DATABASE_URL` en Render.
