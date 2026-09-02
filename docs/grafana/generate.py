#!/usr/bin/env python3
"""Generates the Satisfactory Factories Grafana dashboard (schema v2, Grafana 13.0.2).

Written as a generator rather than hand-authored JSON so the panel shapes stay
consistent and the preview variant is the same file with one argument changed.
"""
import json
import sys

JOB = sys.argv[1] if len(sys.argv) > 1 else "satisfactory-factories"
TITLE_SUFFIX = sys.argv[2] if len(sys.argv) > 2 else ""
NAME = sys.argv[3] if len(sys.argv) > 3 else "satisfactory-factories-metrics"

DS = {"name": "prometheus"}
VERSION = "13.0.2"

# Every query is pinned to one job. Production and preview export identical metric
# names, so an unfiltered query silently adds the two environments together.
J = '{job="%s"}' % JOB


def sel(extra=""):
    """A selector on this job, optionally with more label matchers."""
    inner = 'job="%s"' % JOB
    if extra:
        inner += "," + extra
    return "{" + inner + "}"


def query(expr, legend, ref="A", instant=False):
    spec = {"editorMode": "code", "expr": expr, "legendFormat": legend}
    if instant:
        spec.update({"instant": True, "range": False})
    else:
        spec["range"] = True
    return {
        "kind": "PanelQuery",
        "spec": {
            "query": {
                "kind": "DataQuery",
                "group": "prometheus",
                "version": "v0",
                "datasource": DS,
                "spec": spec,
            },
            "refId": ref,
            "hidden": False,
        },
    }


def panel(pid, title, description, queries, viz):
    return {
        "kind": "Panel",
        "spec": {
            "id": pid,
            "title": title,
            "description": description,
            "links": [],
            "data": {
                "kind": "QueryGroup",
                "spec": {"queries": queries, "transformations": [], "queryOptions": {}},
            },
            "vizConfig": viz,
        },
    }


def stat(steps, unit="short", graph="none", color_mode="background",
         text_mode="auto", decimals=None, fixed=None, minmax=None):
    defaults = {
        "unit": unit,
        "thresholds": {"mode": "absolute", "steps": steps},
        "color": {"mode": "fixed", "fixedColor": fixed} if fixed else {"mode": "thresholds"},
    }
    if decimals is not None:
        defaults["decimals"] = decimals
    if minmax:
        defaults["min"], defaults["max"] = minmax
    return {
        "kind": "VizConfig",
        "group": "stat",
        "version": VERSION,
        "spec": {
            "options": {
                "colorMode": color_mode,
                "graphMode": graph,
                "justifyMode": "auto",
                "orientation": "auto",
                "percentChangeColorMode": "standard",
                "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                "showPercentChange": False,
                "textMode": text_mode,
                "wideLayout": True,
            },
            "fieldConfig": {"defaults": defaults, "overrides": []},
        },
    }


def timeseries(unit="short", fill=15, stack="none", steps=None, decimals=None,
               fixed=None, minmax=None, tooltip="multi", points="auto", width=2):
    defaults = {
        "unit": unit,
        "thresholds": {"mode": "absolute", "steps": steps or [{"value": 0, "color": "green"}]},
        "color": {"mode": "fixed", "fixedColor": fixed} if fixed else {"mode": "palette-classic"},
        "custom": {
            "axisBorderShow": False,
            "axisCenteredZero": False,
            "axisColorMode": "text",
            "axisLabel": "",
            "axisPlacement": "auto",
            "barAlignment": 0,
            "barWidthFactor": 0.6,
            "drawStyle": "line",
            "fillOpacity": fill,
            "gradientMode": "opacity",
            "hideFrom": {"legend": False, "tooltip": False, "viz": False},
            "insertNulls": False,
            "lineInterpolation": "linear",
            "lineWidth": width,
            "pointSize": 5,
            "scaleDistribution": {"type": "linear"},
            "showPoints": points,
            "showValues": False,
            "spanNulls": False,
            "stacking": {"group": "A", "mode": stack},
            "thresholdsStyle": {"mode": "off"},
        },
    }
    if decimals is not None:
        defaults["decimals"] = decimals
    if minmax:
        defaults["min"], defaults["max"] = minmax
    return {
        "kind": "VizConfig",
        "group": "timeseries",
        "version": VERSION,
        "spec": {
            "options": {
                "annotations": {"clustering": -1, "multiLane": False},
                "legend": {"calcs": [], "displayMode": "list", "placement": "bottom", "showLegend": True},
                "tooltip": {"hideZeros": False, "mode": tooltip, "sort": "none"},
            },
            "fieldConfig": {"defaults": defaults, "overrides": []},
        },
    }


def bargauge(display_name=None, unit="short"):
    defaults = {
        "unit": unit,
        "thresholds": {"mode": "absolute", "steps": [{"value": 0, "color": "green"}]},
        "color": {"mode": "palette-classic"},
    }
    if display_name:
        defaults["displayName"] = display_name
    return {
        "kind": "VizConfig",
        "group": "bargauge",
        "version": VERSION,
        "spec": {
            "options": {
                "displayMode": "gradient",
                "legend": {"calcs": [], "displayMode": "list", "placement": "bottom", "showLegend": False},
                "maxVizHeight": 300,
                "minVizHeight": 16,
                "minVizWidth": 0,
                "namePlacement": "left",
                "orientation": "horizontal",
                "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                "showUnfilled": True,
                "sizing": "auto",
                "valueMode": "color",
            },
            "fieldConfig": {"defaults": defaults, "overrides": []},
        },
    }


GREEN = [{"value": 0, "color": "green"}]
BLUE = [{"value": 0, "color": "blue"}]
GREY = [{"value": 0, "color": "#6a6a6a"}]

elements = {}


def add(pid, *args, **kwargs):
    elements["panel-%d" % pid] = panel(pid, *args, **kwargs)


# ---------------------------------------------------------------- live right now
add(1, "Active Browsers",
    "Browsers that sent a heartbeat in the last 15 minutes. Counts local-only and signed-out users, who are invisible to the server otherwise.",
    [query("sum(sf_active_clients%s)" % J, "Active")],
    stat([{"value": 0, "color": "red"}, {"value": 1, "color": "green"}], graph="area"))

add(2, "Signed In vs Signed Out",
    "Whether somebody is signed in. Never who.",
    [query('sum(sf_active_clients%s)' % sel('signed_in="true"'), "Signed in", "A"),
     query('sum(sf_active_clients%s)' % sel('signed_in="false"'), "Signed out", "B")],
    stat(GREEN, color_mode="value", text_mode="value_and_name"))

add(3, "Live Sockets",
    "Open realtime connections. One socket carries every synced tab in a browser, so this is below the active-browser count by design.",
    [query("sum(sf_ws_connections%s)" % J, "Sockets")],
    stat([{"value": 0, "color": "blue"}], graph="area"))

add(4, "Signed-in Share",
    "What fraction of active browsers have an account signed in.",
    [query("sum(sf_active_clients%s) / sum(sf_active_clients%s)" % (sel('signed_in="true"'), J), "Signed in")],
    stat([{"value": 0, "color": "red"}, {"value": 0.2, "color": "#EAB839"}, {"value": 0.4, "color": "green"}],
         unit="percentunit", minmax=(0, 1)))

add(5, "Database Readable",
    "1 when the last scrape read Mongo. At 0 the room and account gauges are frozen at their last values, not actually zero. This is the one to alert on.",
    [query("min(sf_metrics_database_up%s)" % J, "Database")],
    stat([{"value": 0, "color": "red"}, {"value": 1, "color": "green"}]))

# ------------------------------------------------------------ clients over time
add(10, "Active Browsers Over Time",
    "Stacked, so the total height is every active browser.",
    [query("sum by (signed_in) (sf_active_clients%s)" % J, "{{signed_in}}")],
    timeseries(fill=25, stack="normal"))

add(11, "Live Sockets Over Time",
    "Realtime connections held open.",
    [query("sum(sf_ws_connections%s)" % J, "Sockets"),
     query("max(max_over_time(sf_ws_connections%s[24h]))" % J, "24h peak", "B")],
    timeseries(fill=15, fixed=None))

add(12, "Records",
    "Now, and the 24 hour average and peak. Built from subqueries over the scrape series.",
    [query("sum(sf_active_clients%s)" % J, "Browsers now", "A"),
     query("avg_over_time(sum(sf_active_clients%s)[24h:5m])" % J, "24h avg browsers", "B"),
     query("max_over_time(sum(sf_active_clients%s)[24h:5m])" % J, "24h peak browsers", "C"),
     query("max(max_over_time(sf_ws_connections%s[24h]))" % J, "24h peak sockets", "D")],
    stat(BLUE, color_mode="value", text_mode="value_and_name", decimals=1))

# ----------------------------------------------------------- plans in browsers
add(20, "Plans Open in Browsers",
    "Planner tabs, not browser tabs. Local plans never reach the server, so this is the only place they are counted.",
    [query('sum(sf_client_tabs%s)' % sel('kind="local"'), "Local", "A"),
     query('sum(sf_client_tabs%s)' % sel('kind="cloud"'), "Cloud", "B")],
    stat(GREEN, color_mode="value", text_mode="value_and_name"))

add(21, "Cloud Share of Plans",
    "What fraction of open plans are synced rather than local only. The headline adoption number for syncing.",
    [query("sum(sf_client_tabs%s) / sum(sf_client_tabs%s)" % (sel('kind="cloud"'), J), "Synced")],
    stat([{"value": 0, "color": "red"}, {"value": 0.25, "color": "#EAB839"}, {"value": 0.5, "color": "green"}],
         unit="percentunit", minmax=(0, 1)))

add(22, "Factories in Browsers",
    "Factories summed across active browsers, local plans included.",
    [query("sum(sf_client_factories_total%s)" % J, "Factories")],
    stat(BLUE, graph="area", color_mode="background_solid"))

add(23, "Plans per Browser",
    "Average planner tabs open per active browser.",
    [query("sum(sf_client_tabs%s) / sum(sf_active_clients%s)" % (J, J), "Plans")],
    stat(BLUE, color_mode="value", decimals=1))

add(24, "Factories per Browser",
    "Average factories per active browser. The rough answer to how big a plan people actually build.",
    [query("sum(sf_client_factories_total%s) / sum(sf_active_clients%s)" % (J, J), "Factories")],
    stat(BLUE, color_mode="value", decimals=1))

add(25, "Plans Over Time, Local vs Cloud",
    "Stacked. The cloud band growing against the local band is sync adoption.",
    [query("sum by (kind) (sf_client_tabs%s)" % J, "{{kind}}")],
    timeseries(fill=25, stack="normal"))

add(26, "Factories in Browsers Over Time",
    "Total factories across active browsers.",
    [query("sum(sf_client_factories_total%s)" % J, "Factories")],
    timeseries(fill=18, fixed="blue", points="never", width=3))

# --------------------------------------------------- server side: rooms, users
add(30, "Registered Accounts",
    "Rows in the users collection.",
    [query("sum(sf_users_total%s)" % J, "Accounts")],
    stat(GREY, color_mode="background_solid", graph="area"))

add(31, "Synced Plans",
    "Live rooms on the server, tombstoned ones excluded.",
    [query("sum(sf_rooms_total%s)" % J, "Synced plans")],
    stat(BLUE))

add(32, "Shared Plans",
    "Synced plans that have an invite link allocated.",
    [query('sum(sf_rooms_total%s)' % sel('shared="true"'), "Shared")],
    stat([{"value": 0, "color": "blue"}]))

add(33, "Share Rate",
    "What fraction of synced plans have been shared with somebody.",
    [query("sum(sf_rooms_total%s) / sum(sf_rooms_total%s)" % (sel('shared="true"'), J), "Shared")],
    stat([{"value": 0, "color": "blue"}, {"value": 0.1, "color": "green"}],
         unit="percentunit", minmax=(0, 1)))

add(34, "Plan Access",
    "One row per person-to-plan link. Creating a plan gives you one; joining somebody's shared plan gives you another. So this is plans plus extra people on them.",
    [query("sum(sf_room_members_total%s)" % J, "Access grants")],
    stat(GREEN))

add(38, "Collaborators",
    "People editing plans they do not own: access grants minus plans. This is the number that says whether sharing is actually being used, rather than just available.",
    [query("clamp_min(sum(sf_room_members_total%s) - sum(sf_rooms_total%s), 0)" % (J, J), "Collaborators")],
    stat([{"value": 0, "color": "#6a6a6a"}, {"value": 1, "color": "green"}]))

add(35, "Factories per Synced Plan",
    "sf_room_factories_total / sf_rooms_total.",
    [query("sum(sf_room_factories_total%s) / sum(sf_rooms_total%s)" % (J, J), "Factories")],
    stat(BLUE, color_mode="value", decimals=1))

add(36, "Synced Plans Over Time",
    "Stacked by whether the plan has an invite link.",
    [query("sum by (shared) (sf_rooms_total%s)" % J, "{{shared}}")],
    timeseries(fill=25, stack="normal"))

add(37, "Accounts and Access Over Time",
    "All three grow in normal use. Access falling without accounts falling is the sweeper clearing deleted plans.",
    [query("sum(sf_users_total%s)" % J, "Accounts", "A"),
     query("sum(sf_room_members_total%s)" % J, "Access grants", "B"),
     query("sum(sf_rooms_total%s)" % J, "Synced plans", "C")],
    timeseries(fill=10))

# ------------------------------------------------------------- edits and activity
# The shape of this one is deliberate and took two attempts.
#
# sf_room_revisions is a gauge, not a counter: deleting a plan removes its edits from
# the sum. So increase() is invalid, and the obvious alternative — subtracting the
# value from 24h ago — has two faults. It reads "No data" for the first 24 hours after
# release, because there is no sample to offset to; and a deletion makes it negative.
#
# Measuring from the low point of the window fixes both. min_over_time includes the
# current sample, so the result can never be negative and needs no clamp, and it has an
# answer from the very first scrape. With no deletions it is exactly the 24h growth;
# with one, it is growth since the trough, which is the more useful reading anyway.
EDITS_24H = "sum(sf_room_revisions%s) - sum(min_over_time(sf_room_revisions%s[24h]))" % (J, J)

add(60, "Edits, All Time",
    "Accepted edits summed across live plans. Falls when a plan is deleted, because those edits no longer exist; that is why it is a gauge rather than a counter.",
    [query("sum(sf_room_revisions%s)" % J, "Edits")],
    stat(BLUE, graph="area", color_mode="background_solid"))

add(61, "Edits, Last 24h",
    "Edits added since the low point of the last 24 hours. Measured from the trough rather than from the value 24h ago, so it answers from the first scrape instead of reading No data for a day, and cannot go negative when a plan is deleted.",
    [query(EDITS_24H, "Edits")],
    stat([{"value": 0, "color": "#6a6a6a"}, {"value": 1, "color": "green"}], graph="area"))

add(62, "Edits Over Time",
    "The cumulative line. The strongest single indicator of whether the planner is being used.",
    [query("sum(sf_room_revisions%s)" % J, "Edits")],
    timeseries(fill=18, fixed="blue", points="never", width=3))

add(63, "Edits per 24h, Over Time",
    "Rolling 24-hour edit count. Any window works by changing the range in the query.",
    [query(EDITS_24H, "Edits in 24h")],
    timeseries(fill=25, fixed="green", points="never"))

add(64, "Active Accounts",
    "Accounts whose last accepted edit falls inside each window. Signing in, creating a plan and joining one are not edits and do not count.",
    [query('sum(sf_active_accounts%s)' % sel('window="1h"'), "1 hour", "A"),
     query('sum(sf_active_accounts%s)' % sel('window="24h"'), "24 hours", "B"),
     query('sum(sf_active_accounts%s)' % sel('window="7d"'), "7 days", "C"),
     query('sum(sf_active_accounts%s)' % sel('window="14d"'), "14 days", "D"),
     query('sum(sf_active_accounts%s)' % sel('window="30d"'), "30 days", "E")],
    stat(GREEN, color_mode="value", text_mode="value_and_name"))

add(65, "Active Accounts Over Time",
    "The windows plotted together. The 30-day line is thin for the first month after release: it is seeded from an activity log that is trimmed per plan, so early history is partial.",
    [query("sum by (window) (sf_active_accounts%s)" % J, "{{window}}")],
    timeseries(fill=8))

add(66, "Stickiness",
    "Accounts active in a day against those active in a month. High means people come back; low means they visit once.",
    [query('sum(sf_active_accounts%s) / sum(sf_active_accounts%s)'
           % (sel('window="24h"'), sel('window="30d"')), "Daily over monthly")],
    stat([{"value": 0, "color": "red"}, {"value": 0.1, "color": "#EAB839"}, {"value": 0.25, "color": "green"}],
         unit="percentunit", minmax=(0, 1)))

# ------------------------------------------------------------------------ faults
# Counters, so every panel here is a rate or an increase rather than a level. Two metrics
# on purpose: sf_events_total is per cause, sf_http_errors_total is per response, and one
# incident can legitimately appear in both. Never add them together.
add(90, "Faults, Last 24h",
    "Every counted fault in the last day, client and server together. Indicative rather than authoritative: the client half arrives over an unauthenticated endpoint.",
    [query("sum(increase(sf_events_total%s[24h]))" % J, "Faults")],
    stat([{"value": 0, "color": "green"}, {"value": 1, "color": "#EAB839"}, {"value": 50, "color": "red"}],
         graph="area"))

add(91, "Server Errors, Last 24h",
    "HTTP 5xx responses. The line that matters most, because a 500 means the server itself failed rather than refusing something.",
    [query('sum(increase(sf_http_errors_total%s[24h]))' % sel('status=~"5.."'), "5xx")],
    stat([{"value": 0, "color": "green"}, {"value": 1, "color": "red"}], graph="area"))

add(92, "Plan Repairs, Last 24h",
    "Loaded plans that had to be corrected before they could be used. Each one is a plan that was saved wrong at some point.",
    [query('sum(increase(sf_events_total%s[24h]))' % sel('reason=~"plan_repair_.*"'), "Repairs")],
    stat([{"value": 0, "color": "green"}, {"value": 1, "color": "#EAB839"}], graph="area"))

add(93, "Faults by Reason, Last 24h",
    "Every reason with at least one occurrence in the last day, largest first. A reason at zero is absent from this panel by design; that is the good news.",
    [query("sort_desc(sum by (reason) (increase(sf_events_total%s[24h])) > 0)" % J, "{{reason}}", instant=True)],
    bargauge(display_name="${__field.labels.reason}"))

add(94, "Faults Over Time",
    "Per-minute fault rate by reason. A flat line at zero is what this should normally look like.",
    [query("sum by (reason) (rate(sf_events_total%s[5m]) * 60) > 0" % J, "{{reason}}")],
    timeseries(fill=15))

add(95, "Client and Server",
    "Which half of the app is reporting. A spike on one side only usually says where to look first.",
    [query("sum by (source) (increase(sf_events_total%s[24h]))" % J, "{{source}}")],
    timeseries(fill=25, stack="normal"))

add(96, "HTTP Errors by Status",
    "Per-response view. 4xx is dominated by ordinary refusals and is mostly noise; 5xx is not.",
    [query("sum by (status) (increase(sf_http_errors_total%s[24h])) > 0" % J, "{{status}}")],
    timeseries(fill=15))

add(97, "Records Lost After a Commit",
    "Times somebody's change was saved and the record of it was not. Each one is a silent gap in the activity log or the account stamps.",
    [query('sum(increase(sf_events_total%s[24h]))' % sel('reason=~"post_commit_.*"'), "Lost"),],
    stat([{"value": 0, "color": "green"}, {"value": 1, "color": "#EAB839"}, {"value": 10, "color": "red"}]))

# ------------------------------------------------------------------- growth
add(80, "New Accounts",
    "Registrations inside each rolling window. Read from the registration date accounts have always carried, so it is exact and correct all the way back, not just since this metric shipped.",
    [query('sum(sf_new_accounts%s)' % sel('window="24h"'), "24 hours", "A"),
     query('sum(sf_new_accounts%s)' % sel('window="7d"'), "7 days", "B"),
     query('sum(sf_new_accounts%s)' % sel('window="30d"'), "30 days", "C")],
    stat(GREEN, color_mode="value", text_mode="value_and_name"))

add(81, "New Accounts This Week",
    "Registrations in the last 7 days.",
    [query('sum(sf_new_accounts%s)' % sel('window="7d"'), "New")],
    stat([{"value": 0, "color": "#6a6a6a"}, {"value": 1, "color": "green"}], graph="area"))

add(82, "New Accounts This Month",
    "Registrations in the last 30 days.",
    [query('sum(sf_new_accounts%s)' % sel('window="30d"'), "New")],
    stat([{"value": 0, "color": "#6a6a6a"}, {"value": 1, "color": "green"}], graph="area"))

add(83, "New Accounts Over Time",
    "Each rolling window plotted. A step up in the 24h line is a signup; the wider lines are the trend.",
    [query("sum by (window) (sf_new_accounts%s)" % J, "{{window}}")],
    timeseries(fill=8))

add(84, "Sign-ins",
    "Accounts that signed in inside each window. Separate from editing: signing in, reading a plan and changing nothing is a real thing people do.",
    [query('sum(sf_signed_in_accounts%s)' % sel('window="24h"'), "24 hours", "A"),
     query('sum(sf_signed_in_accounts%s)' % sel('window="7d"'), "7 days", "B"),
     query('sum(sf_signed_in_accounts%s)' % sel('window="30d"'), "30 days", "C")],
    stat(BLUE, color_mode="value", text_mode="value_and_name"))

add(85, "Sign-ins, All Time",
    "Sign-ins summed across accounts. Approximate: the count is written after the token is issued and is allowed to fail, and it counts from release rather than being backfilled.",
    [query("sum(sf_signins_total%s)" % J, "Sign-ins")],
    stat(BLUE, graph="area", color_mode="background_solid"))

add(86, "Sign-ins Over Time",
    "Rolling sign-in windows. Compare against Active Accounts: a gap means people are signing in and not building.",
    [query("sum by (window) (sf_signed_in_accounts%s)" % J, "{{window}}")],
    timeseries(fill=8))

add(87, "Of Those Who Signed In, How Many Edited",
    "Active accounts over signed-in accounts, both on 7 days. Low means people arrive and do not build.",
    [query('sum(sf_active_accounts%s) / sum(sf_signed_in_accounts%s)'
           % (sel('window="7d"'), sel('window="7d"')), "Edited")],
    stat([{"value": 0, "color": "red"}, {"value": 0.3, "color": "#EAB839"}, {"value": 0.6, "color": "green"}],
         unit="percentunit", minmax=(0, 1)))

# ------------------------------------------------------------- biggest and busiest
add(70, "Biggest Plans",
    "The largest synced plans by factory count, with the account that owns each. Top 20 only.",
    [query("sort_desc(sf_room_factories%s)" % J, "{{owner}} · {{room_id}}", instant=True)],
    bargauge(display_name="${__field.labels.owner} · ${__field.labels.room_id}"))

add(71, "Busiest Accounts",
    "Accepted edits per account. Approximate by design: the count is written after the edit commits and is allowed to fail, and it starts from zero at release rather than being backfilled. Top 20 only.",
    [query("sort_desc(sf_user_edits%s)" % J, "{{username}}", instant=True)],
    bargauge(display_name="${__field.labels.username}"))

add(72, "Accounts With the Most Factories",
    "Factories summed over the synced plans each account created. Top 20 only.",
    [query("sort_desc(sf_user_factories%s)" % J, "{{username}}", instant=True)],
    bargauge(display_name="${__field.labels.username}"))

add(73, "Largest Plan",
    "Factory count of the biggest single synced plan.",
    [query("max(sf_room_factories%s)" % J, "Factories")],
    stat(BLUE, color_mode="value"))

# ------------------------------------------------------------ client versions
add(40, "Browsers by Build",
    'Active browsers by the build they are running. Anything the version pattern does not recognise counts under "other".',
    [query("sort_desc(sum by (version) (sf_clients_by_version%s))" % J, "{{version}}", instant=True)],
    bargauge(display_name="${__field.labels.version}"))

add(41, "Build Adoption Over Time",
    "Stacked. After a release, watch the old band drain. While it is still wide, a breaking change will hurt.",
    [query("sum by (version) (sf_clients_by_version%s)" % J, "{{version}}")],
    timeseries(fill=25, stack="normal"))

add(43, "Browsers by Commit",
    "Active browsers by the commit their bundle was built from. A build that reported no commit, such as a local one, counts under \"unknown\". Capped to the busiest 25 commits.",
    [query("sort_desc(sf_clients_by_sha%s)" % J, "{{sha}}", instant=True)],
    bargauge(display_name="${__field.labels.sha}"))

add(44, "Commit Rollout Over Time",
    "Stacked. After a deploy, watch the previous commit drain. This is the panel that says whether a rollout has actually reached people, which a version number cannot: several commits ship under one version.",
    [query("sum by (sha) (sf_clients_by_sha%s)" % J, "{{sha}}")],
    timeseries(fill=25, stack="normal"))

add(45, "Browsers on an Unknown Commit",
    "Builds reporting no usable commit. Expect this to be non-zero only for local development builds.",
    [query('sum(sf_clients_by_sha%s) or vector(0)' % sel('sha="unknown"'), "Unknown")],
    stat([{"value": 0, "color": "green"}, {"value": 1, "color": "#6a6a6a"}]))

add(42, "On an Unrecognised Build",
    'Browsers reporting a version the label pattern refused. Expect zero. Anything sustained means either a bad build string or somebody poking the endpoint.',
    [query('sum(sf_clients_by_version%s) or vector(0)' % sel('version="other"'), "Other")],
    stat([{"value": 0, "color": "green"}, {"value": 1, "color": "#EAB839"}, {"value": 10, "color": "red"}]))

def item(x, y, w, h, pid):
    return {
        "kind": "GridLayoutItem",
        "spec": {"x": x, "y": y, "width": w, "height": h,
                 "element": {"kind": "ElementReference", "name": "panel-%d" % pid}},
    }


def row(title, items):
    return {
        "kind": "RowsLayoutRow",
        "spec": {"title": title, "collapse": False,
                 "layout": {"kind": "GridLayout", "spec": {"items": items}}},
    }


# Row titles say where the numbers come from, because the two sources behave completely
# differently and nothing on a panel itself reveals which it is. Anything marked "browsers"
# is the heartbeat: it expires 15 minutes after a tab closes and reads zero overnight.
# Anything marked "database" is permanent and survives a restart.
rows = [
    row("👥 Live Right Now · from browsers, 15 min window", [
        item(0, 0, 5, 4, 1), item(5, 0, 5, 4, 2), item(10, 0, 4, 4, 3),
        item(14, 0, 5, 4, 4), item(19, 0, 5, 4, 5),
    ]),
    row("✏️ Edits and Activity · from the database", [
        item(0, 0, 5, 4, 60), item(5, 0, 5, 4, 61), item(10, 0, 4, 4, 66),
        item(14, 0, 10, 4, 64),
        item(0, 4, 12, 8, 62), item(12, 4, 12, 8, 63),
        item(0, 12, 24, 8, 65),
    ]),
    row("🚨 Faults · counters, not levels", [
        item(0, 0, 5, 4, 90), item(5, 0, 5, 4, 91), item(10, 0, 5, 4, 92),
        item(15, 0, 9, 4, 97),
        item(0, 4, 12, 10, 93), item(12, 4, 12, 10, 94),
        item(0, 14, 12, 8, 95), item(12, 14, 12, 8, 96),
    ]),
    row("🌱 Growth · from the database", [
        item(0, 0, 5, 4, 81), item(5, 0, 5, 4, 82), item(10, 0, 4, 4, 87),
        item(14, 0, 10, 4, 80),
        item(0, 4, 12, 8, 83), item(12, 4, 12, 8, 86),
        item(0, 12, 5, 4, 85), item(5, 12, 19, 4, 84),
    ]),
    row("🏆 Biggest and Busiest · from the database", [
        item(0, 0, 4, 4, 73),
        item(0, 4, 12, 10, 70), item(12, 0, 12, 10, 71),
        item(12, 10, 12, 10, 72),
    ]),
    row("🏭 Synced Plans and Accounts · from the database", [
        item(0, 0, 4, 4, 30), item(4, 0, 4, 4, 31), item(8, 0, 4, 4, 32),
        item(12, 0, 4, 4, 33), item(16, 0, 4, 4, 34), item(20, 0, 4, 4, 38),
        item(0, 4, 4, 4, 35),
        item(4, 4, 10, 8, 36), item(14, 4, 10, 8, 37),
    ]),
    row("📈 Browsers Over Time · from browsers, 15 min window", [
        item(0, 0, 12, 8, 10), item(12, 0, 12, 8, 11), item(0, 8, 24, 4, 12),
    ]),
    row("🗂️ Plans in Browsers · from browsers, includes local plans", [
        item(0, 0, 6, 4, 20), item(6, 0, 6, 4, 21), item(12, 0, 6, 4, 22),
        item(18, 0, 3, 4, 23), item(21, 0, 3, 4, 24),
        item(0, 4, 12, 8, 25), item(12, 4, 12, 8, 26),
    ]),
    row("🏷️ Client Builds and Commits · from browsers", [
        item(0, 0, 12, 8, 40), item(12, 0, 12, 8, 41),
        item(0, 8, 12, 10, 43), item(12, 8, 12, 10, 44),
        item(0, 18, 6, 4, 42), item(6, 18, 6, 4, 45),
    ]),
]

dashboard = {
    "apiVersion": "dashboard.grafana.app/v2",
    "kind": "Dashboard",
    "metadata": {"name": NAME, "namespace": "default"},
    "spec": {
        "annotations": [{
            "kind": "AnnotationQuery",
            "spec": {
                "query": {"kind": "DataQuery", "group": "grafana", "version": "v0",
                          "datasource": {"name": "-- Grafana --"}, "spec": {}},
                "enable": True, "hide": True, "iconColor": "rgba(0, 211, 255, 1)",
                "name": "Annotations & Alerts", "builtIn": True,
            },
        }],
        "cursorSync": "Crosshair",
        "description": ("Satisfactory Factories planner usage. Server-derived room and account "
                        "gauges, plus an anonymous browser heartbeat that counts local plans and "
                        "signed-out users the server cannot see. Every query is pinned to "
                        'job="%s"; production and preview export the same metric names.' % JOB),
        "editable": True,
        "elements": elements,
        "layout": {"kind": "RowsLayout", "spec": {"rows": rows}},
        "links": [],
        "liveNow": False,
        "preload": False,
        "tags": ["satisfactory-factories", "planner", "telemetry"],
        "timeSettings": {
            "timezone": "browser", "from": "now-24h", "to": "now", "autoRefresh": "30s",
            "autoRefreshIntervals": ["5s", "10s", "30s", "1m", "5m", "15m", "30m", "1h", "2h", "1d"],
            "hideTimepicker": False, "fiscalYearStartMonth": 0,
        },
        "title": "Satisfactory Factories — Planner Metrics" + TITLE_SUFFIX,
        "variables": [],
    },
}

print(json.dumps(dashboard, indent=2, ensure_ascii=False))
