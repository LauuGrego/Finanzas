from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
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


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
