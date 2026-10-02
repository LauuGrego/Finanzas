from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, func, select, text
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


def _is_remote(url: str) -> bool:
    """Whether the server is not on this machine.

    `sslmode=require` against the container refuses to start, because it has no
    certificate to offer. It is what makes the Supabase connection survive the
    pooler reconnecting, so it stays on for anything that is not localhost.
    """
    return not any(host in url for host in ("localhost", "127.0.0.1", "::1"))


url = normalize_url(config._database_url())

# `pre_ping` evita que una conexión muerta por el pooler de Supabase se convierta
# en un error 500 para el usuario. El pool chico es por lo mismo: Supabase corta
# conexiones ociosas y hay que poder reconectar sin comerse el límite.
engine = create_engine(
    url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
    # Al reconectar hay que renegociar TLS o el servidor rechaza la sesión. Solo
    # en la nube: el Postgres local no lo pide y con `require` no arranca.
    connect_args={"sslmode": "require"} if "sslmode=" not in url and _is_remote(url) else {},
)


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
    por tabla, y solo si la secuencia quedó atrás.

    `setval(..., false)` para que el próximo `nextval` devuelva exactamente el
    valor puesto: con el default `true` devolvería `max + 2` y se saltaría un id.
    Como esto corre en cada arranque, perder un id por tabla por arranque sería
    perderlos para siempre.

    Nunca retrocede. Adelantarla es lo que arregla; bajarla podría regalar un id
    que otra sesión ya tiene asignado y el problema volvería. El `last_value` de
    `pg_sequences` es NULL mientras la secuencia no entregó ningún valor, y en
    ese estado bajarla es inofensivo por definición: si no entregó nada, no hay
    id que regalar.
    """
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
