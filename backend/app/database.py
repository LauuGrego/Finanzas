from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event, func, select, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app import config

def normalize_url(url: str) -> str:
    """Le pone a la URL el driver que realmente está instalado.

    SQLAlchemy apunta a psycopg2 con el prefijo pelado (`postgresql://`), pero el
    driver instalado es psycopg 3. Sin esto, una URL copiada tal cual de la
    consola de Supabase revienta al importar el driver, con un
    `ModuleNotFoundError: psycopg2` que no dice nada de bases de datos y sí
    parece un problema de instalación.
    """
    if url.startswith("postgresql+psycopg://") or url.startswith("postgresql+"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    return url


if config.DATABASE_URL:
    url = normalize_url(config.DATABASE_URL)

    # PostgreSQL en la nube. `pre_ping` evita que una conexión muerta por el
    # pooler de Supabase se convierta en un error 500 para el usuario.
    engine = create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        # El pooler de Supabase corta conexiones ociosas; al reconectar hay que
        # renegociar TLS o el servidor rechaza la sesión.
        connect_args={"sslmode": "require"} if "sslmode=" not in url else {},
    )
else:
    # SQLite local. El path sale de config para que un deploy pueda apuntarlo
    # a un disco persistente.
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{config.DB_PATH}", connect_args={"check_same_thread": False}
    )

    @event.listens_for(engine, "connect")
    def _configure_sqlite(dbapi_connection, _connection_record) -> None:
        # foreign_keys no viene activado en SQLite, y sin esto el ON DELETE
        # CASCADE de los models no existe.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def sync_sequences(db: Session) -> None:
    """Adelanta la secuencia de `id` de cada tabla hasta pasar los ids que ya hay.

    Postgres numera los `id` con una secuencia que vive aparte de la tabla, y las
    dos se desincronizan sin que nada avise: si alguna vez se insertó una fila con
    el `id` puesto a mano —un `INSERT` en la consola de Supabase, un
    `pg_restore`, una siembra sobre una base ya hecha— la secuencia sigue
    creyendo que la tabla está vacía y el primer insert real revienta con
    `duplicate key value violates unique constraint "accounts_pkey"`.

    `create_all` no lo arregla: no toca las tablas que ya existen. Y el plan no
    tiene paso de migración, así que la reparación va en el arranque: una consulta
    por tabla, solo en Postgres, y solo si la secuencia quedó atrás.

    `setval(..., false)` para que el próximo `nextval` devuelva exactamente el
    valor puesto: con el default `true` devolvería `max + 2` y se saltaría un id.

    Nunca retrocede. Adelantarla es lo que arregla; bajarla podría regalar un id
    que otra sesión ya tiene asignado y el problema volvería.
    """
    if engine.dialect.name != "postgresql":
        return

    for tabla in Base.metadata.sorted_tables:
        secuencia = db.scalar(
            text("SELECT pg_get_serial_sequence(:tabla, 'id')"), {"tabla": tabla.name}
        )
        if not secuencia:
            continue

        siguiente = (db.scalar(select(func.coalesce(func.max(tabla.c.id), 0))) or 0) + 1

        # La secuencia viene como `public.accounts_id_seq`. Se parte solo para
        # comparar contra la vista de catálogo `pg_sequences`, y las dos mitades
        # van como parámetros: no se arma SQL con texto.
        esquema, _, nombre = secuencia.rpartition(".")
        actual = db.scalar(
            text(
                "SELECT last_value FROM pg_sequences"
                " WHERE schemaname = :esquema AND sequencename = :nombre"
            ),
            {"esquema": esquema, "nombre": nombre},
        )
        if actual is not None and actual >= siguiente:
            continue

        db.execute(
            text("SELECT setval(CAST(:seq AS regclass), :siguiente, false)"),
            {"seq": secuencia, "siguiente": siguiente},
        )

    db.commit()


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
