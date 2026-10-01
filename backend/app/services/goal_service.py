"""Goals: what you are saving for.

Nothing in here touches `transactions`, on purpose. The saved amount is typed
by hand, so a goal is a note about a promise and not a second source of truth
about the money. Whatever gets derived — progress, what's left, how many days
are left — is derived on read, so there is nothing to keep in sync and nothing
to migrate if a rule changes.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Goal
from app.money import to_cents, to_pesos
from app.schemas.goal import GoalCreate, GoalList, GoalRead, GoalUpdate

EN_PROGRESO = "en_progreso"
CUMPLIDA = "cumplida"
VENCIDA = "vencida"


# --------------------------------------------------------------------------- #
# Lectura
# --------------------------------------------------------------------------- #
def list_goals(db: Session, include_inactive: bool = False) -> GoalList:
    """Active goals first, then the ones with the nearest date.

    Goals with no deadline go last within their group, not first: a goal for
    "algún día" should not sit above one that expires in a week. Newest last so
    a freshly created goal is where the eye already is.
    """
    query = select(Goal)
    if not include_inactive:
        query = query.where(Goal.active.is_(True))
    goals = (
        db.execute(
            query.order_by(
                Goal.active.desc(), Goal.deadline.is_(None), Goal.deadline, Goal.id.desc()
            )
        )
        .scalars()
        .all()
    )
    items = [to_read(goal) for goal in goals]
    return GoalList(items=items, total=len(items))


def to_read(goal: Goal, today: date | None = None) -> GoalRead:
    """Build the wire shape, computing everything that is not stored.

    `today` is a parameter so tests can pin "now" without freezing the clock.
    """
    # El día local, no el de UTC: si el usuario está en Argentina y son las 22,
    # `utcnow().date()` todavía dice que es mañana y la meta aparece vencida un
    # día antes.
    today = today or datetime.now(UTC).astimezone().date()
    remaining = goal.target_amount - goal.current_amount
    return GoalRead(
        id=goal.id,
        name=goal.name,
        target_amount=to_pesos(goal.target_amount),
        current_amount=to_pesos(goal.current_amount),
        deadline=goal.deadline,
        active=goal.active,
        # Sin tope en 100: pasarse es una buena noticia y el número tiene que
        # decirla. El ancho de la barra lo recorta la pantalla, no el dato.
        progress=(
            round(goal.current_amount * 100 / goal.target_amount, 1) if goal.target_amount else 0.0
        ),
        remaining=to_pesos(max(remaining, 0)),
        days_left=(goal.deadline - today).days if goal.deadline else None,
        status=_status(goal, today),
        created_at=goal.created_at,
    )


# --------------------------------------------------------------------------- #
# Escritura
# --------------------------------------------------------------------------- #
def create(db: Session, payload: GoalCreate) -> GoalRead:
    """Create a goal.

    La conversión a centavos vive acá y no en el router: acá se necesitan los
    dos montos juntos para compararlos, así que el que los resuelve es el que
    valida.
    """
    target = to_cents(payload.target_amount)
    current = to_cents(payload.current_amount)
    _check_pair(target, current)

    goal = Goal(
        # El schema ya recorta el nombre; el .strip() es por si alguien escribe
        # el campo saltándose la validación, no por confianza.
        name=payload.name.strip(),
        target_amount=target,
        current_amount=current,
        deadline=payload.deadline,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return to_read(goal)


def update(db: Session, goal: Goal, payload: GoalUpdate) -> GoalRead:
    """Apply only the fields that came in the body.

    Los montos se resuelven primero y se validan el par nuevo: si en el mismo
    PUT bajás el tope y subís lo juntado, lo que vale es lo que mandaste, no
    lo que quedó guardado de una vez.
    """
    data = payload.model_dump(exclude_unset=True)

    target = goal.target_amount
    if "target_amount" in data:
        target = to_cents(data["target_amount"])
    current = goal.current_amount
    if "current_amount" in data:
        current = to_cents(data["current_amount"])
    _check_pair(target, current)

    if "name" in data and data["name"] is not None:
        goal.name = data["name"].strip()
    if "target_amount" in data:
        goal.target_amount = target
    if "current_amount" in data:
        goal.current_amount = current
    # `"deadline" in data` con valor None es la forma de borrar la fecha.
    if "deadline" in data:
        goal.deadline = data["deadline"]
    if "active" in data and data["active"] is not None:
        goal.active = data["active"]

    db.commit()
    db.refresh(goal)
    return to_read(goal)


def delete(db: Session, goal: Goal) -> None:
    """Borrado duro. Una meta no tiene filas que dependan de ella."""
    db.delete(goal)
    db.commit()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _status(goal: Goal, today: date) -> str:
    """Cumplida le gana a vencida: llegar al monto con la fecha pasada sigue
    siendo haber llegado, y taparlo con "vencida" sería mentir."""
    if goal.current_amount >= goal.target_amount:
        return CUMPLIDA
    if goal.deadline is not None and goal.deadline < today:
        return VENCIDA
    return EN_PROGRESO


def _check_pair(target: int, current: int) -> None:
    """Sólo los dos casos obvios.

    No se exige que lo juntado quede por debajo del tope: una meta que ya se
    cumplió y a la que se le carga un poco más sigue cumplida, y frenar eso
    obligaría al usuario a sacar plata de la meta para guardar la cifra.
    `remaining` se recorta en cero y el porcentaje pasa de 100, que es la
    forma de que los dos números cuenten la verdad.
    """
    if target <= 0:
        raise ValueError("La meta tiene que ser un monto mayor a cero.")
    if current < 0:
        raise ValueError("Lo juntado no puede ser negativo.")
