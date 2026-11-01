// Project 7 — Zipcab Rides' observability stack. Prometheus, Grafana, Elasticsearch,
// Alertmanager. Its own company, cast, metrics and five steps.
export default {
  key: "observability-stack",
  title: "See the system clearly",
  company: "Zipcab",
  summary:
    "Riders wait twenty seconds for a cab that is already around the corner, and the dashboard is a flat green line. Prometheus scrapes nothing, alerts fire on noise, and the only useful evidence is sitting in the logs. Make the system tell the truth, then make the pager worth answering.",
  needsTerminal: true,
  ticketPrefix: "ZIP",
  workdir: "~/repo",
  tools: ["Prometheus", "Grafana", "Elasticsearch", "Alertmanager"],
  terminal: {
    host: "observability-bastion",
    allowed: ["cat", "ls", "cd", "grep", "sed", "echo", "curl", "promtool", "git"],
  },
  runtime: {
    label: "Scrape targets",
    items: [
      { name: "prometheus", detail: "up · 14 series" },
      { name: "alertmanager", detail: "up · 2 routes" },
      { name: "ride-api", detail: "not scraped" },
    ],
  },
  incidents: [
    { id: "INC-5510", title: "Riders wait 20s for a cab that is already nearby", severity: "sev2", opened: "Tue 18:05", owner: "you" },
  ],
  difficulty: {
    easy: {
      scoreMultiplier: 0.8,
      hintCeiling: 3,
      steps: ["scrape-target", "p95-query", "alert-noise"],
      redHerrings: [],
    },
    medium: {
      scoreMultiplier: 1,
      hintCeiling: 3,
      steps: ["scrape-target", "p95-query", "alert-rule", "log-search"],
      redHerrings: ["obs-red-1"],
    },
    hard: {
      scoreMultiplier: 1.5,
      hintCeiling: 2,
      steps: ["scrape-target", "p95-query", "alert-rule", "log-search", "alert-noise"],
      redHerrings: ["obs-red-1", "obs-red-2"],
    },
  },
  chart: {
    title: "ride-api p95 search latency (seconds)",
    points: [1.2, 1.4, 1.3, 1.8, 2.6, 3.1, 4.4, 6.2, 9.8, 14.1, 19.6, 21.3],
  },
  services: [
    { name: "ride-api", kind: "api", health: "degraded", replicas: 4, version: "3.6.1", last_deploy: "9 days ago" },
    { name: "prometheus", kind: "worker", health: "healthy", replicas: 1, version: "2.51.2", last_deploy: "22 days ago" },
    { name: "grafana", kind: "api", health: "healthy", replicas: 1, version: "10.4.2", last_deploy: "22 days ago" },
    { name: "elasticsearch", kind: "database", health: "degraded", replicas: 3, version: "8.13", last_deploy: "60 days ago" },
    { name: "alertmanager", kind: "worker", health: "healthy", replicas: 1, version: "0.27", last_deploy: "22 days ago" },
  ],
  steps: [
    {
      key: "scrape-target",
      title: "Add ride-api as a scrape target",
      goal: "Get the service into Prometheus before anyone asks a question about it.",
      whatHappening:
        "Grafana draws a flat green line for ride-api because Prometheus has never been told the service exists. The service has been serving traffic with a metrics endpoint the whole time.",
      whatNext: "Add the job to prometheus.yml, reload, and check the targets API says the target is up.",
      author: "Vikram",
      ticket: { key: "ZIP-501", title: "No visibility on ride-api", priority: "P1", slaMinutes: 480 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 480, subSteps: 1 },
        hard: { slaMinutes: 180, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "Prometheus only scrapes what its config names. Check the scrape_configs list." },
        {
          title: "Concept",
          body: "A scrape job is a match: a target, a path and an interval. Until the job exists, every query about the service returns no data — and a graph with no data looks exactly like a healthy one.",
        },
        {
          title: "Steps",
          items: [
            "cat prometheus/prometheus.yml",
            "Add a job_name ride-api with targets localhost:8081",
            "curl localhost:9090/-/reload",
            "curl localhost:9090/api/v1/targets",
          ],
        },
      ],
      doneWhen: ["localhost:9090/api/v1/targets"],
    },
    {
      key: "p95-query",
      title: "Write the latency query",
      goal: "Turn p95 latency into one number the incident channel can read.",
      whatHappening:
        "The service records a histogram of search durations, and nobody has ever asked it a question. Product wants the 95th percentile, not the average — the average hides exactly the riders who are waiting.",
      whatNext: "Query the histogram for p95 over the last hour and read the value.",
      author: "Vikram",
      ticket: { key: "ZIP-503", title: "Report p95 ride search latency", priority: "P2", slaMinutes: 360 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 360, subSteps: 1 },
        hard: { slaMinutes: 180, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "histogram_quantile is the function. A 0.95 quantile over a rate of the bucket series." },
        {
          title: "Concept",
          body: "A histogram stores counts per bucket, so the quantile only exists after you take a rate of each bucket and sum by the label you care about. Averaging the durations instead gives a number nobody feels.",
        },
        {
          title: "Steps",
          items: [
            'curl "localhost:9090/api/v1/query?query=histogram_quantile(0.95, rate(ride_search_duration_bucket[5m]))"',
            "Read the value for the ride-search route",
          ],
        },
      ],
      doneWhen: ["api/v1/query"],
    },
    {
      key: "alert-rule",
      title: "Alert on the error rate",
      goal: "Make a page happen when riders are actually failing, not when a graph looks odd.",
      whatHappening:
        "There is no alert on error rate at all. The only way anyone finds out that searches are failing is a support ticket, which is a very expensive monitoring system.",
      whatNext: "Write the rule for more than two percent errors, then validate it with promtool before you reload.",
      author: "Vikram",
      ticket: { key: "ZIP-504", title: "Add an error-rate alert for ride-api", priority: "P2", slaMinutes: 420 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 420, subSteps: 2 },
        hard: { slaMinutes: 240, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "A rule needs an expr, a for and a severity label. Validate before you reload." },
        {
          title: "Concept",
          body: "The rule file is code: promtool check rules parses it and catches a broken expr before Prometheus does at 3am. An alert without for is a page per bad minute.",
        },
        {
          title: "Steps",
          items: [
            "cat prometheus/rules/ride-api.yml",
            "Add an alert with expr on the 5xx ratio over 2 percent",
            "promtool check rules prometheus/rules/ride-api.yml",
            "curl localhost:9090/-/reload",
          ],
        },
      ],
      doneWhen: ["promtool check rules"],
    },
    {
      key: "log-search",
      title: "Find the root cause in the logs",
      goal: "Get from a slow number to the line that explains it.",
      whatHappening:
        "Metrics prove the search is slow; they cannot say why. Elasticsearch holds the request logs, and one line in them names the query that takes eight seconds.",
      whatNext: "Search level=ERROR for ride-api and read the slow-query line.",
      author: "Vikram",
      ticket: { key: "ZIP-505", title: "Find the slow query behind the ride search delay", priority: "P1", slaMinutes: 300 },
      variants: {
        easy: { slaMinutes: 1200, subSteps: 1 },
        medium: { slaMinutes: 300, subSteps: 1 },
        hard: { slaMinutes: 150, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "The query is level=ERROR and service=ride-api. Ask Elasticsearch, not the app log on this box." },
        {
          title: "Concept",
          body: "A log search is a filter, not a reading exercise: scope it by level and service first, then by time. The line that matters usually names the duration and the statement.",
        },
        {
          title: "Steps",
          items: [
            'curl -s "localhost:9200/ride-api-*/_search?q=level:ERROR%20AND%20service:ride-api"',
            "Find the line with the slow statement",
            "Note the table and the duration",
          ],
        },
      ],
      doneWhen: ["level:ERROR"],
    },
    {
      key: "alert-noise",
      title: "Quiet the noisy alert",
      goal: "An alert that fires on nothing trains people to ignore alerts.",
      whatHappening:
        "The current rule fires at half a percent errors sustained for one minute, which is most Tuesday afternoons. It has been acknowledged and ignored forty times this month.",
      whatNext: "Raise the threshold to two percent, set for to ten minutes, validate and reload.",
      author: "Vikram",
      ticket: { key: "ZIP-502", title: "Too many false alerts from ride-api", priority: "P2", slaMinutes: 360 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 360, subSteps: 1 },
        hard: { slaMinutes: 180, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "Two things change: the number in the expr, and the for duration." },
        {
          title: "Concept",
          body: "for is the alert's patience. It turns a spike into nothing and a sustained failure into a page, which is the whole difference between monitoring and noise.",
        },
        {
          title: "Steps",
          items: [
            'sed -i "s/0.005/0.02/g" prometheus/rules/ride-api.yml',
            'sed -i "s/for: 1m/for: 10m/g" prometheus/rules/ride-api.yml',
            "promtool check rules prometheus/rules/ride-api.yml",
            "curl localhost:9090/-/reload",
          ],
        },
      ],
      doneWhen: ["-/reload"],
    },
  ],
  messages: [
    {
      id: "v1",
      trigger: "project_start",
      step: "scrape-target",
      author: "Ananya",
      role: "Product owner",
      body:
        "@{player} riders are waiting twenty seconds for a cab that is standing next to them, and my dashboard shows a flat green line. I do not believe the dashboard. Can you make the system tell the truth?",
      variants: {
        easy: {
          body: "@{player} the dashboard is green but riders are waiting twenty seconds for a cab that is already nearby. Start simple: check what Prometheus is actually scraping, then tell me what the targets say.",
        },
        hard: {
          body: "@{player} green dashboard, twenty-second waits, support queue on fire. Someone is lying and I do not think it is the riders.",
        },
      },
      replies: [
        { id: "targets", label: "Checking what Prometheus scrapes", next: "v2" },
        { id: "grafana", label: "Is Grafana broken?", next: "v3" },
      ],
    },
    {
      id: "v2",
      trigger: "reply",
      step: "scrape-target",
      author: "Vikram",
      role: "SRE",
      body: "Start with the targets page. If ride-api is not in the scrape list, Grafana is drawing an empty axis and calling it healthy.",
    },
    {
      id: "v3",
      trigger: "reply",
      step: "scrape-target",
      author: "Vikram",
      role: "SRE",
      body: "Grafana is fine — it renders whatever Prometheus has. Right now, for ride-api, that is nothing at all.",
    },
    {
      id: "v4",
      trigger: "step_done",
      step: "scrape-target",
      author: "Vikram",
      role: "SRE",
      body: "ride-api is up as a target. Now the question product actually asked: how slow is it, at the ninety-fifth percentile?",
    },
    {
      id: "v5",
      trigger: "step_start",
      step: "p95-query",
      author: "Ananya",
      role: "Product owner",
      body: "I need one number I can paste into the incident channel: p95 ride search latency for the last hour. Not an average, please — averages hide the people who left.",
    },
    {
      id: "v6",
      trigger: "mistake",
      step: "p95-query",
      author: "Vikram",
      role: "SRE",
      body: "That query came back empty. Check the metric name in the histogram — the buckets end in _bucket, and the quantile needs a rate first.",
      variants: {
        easy: {
          body: "Nothing broke, the query just returned no data. The series is ride_search_duration_bucket — the quantile lives on the buckets, not on the summary.",
        },
      },
    },
    {
      id: "v7",
      trigger: "step_start",
      step: "alert-rule",
      author: "Vikram",
      role: "SRE",
      body:
        "While you are in Prometheus: we have no alert on error rate at all. Two percent sustained is the line product and I agreed on. Write it, then validate it with promtool before it goes live.",
    },
    {
      id: "v8",
      trigger: "step_start",
      step: "log-search",
      author: "Vikram",
      role: "SRE",
      body:
        "Metrics tell you what, logs tell you why. Search level=ERROR for ride-api around 18:05 — I want the line, not a theory.",
    },
    {
      id: "v9",
      trigger: "step_done",
      step: "log-search",
      author: "Vikram",
      role: "SRE",
      body: "There it is: a sequential scan on ride_requests taking most of eight seconds at peak. Not the network, not the app — one missing index.",
    },
    {
      id: "v10",
      trigger: "step_start",
      step: "alert-noise",
      author: "Ananya",
      role: "Product owner",
      body:
        "One more thing, and it is mine: Alertmanager woke me at 3am for a 0.6 percent blip. Fix the threshold and the duration before you close this, or I will mute the channel.",
      replies: [
        { id: "threshold", label: "Two percent for ten minutes", next: "v11" },
        { id: "mute", label: "Mute it, I will watch the graph", next: "v12" },
      ],
    },
    {
      id: "v11",
      trigger: "reply",
      step: "alert-noise",
      author: "Ananya",
      role: "Product owner",
      body: "Two percent for ten minutes is an alert I would get out of bed for. Muting is how we end up back here.",
    },
    {
      id: "v12",
      trigger: "reply",
      step: "alert-noise",
      author: "Vikram",
      role: "SRE",
      body:
        "A muted alert is not a quiet system, it is an unwatched one. Change the rule instead — two percent, ten minutes, and a runbook link.",
      replies: [{ id: "threshold", label: "Two percent for ten minutes", next: "v11" }],
    },
    {
      id: "v13",
      trigger: "timer",
      atMinute: 60,
      step: "alert-noise",
      author: "Ananya",
      role: "Product owner",
      body: "One line: can I tell support we can see the problem now?",
      replies: [{ id: "yes", label: "Yes — metric, alert and log line", next: "v14" }],
    },
    {
      id: "v14",
      trigger: "reply",
      step: "alert-noise",
      author: "Ananya",
      role: "Product owner",
      body: "Thank you. I will tell support we can point at a graph and a log line instead of asking riders to describe the wait.",
    },
    {
      id: "v15",
      trigger: "step_done",
      step: "alert-noise",
      author: "Vikram",
      role: "SRE",
      body: "Two percent, ten minutes, and the rule file validates. That is an alert I would actually wake up for.",
    },
    {
      id: "v16",
      trigger: "incident_end",
      step: "alert-noise",
      author: "Ananya",
      role: "Product owner",
      body:
        "Postmortem note: we were blind for nine days and calling it green. Nothing was broken in the dashboard — it just had nothing to say.",
    },
    {
      id: "obs-red-1",
      redHerring: true,
      trigger: "step_start",
      step: "alert-rule",
      author: "Vikram",
      role: "SRE",
      body: "Elasticsearch heap is at 78 percent. I would restart the cluster before trusting anything the logs say — that is probably the real problem.",
    },
    {
      id: "obs-red-2",
      redHerring: true,
      trigger: "step_start",
      step: "log-search",
      author: "Ananya",
      role: "Product owner",
      body: "Could we just add two more ride-api replicas and call it fixed? More pods, more searches, fewer waits.",
    },
  ],
};