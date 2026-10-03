"""Generates the Prometheus self-monitoring dashboard (schema v1, POST /api/dashboards/db).

prometheus.py > prometheus.json     the dashboard
prometheus.py --exprs               every query, one per line, for validating against Prometheus
"""
import json
import sys

DS = {"type": "prometheus", "uid": "prometheus"}
NODE = 'job="prometheus-node"'  # node_exporter on the Prometheus host itself
ROOT = f'{NODE},mountpoint="/"'
panels, exprs = [], []
_id = [0]


def nid():
    _id[0] += 1
    return _id[0]


def targets(items):
    out = []
    for i, (expr, legend) in enumerate(items):
        exprs.append(expr)
        out.append({"refId": chr(65 + i), "datasource": DS, "expr": expr, "legendFormat": legend})
    return out


def row(title, y):
    panels.append({"id": nid(), "type": "row", "title": title, "collapsed": False,
                   "gridPos": {"h": 1, "w": 24, "x": 0, "y": y}, "panels": []})


def stat(title, expr, x, y, unit="none", steps=None, decimals=None, w=3):
    steps = steps or [{"color": "blue", "value": None}]
    d = {"unit": unit, "thresholds": {"mode": "absolute", "steps": steps}}
    if decimals is not None:
        d["decimals"] = decimals
    panels.append({"id": nid(), "type": "stat", "title": title, "datasource": DS,
                   "gridPos": {"h": 4, "w": w, "x": x, "y": y},
                   "targets": targets([(expr, "")]),
                   "fieldConfig": {"defaults": d, "overrides": []},
                   "options": {"colorMode": "value", "graphMode": "none", "textMode": "value",
                               "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False}}})


def ts(title, items, x, y, unit="none", w=12, h=8, kind="timeseries", extra=None):
    d = {"unit": unit, "custom": {"lineWidth": 1, "fillOpacity": 10, "showPoints": "never"}}
    if extra:
        d.update(extra)
    panels.append({"id": nid(), "type": kind, "title": title, "datasource": DS,
                   "gridPos": {"h": h, "w": w, "x": x, "y": y},
                   "targets": targets(items),
                   "fieldConfig": {"defaults": d, "overrides": []},
                   "options": {"legend": {"displayMode": "list", "placement": "bottom"},
                               "tooltip": {"mode": "multi", "sort": "desc"}}})


GREEN_LOW = [{"color": "red", "value": None}, {"color": "orange", "value": 10}, {"color": "green", "value": 20}]
GREEN_HIGH = [{"color": "green", "value": None}, {"color": "orange", "value": 1}, {"color": "red", "value": 1.0000001}]

row("At a glance", 0)
free = f'node_filesystem_avail_bytes{{{ROOT}}}'
size = f'node_filesystem_size_bytes{{{ROOT}}}'
stat("Disk free", f'{free} / {size} * 100', 0, 1, "percent", GREEN_LOW, 1)
stat("Disk free (bytes)", free, 3, 1, "bytes")
stat("TSDB size", 'prometheus_tsdb_storage_blocks_bytes + prometheus_tsdb_wal_storage_size_bytes', 6, 1, "bytes")
stat("Oldest data", '(time() - prometheus_tsdb_lowest_timestamp_seconds) / 86400', 9, 1, "d", decimals=1)
stat("Retention limit", 'prometheus_tsdb_retention_limit_seconds / 86400', 12, 1, "d", decimals=0)
stat("Head series", 'prometheus_tsdb_head_series', 15, 1)
stat("Targets up", 'count(up == 1) / count(up) * 100', 18, 1, "percent",
     [{"color": "red", "value": None}, {"color": "orange", "value": 80}, {"color": "green", "value": 100}], 0)
stat("Days until disk full (7d trend)", f'{free} / clamp_min(-deriv(node_filesystem_avail_bytes{{{ROOT}}}[7d]), 1) / 86400',
     21, 1, "d", [{"color": "red", "value": None}, {"color": "orange", "value": 30}, {"color": "green", "value": 90}], 0)

row("Storage", 5)
ts("Disk: free vs size", [(free, "free"), (size, "size")], 0, 6, "bytes")
ts("TSDB: blocks and WAL", [("prometheus_tsdb_storage_blocks_bytes", "blocks"),
                            ("prometheus_tsdb_wal_storage_size_bytes", "WAL")], 12, 6, "bytes")

row("Ingest", 14)
ts("Samples ingested per second", [("rate(prometheus_tsdb_head_samples_appended_total[5m])", "samples/s")], 0, 15, "ops")
ts("Head series", [("prometheus_tsdb_head_series", "series")], 12, 15)

row("Scrapes", 23)
ts("Target up", [("up", "{{job}} {{instance}}")], 0, 24, "none", kind="state-timeline",
   extra={"min": 0, "max": 1, "custom": {"fillOpacity": 70}})
ts("Scrape duration", [("scrape_duration_seconds", "{{job}} {{instance}}")], 12, 24, "s")

row("Process and host", 32)
ts("Prometheus memory and CPU", [('process_resident_memory_bytes{job="prometheus"}', "RSS")], 0, 33, "bytes")
ts("Host CPU busy and memory available",
   [(f'100 * (1 - avg(rate(node_cpu_seconds_total{{{NODE},mode="idle"}}[5m])))', "CPU busy %"),
    (f'100 * node_memory_MemAvailable_bytes{{{NODE}}} / node_memory_MemTotal_bytes{{{NODE}}}', "memory available %")],
   12, 33, "percent", extra={"min": 0, "max": 100})

row("Health", 41)
ts("Failures (last hour)", [
    ("increase(prometheus_tsdb_compactions_failed_total[1h])", "compactions failed"),
    ("increase(prometheus_tsdb_wal_corruptions_total[1h])", "WAL corruptions"),
    ("increase(prometheus_tsdb_reloads_failures_total[1h])", "block reload failures"),
    ("1 - prometheus_config_last_reload_successful", "config reload failed (1 = failed)")], 0, 42)
ts("Query duration p90", [('prometheus_engine_query_duration_seconds{job="prometheus",quantile="0.9",slice="inner_eval"}', "inner_eval")],
   12, 42, "s")

dash = {"uid": "prometheus-server-health", "title": "Prometheus - Server Health", "tags": ["prometheus"],
        "timezone": "browser", "schemaVersion": 39, "refresh": "1m", "editable": True,
        "time": {"from": "now-24h", "to": "now"}, "panels": panels}

if "--exprs" in sys.argv:
    print("\n".join(sorted(set(exprs))))
else:
    print(json.dumps({"dashboard": dash, "overwrite": True, "message": "Prometheus self-monitoring"}))
