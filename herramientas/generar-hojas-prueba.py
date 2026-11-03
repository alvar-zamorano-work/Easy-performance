"""Hojas de cálculo de prueba para la importación: el mismo export ficticio de Jira en .xlsx, .xls (97-2003),
.xls que es una tabla HTML y CSV de referencia. Con una fila de título encima de los títulos, como los exports
guardados desde Excel, fechas como celdas de fecha y textos con acentos y caracteres fuera de Latin-1.
Determinista. Uso: python3 herramientas/generar-hojas-prueba.py datos-sinteticos/hojas
El .xls lo convierte LibreOffice (soffice) desde el .xlsx."""
import csv, datetime as dt, html, os, random, subprocess, sys

dest = sys.argv[1] if len(sys.argv) > 1 else 'datos-sinteticos/hojas'
os.makedirs(dest, exist_ok=True)
rnd = random.Random(20261030)
equipos = ['Pagos', 'App móvil', 'Datos & IA', 'Portal clientes']
tipos = ['Story', 'Bug', 'Task', 'Story', 'Story']
palabras = ['revisar', 'cálculo', 'pantalla', 'pago', 'señal', 'integración', 'migración', 'informe', 'añadir', 'validación', '検証', 'Ωmega']
cab = ['Project', 'Key', 'Summary', 'Issue Type', 'Status', 'Created', 'Updated', 'Resolved', 'Assigned Team', 'Story Points', 'Sprint']
filas = []
inicio = dt.datetime(2026, 5, 4, 9, 0)
for i in range(1, 361):
    creada = inicio + dt.timedelta(days=rnd.randint(0, 150), hours=rnd.randint(0, 9), minutes=rnd.choice([0, 15, 30, 45]))
    hecha = rnd.random() < 0.75
    resuelta = creada + dt.timedelta(days=rnd.randint(1, 20), hours=rnd.randint(0, 8)) if hecha else None
    if resuelta and resuelta > dt.datetime(2026, 10, 29, 12, 0): resuelta = None
    estado = 'Done' if resuelta else rnd.choice(['To Do', 'In Progress', 'In Review'])
    actual = resuelta or creada + dt.timedelta(days=rnd.randint(0, 5))
    resumen = ' '.join(rnd.choice(palabras) for _ in range(rnd.randint(4, 9))).capitalize() + f' nº {i}'
    filas.append(['Banco ficticio', f'BAN-{i}', resumen, rnd.choice(tipos), estado, creada, actual, resuelta,
                  equipos[i % 4], rnd.choice([1, 2, 3, 5, 8, 17.5, None]), f'2026.{(i % 6) + 1} Sprint'])
titulo = 'Displaying 360 issues at 29/Oct/26 12:16 PM.'

# CSV de referencia: sin fila de título, fechas ISO
fmt = lambda v: '' if v is None else (v.strftime('%Y-%m-%d %H:%M') if isinstance(v, dt.datetime) else (str(v).rstrip('0').rstrip('.') if isinstance(v, float) else str(v)))
with open(os.path.join(dest, 'referencia.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f); w.writerow(cab); [w.writerow([fmt(v) for v in r]) for r in filas]

# .xlsx con fila de título y celdas de fecha
from openpyxl import Workbook
wb = Workbook(); ws = wb.active; ws.title = 'Jira'
ws.append([titulo]); ws.append(cab)
for r in filas: ws.append(r)
for row in ws.iter_rows(min_row=3, min_col=6, max_col=8):
    for c in row:
        if c.value is not None: c.number_format = 'dd/mm/yyyy hh:mm'
xlsx = os.path.join(dest, 'jira-con-titulo.xlsx'); wb.save(xlsx)

# .xls 97-2003 convertido por LibreOffice
subprocess.run(['soffice', '--headless', '--convert-to', 'xls:MS Excel 97', '--outdir', dest, xlsx], check=True, capture_output=True)

# ".xls" que es HTML, como el "Excel" de Jira Server
with open(os.path.join(dest, 'jira-html.xls'), 'w', encoding='utf-8') as f:
    f.write('<html><head><meta charset="utf-8"></head><body><table><tr><td>Jira</td></tr></table>\n<table id="issuetable">')
    f.write('<tr>' + ''.join(f'<th>{html.escape(c)}</th>' for c in cab) + '</tr>')
    for r in filas:
        f.write('<tr>' + ''.join(f'<td>{html.escape(v.strftime("%d/%b/%y %I:%M %p") if isinstance(v, dt.datetime) else fmt(v))}</td>' for v in r) + '</tr>\n')
    f.write('</table></body></html>')
print('hecho', len(filas), 'filas')
