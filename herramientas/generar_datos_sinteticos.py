"""Genera exports sintéticos de Jira Cloud para probar Easy Performance.

Cuatro equipos, 52 semanas, sprints de dos semanas y estados intermedios.
Cada equipo tiene un patrón sembrado:
  Pagos            equipo sano
  App móvil        trabajo atascado y mucha espera en revisión y bloqueos
  Portal clientes  pendiente que crece y casi todo marcado como urgente
  Datos            errores al alza, retrabajo, cierres al final del sprint,
                   estimaciones que no predicen y algunos datos poco fiables

Uso:  python3 generar_datos_sinteticos.py <carpeta_salida>
Es reproducible: la misma semilla da siempre los mismos ficheros.
"""
import csv
import json
import math
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

SEMILLA = 7
INICIO = datetime(2025, 10, 13)          # lunes
EXPORT_FINAL = datetime(2026, 10, 12, 9, 0)
EXPORT_ANTIGUO = datetime(2026, 4, 6, 9, 0)
JORNADA_INICIO, JORNADA_HORAS = 8, 11.0

STATUS = {  # nombre: (id, categoría)
    "To Do": ("10000", "To Do"),
    "In Progress": ("3", "In Progress"),
    "In Review": ("10003", "In Progress"),
    "Blocked": ("10004", "In Progress"),
    "Done": ("10002", "Done"),
}
MESES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# ---------- tiempo en "días laborables" ----------
# Coordenada w: parte entera = índice de día laborable desde INICIO; fracción = posición en la jornada.
_dias = []
_d = INICIO
while _d < datetime(2027, 3, 1):
    if _d.weekday() < 5:
        _dias.append(_d)
    _d += timedelta(days=1)


def a_fecha(w):
    i = int(math.floor(w))
    f = w - i
    return _dias[i] + timedelta(hours=JORNADA_INICIO + f * JORNADA_HORAS)


def a_w(dt):
    for i, d in enumerate(_dias):
        if d.date() == dt.date():
            f = (dt.hour + dt.minute / 60 - JORNADA_INICIO) / JORNADA_HORAS
            return i + min(max(f, 0.0), 0.999)
        if d.date() > dt.date():
            return float(i)
    raise ValueError(dt)


W_FINAL = a_w(EXPORT_FINAL)
W_ANTIGUO = a_w(EXPORT_ANTIGUO)
N_DIAS = int(W_FINAL) + 1


def semana_de(w):
    return int(w) // 5


def sprint_de(w):
    return int(w) // 10 + 1  # 10 días laborables = 2 semanas


def fin_sprint_w(n):
    return n * 10.0  # inicio del sprint siguiente


def fmt_jira(dt):
    h = dt.hour % 12 or 12
    ampm = "AM" if dt.hour < 12 else "PM"
    return f"{dt.day:02d}/{MESES[dt.month - 1]}/{dt.year % 100:02d} {h}:{dt.minute:02d} {ampm}"


def fmt_iso(dt):
    return dt.strftime("%Y-%m-%d %H:%M:%S.") + f"{dt.microsecond // 1000:03d}"


def lognorm(rng, mediana, sigma):
    return mediana * math.exp(rng.gauss(0, sigma))


# ---------- equipos ----------
EQUIPOS = [
    dict(nombre="Pagos", prefijo="PAG", componente="API",
         llegadas=lambda s: 7.0, wip=lambda s: 6, prio_primero=True,
         prioridades=[("Highest", 5), ("High", 20), ("Medium", 50), ("Low", 25)],
         p_error=lambda s: 0.10, activo_por_puntos=True, sigma_activo=0.4,
         revision=lambda s: (0.5, 0.6), p_bloqueo=lambda s: 0.05, bloqueo=lambda s: (1.5, 0.4),
         p_retrabajo=0.06, p_final_sprint=0.0, p_salto=0.0,
         epicas=["Pago con Bizum", "Conciliación bancaria", "Antifraude"]),
    dict(nombre="App móvil", prefijo="MOV", componente="Mobile",
         llegadas=lambda s: 6.5, wip=lambda s: 6 if s < 44 else 14, prio_primero=True,
         prioridades=[("Highest", 5), ("High", 25), ("Medium", 50), ("Low", 20)],
         p_error=lambda s: 0.14, activo_por_puntos=True, sigma_activo=0.45,
         revision=lambda s: (0.7, 0.6) if s < 44 else (4.5, 0.7),
         p_bloqueo=lambda s: 0.06 if s < 44 else 0.32, bloqueo=lambda s: (1.5, 0.4) if s < 44 else (5.0, 0.6),
         p_retrabajo=0.08, p_final_sprint=0.0, p_salto=0.0,
         epicas=["Rediseño de la home", "Notificaciones push", "Acceso biométrico"]),
    dict(nombre="Portal clientes", prefijo="POR", componente="Web",
         llegadas=lambda s: 6.0 if s < 34 else 10.5, wip=lambda s: 5, prio_primero=False,
         prioridades=[("Critical", 12), ("Highest", 30), ("High", 25), ("Medium", 23), ("Low", 10)],
         p_error=lambda s: 0.12, activo_por_puntos=True, sigma_activo=0.45,
         revision=lambda s: (0.7, 0.6), p_bloqueo=lambda s: 0.08, bloqueo=lambda s: (2.0, 0.5),
         p_retrabajo=0.05, p_final_sprint=0.0, p_salto=0.0,
         epicas=["Área privada", "Facturas online", "Chat de atención"]),
    dict(nombre="Datos", prefijo="DAT", componente="API",
         llegadas=lambda s: 6.0, wip=lambda s: 11, prio_primero=True,
         prioridades=[("Highest", 6), ("High", 24), ("Medium", 50), ("Low", 20)],
         p_error=lambda s: 0.12 if s < 24 else min(0.12 + (s - 24) * 0.014, 0.50),
         activo_por_puntos=False, sigma_activo=0.7,
         revision=lambda s: (0.8, 0.6), p_bloqueo=lambda s: 0.05, bloqueo=lambda s: (1.5, 0.4),
         p_retrabajo=lambda s: 0.12 if s < 30 else min(0.12 + (s - 30) * 0.015, 0.45), p_final_sprint=0.6, p_salto=0.08,
         epicas=["Cuadro de mando de ventas", "Migración del almacén de datos", "Calidad de datos"]),
]

ASUNTOS = {
    "Pagos": ["el pago con tarjeta", "la confirmación 3DS", "el recibo en PDF", "la devolución parcial",
              "el alta de IBAN", "la pasarela de pagos", "el límite diario", "el pago recurrente"],
    "App móvil": ["la pantalla de inicio", "el inicio de sesión", "las notificaciones", "el modo oscuro",
                  "la cámara de documentos", "el menú lateral", "la huella digital", "el perfil"],
    "Portal clientes": ["el área privada", "la descarga de facturas", "el formulario de contacto",
                        "el buscador", "el chat", "el cambio de contraseña", "la página de tarifas", "el registro"],
    "Datos": ["el informe de ventas", "la carga nocturna", "el modelo de clientes", "el cuadro de mando",
              "la tabla de pedidos", "la exportación a Excel", "el cálculo de márgenes", "la ingesta de CRM"],
}
VERBOS_HISTORIA = ["Mejorar", "Añadir filtros a", "Rediseñar", "Permitir editar", "Automatizar", "Validar"]
VERBOS_ERROR = ["Error en", "Fallo al cargar", "Datos incorrectos en", "Se bloquea", "No responde"]
VERBOS_TAREA = ["Actualizar dependencias de", "Documentar", "Revisar permisos de", "Limpiar código de"]


def simular(rng):
    """Devuelve la lista de tareas con su línea de estados completa (puede acabar después de la exportación)."""
    tareas = []
    clave = 1
    # épicas primero
    epicas = {}
    for eq in EQUIPOS:
        for nombre in eq["epicas"]:
            epicas.setdefault(eq["nombre"], []).append(dict(
                clave=f"PLAT-{clave}", id=10000 + clave, equipo=eq["nombre"], tipo="Epic", asunto=nombre,
                creada=rng.uniform(0, 0.5), segmentos=None, prioridad="Medium", puntos=None,
                epica=None, etiquetas="", resolucion_especial=None))
            clave += 1
    for e in epicas.values():
        tareas.extend(e)

    for eq in EQUIPOS:
        nombre = eq["nombre"]
        llegadas_por_dia = []
        for d in range(N_DIAS + 120):
            s = semana_de(d)
            lam = eq["llegadas"](s) / 5.0
            n = 0
            # Poisson simple
            L, p, k = math.exp(-lam), 1.0, 0
            while True:
                p *= rng.random()
                if p < L:
                    break
                k += 1
            n = k
            llegadas_por_dia.append(n)

        pendiente = []
        en_curso = []
        for d in range(N_DIAS + 100):
            s = semana_de(d)
            # terminar
            en_curso = [t for t in en_curso if t["fin"] > d]
            # llegadas
            for _ in range(llegadas_por_dia[d]):
                creada = d + rng.uniform(0, 0.95)
                r = rng.random()
                if r < eq["p_error"](s):
                    tipo = "Bug"
                elif r < eq["p_error"](s) + 0.12:
                    tipo = "Task"
                else:
                    tipo = "Story"
                prio = rng.choices([p for p, _ in eq["prioridades"]], [w for _, w in eq["prioridades"]])[0]
                if tipo == "Story":
                    puntos = rng.choices([1, 2, 3, 5, 8], [8, 25, 35, 22, 10])[0]
                elif tipo == "Bug":
                    puntos = rng.choices([None, 1, 2, 3], [30, 30, 25, 15])[0]
                else:
                    puntos = rng.choices([None, 1, 2], [60, 25, 15])[0]
                listo = creada + lognorm(rng, 2.5, 0.8)
                t = dict(clave=None, equipo=nombre, tipo=tipo, prioridad=prio, puntos=puntos,
                         creada=creada, listo=listo, epica=rng.choice(epicas[nombre]),
                         etiquetas="deuda-tecnica" if tipo == "Task" and rng.random() < 0.4 else "",
                         resolucion_especial=None)
                pendiente.append(t)
                tareas.append(t)
            # empezar
            orden = {"Critical": 0, "Highest": 1, "High": 2, "Medium": 3, "Low": 4}
            disponibles = [t for t in pendiente if t["listo"] <= d + 1]
            if eq["prio_primero"]:
                disponibles.sort(key=lambda t: (orden[t["prioridad"]], t["creada"]))
            else:
                disponibles.sort(key=lambda t: t["creada"])
            while len(en_curso) < eq["wip"](s) and disponibles:
                t = disponibles.pop(0)
                pendiente.remove(t)
                inicio = max(t["listo"], d + rng.uniform(0, 0.9))
                construir_segmentos(rng, eq, t, inicio, s)
                en_curso.append(t)
    # claves en orden de creación
    normales = sorted([t for t in tareas if t["tipo"] != "Epic"], key=lambda t: t["creada"])
    for t in normales:
        t["clave"] = f"PLAT-{clave}"
        t["id"] = 10000 + clave
        clave += 1
    # cierre en bloque en Datos: tareas terminadas esos días se cierran todas en el mismo minuto
    w_bloque = a_w(datetime(2026, 8, 21, 17, 30))
    candidatas = [t for t in normales if t["equipo"] == "Datos" and t.get("fin") is not None
                  and w_bloque - 9 < t["fin"] < w_bloque and t["segmentos"][-1][0] == "Done"]
    for t in candidatas[:14]:
        seg = t["segmentos"]
        nombre, a, _ = seg[-2]
        seg[-2] = (nombre, a, w_bloque)
        seg[-1] = ("Done", w_bloque, None)
        t["fin"] = w_bloque
    for t in normales:
        if "segmentos" not in t:
            t["segmentos"] = [("To Do", t["creada"], None)]
            t["inicio"] = None
    return tareas


def construir_segmentos(rng, eq, t, inicio, s):
    pts = t["puntos"] or 2
    if eq["activo_por_puntos"]:
        base = {1: 0.7, 2: 1.2, 3: 2.0, 5: 3.2, 8: 5.0}[pts]
        activo = lognorm(rng, base, eq["sigma_activo"])
    else:
        activo = lognorm(rng, 2.3, eq["sigma_activo"])
    rev_m, rev_s = eq["revision"](s)
    seg = [("To Do", t["creada"], inicio)]
    w = inicio
    if rng.random() < eq["p_salto"]:
        # se cierra sin pasar por en curso: dato poco fiable
        fin = inicio + activo
        seg.append(("Done", fin, None))
        t["segmentos"], t["inicio"], t["fin"] = seg, None, fin
        return
    bloqueado = rng.random() < eq["p_bloqueo"](s)
    if bloqueado:
        b_m, b_s = eq["bloqueo"](s)
        mitad = activo / 2
        seg.append(("In Progress", w, w + mitad)); w += mitad
        b = lognorm(rng, b_m, b_s)
        seg.append(("Blocked", w, w + b)); w += b
        seg.append(("In Progress", w, w + mitad)); w += mitad
    else:
        seg.append(("In Progress", w, w + activo)); w += activo
    r = lognorm(rng, rev_m, rev_s)
    seg.append(("In Review", w, w + r)); w += r
    vueltas = 0
    p_rt = eq["p_retrabajo"](s) if callable(eq["p_retrabajo"]) else eq["p_retrabajo"]
    while rng.random() < (p_rt if vueltas == 0 else 0.35) and vueltas < 2:
        extra = lognorm(rng, 0.8, 0.5)
        seg.append(("In Progress", w, w + extra)); w += extra
        r2 = lognorm(rng, rev_m * 0.6, rev_s)
        seg.append(("In Review", w, w + r2)); w += r2
        vueltas += 1
    fin = w
    if eq["p_final_sprint"] and rng.random() < eq["p_final_sprint"]:
        n = sprint_de(fin)
        objetivo = fin_sprint_w(n) - rng.uniform(0.05, 1.9)
        if objetivo > fin:
            nombre, a, _ = seg[-1]
            seg[-1] = (nombre, a, objetivo)
            fin = objetivo
    seg.append(("Done", fin, None))
    t["segmentos"], t["inicio"], t["fin"] = seg, inicio, fin


def estado_en(t, W):
    """Estado de la tarea vista en el instante W (coordenada laborable)."""
    if t["creada"] > W:
        return None
    if t["tipo"] == "Epic":
        return dict(estado="In Progress", tis="", resuelta=None, cambio_cat=t["creada"], actualizada=t["creada"] + 1)
    segs = []
    for nombre, a, b in t["segmentos"]:
        if a > W:
            break
        fin = b if (b is not None and b <= W) else None
        segs.append((nombre, a, fin))
    actual = segs[-1][0]
    acumulado = {}
    for nombre, a, b in segs:
        n, ms = acumulado.get(nombre, (0, 0))
        dur = 0
        if b is not None:
            dur = int((a_fecha(b) - a_fecha(a)).total_seconds() * 1000)
        acumulado[nombre] = (n + 1, ms + dur)
    tis = "_*|*_".join(f"{STATUS[n][0]}_*:*_{c}_*:*_{ms}" for n, (c, ms) in acumulado.items())
    resuelta = segs[-1][1] if actual == "Done" else None
    # último cambio de categoría
    cat_prev, cambio = None, t["creada"]
    for nombre, a, _ in segs:
        cat = STATUS[nombre][1]
        if cat != cat_prev:
            cambio = a
            cat_prev = cat
    actualizada = segs[-1][1]
    return dict(estado=actual, tis=tis, resuelta=resuelta, cambio_cat=cambio, actualizada=actualizada)


def sprints_en(t, W, prefijo):
    if t["tipo"] == "Epic" or t.get("inicio") is None:
        # pendientes recientes comprometidos en el sprint actual
        if t["tipo"] != "Epic" and t.get("comprometida"):
            return [f"{prefijo} Sprint {sprint_de(W)}"]
        return []
    if t["inicio"] > W:
        return []
    n0 = sprint_de(t["inicio"])
    fin = t["fin"] if t["fin"] <= W else W
    n1 = sprint_de(fin - 1e-6)
    return [f"{prefijo} Sprint {n}" for n in range(n0, n1 + 1)]


def asunto(rng, t):
    return _asunto(rng, t).replace(" de el ", " del ").replace(" a el ", " al ")


def _asunto(rng, t):
    if t["tipo"] == "Epic":
        return t["asunto"]
    objeto = rng.choice(ASUNTOS[t["equipo"]])
    if t["tipo"] == "Bug":
        return f"{rng.choice(VERBOS_ERROR)} {objeto}"
    if t["tipo"] == "Task":
        return f"{rng.choice(VERBOS_TAREA)} {objeto}"
    return f"{rng.choice(VERBOS_HISTORIA)} {objeto}"


CABECERAS = ["Summary", "Issue key", "Issue id", "Issue Type", "Status", "Project key", "Project name",
             "Project type", "Priority", "Resolution", "Assignee", "Reporter", "Created", "Updated",
             "Resolved", "Components", "Labels", "Description", "Custom field (Story Points)",
             "Custom field (Team)", "Sprint", "Sprint", "Sprint", "Sprint",
             "Custom field ([CHART] Date of First Response)", "Custom field ([CHART] Time in Status)",
             "Parent", "Parent key", "Parent summary", "Status category", "Status category changed"]


def filas(tareas, W, rng_textos, filtro=lambda t, e: True):
    eq_por_nombre = {e["nombre"]: e for e in EQUIPOS}
    salida = []
    for t in sorted(tareas, key=lambda x: -x["id"]):
        e = estado_en(t, W)
        if e is None or not filtro(t, e):
            continue
        eq = eq_por_nombre[t["equipo"]]
        sp = sprints_en(t, W, eq["prefijo"])
        sp += [""] * (4 - len(sp))
        resolucion = ""
        if e["estado"] == "Done":
            resolucion = t.get("resolucion_especial") or "Done"
        creada = a_fecha(t["creada"])
        primera = ""
        if t["tipo"] != "Epic":
            primera = fmt_iso(creada + timedelta(hours=t["respuesta_h"]))
        epica = t.get("epica")
        salida.append([
            t["asunto_txt"], t["clave"], t["id"], t["tipo"], e["estado"], "PLAT", "Plataforma Digital",
            "software", t["prioridad"], resolucion, t["persona"], t["informador"],
            fmt_jira(creada), fmt_jira(a_fecha(e["actualizada"])),
            fmt_jira(a_fecha(e["resuelta"])) if e["resuelta"] is not None else "",
            eq["componente"], t.get("etiquetas", ""), t["descripcion"],
            "" if t.get("puntos") is None else f"{float(t['puntos'])}",
            t["equipo"], *sp[:4], primera, e["tis"],
            epica["id"] if epica else "", epica["clave"] if epica else "", epica["asunto"] if epica else "",
            STATUS[e["estado"]][1], fmt_jira(a_fecha(e["cambio_cat"])),
        ])
    return salida


def escribir(ruta, rows):
    with open(ruta, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(CABECERAS)
        w.writerows(rows)


def main(salida):
    rng = random.Random(SEMILLA)
    tareas = simular(rng)
    rt = random.Random(SEMILLA + 1)
    personas = {e["nombre"]: [f"Persona {e['prefijo']}{i}" for i in range(1, 6)] for e in EQUIPOS}
    for t in tareas:
        t["asunto_txt"] = asunto(rt, t)
        t["persona"] = rt.choice(personas[t["equipo"]]) if t["tipo"] != "Epic" else ""
        t["informador"] = rt.choice(personas[t["equipo"]])
        t["respuesta_h"] = rt.uniform(0.3, 30)
        t["descripcion"] = rt.choice([
            "", "Como cliente quiero hacerlo \"sin salir\" de la pantalla, con un solo paso.",
            "Criterios de aceptación:\n- funciona en móvil\n- registra el evento, con fecha",
            "Ver detalle en la reunión del martes; hay dudas sobre el alcance.",
        ])
        if t["tipo"] != "Epic" and t.get("inicio") is None and t["creada"] > W_FINAL - 10:
            t["comprometida"] = rt.random() < 0.3

    out = Path(salida)
    out.mkdir(parents=True, exist_ok=True)
    completo = filas(tareas, W_FINAL, rt)
    escribir(out / "jira-ejemplo-completo-2026-10-12.csv", completo)

    # tres exports solapados para probar la carpeta (uno antiguo y dos actuales partidos por fecha)
    corte = a_w(datetime(2026, 1, 1))
    marzo = a_w(datetime(2026, 3, 1))
    escribir(out / "jira-2026-04-06.csv", filas(tareas, W_ANTIGUO, rt))
    escribir(out / "jira-2026-10-12-parte-a.csv",
             filas(tareas, W_FINAL, rt, lambda t, e: t["creada"] >= corte))
    parte_b = filas(tareas, W_FINAL, rt, lambda t, e: t["creada"] < corte and e["actualizada"] >= marzo)
    if parte_b:
        escribir(out / "jira-2026-10-12-parte-b.csv", parte_b)

    resumen = {"tareas": len(completo), "fecha_export": EXPORT_FINAL.isoformat(),
               "equipos": [e["nombre"] for e in EQUIPOS],
               "casos_sembrados": {
                   "Pagos": [],
                   "App móvil": ["atascado", "mucha_espera", "demasiado_a_la_vez"],
                   "Portal clientes": ["pendiente_crece", "todo_urgente", "urgente_no_rapido"],
                   "Datos": ["errores_capacidad", "retrabajo", "todo_al_final",
                             "estimaciones_no_predicen", "datos_poco_fiables"]}}
    (out / "escenarios.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(resumen, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "ejemplo")
