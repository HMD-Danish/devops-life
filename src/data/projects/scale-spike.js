// Project 10 — FlashDeal Marketplace. Load testing, autoscaling, database tuning, cost.
// Own company, own cast, own five steps; nothing shared with other projects.
export default {
  key: "scale-spike",
  title: "Scale for the spike and cut the bill",
  company: "FlashDeal",
  summary:
    "FlashDeal's midnight sale is in nine hours and checkout already times out when traffic doubles. Measure the breaking point, put an autoscaler on the API, kill the query that eats the database, then find the idle nodes and right-size the instance that finance is paying for.",
  needsTerminal: true,
  ticketPrefix: "FLD",
  workdir: "~/repo",
  tools: ["AWS EKS", "HPA", "RDS", "Cost Explorer", "hey"],
  terminal: {
    host: "flashdeal-ops",
    allowed: ["hey", "kubectl", "aws", "mysql", "cat", "ls", "cd", "grep", "sed", "echo", "top", "ps"],
  },
  runtime: {
    label: "Marketplace",
    items: [
      { name: "deals-api", detail: "running · 6/6 · 94% CPU" },
      { name: "eks-cluster", detail: "4 nodes · 2 at 2% utilization" },
      { name: "rds-main", detail: "db.r6g.4xlarge · 96% CPU" },
      { name: "flashdeal-alb", detail: "healthy · 503s under load" },
    ],
  },
  incidents: [
    { id: "INC-9012", title: "Checkout times out whenever traffic spikes", severity: "sev1", opened: "Today 21:40", owner: "you" },
  ],
  difficulty: {
    easy: {
      scoreMultiplier: 0.8,
      hintCeiling: 3,
      steps: ["load-test", "add-hpa", "slow-query"],
      redHerrings: [],
    },
    medium: {
      scoreMultiplier: 1,
      hintCeiling: 3,
      steps: ["load-test", "add-hpa", "slow-query", "idle-resources"],
      redHerrings: ["fld-red-1"],
    },
    hard: {
      scoreMultiplier: 1.5,
      hintCeiling: 2,
      steps: ["load-test", "add-hpa", "slow-query", "idle-resources", "right-size"],
      redHerrings: ["fld-red-1", "fld-red-2"],
    },
  },
  chart: {
    title: "deals-api p95 during the flash sale (ms)",
    points: [180, 240, 620, 1800, 3200, 4100, 3900, 1240, 420, 260, 210, 190],
  },
  resources: [
    { name: "flashdeal-eks-a", kind: "node", instance_size: "c6i.4xlarge", utilization: 78, monthly_cost: 496 },
    { name: "flashdeal-eks-b", kind: "node", instance_size: "c6i.4xlarge", utilization: 71, monthly_cost: 496 },
    { name: "flashdeal-eks-idle-1", kind: "node", instance_size: "m5.2xlarge", utilization: 3, monthly_cost: 278 },
    { name: "flashdeal-eks-idle-2", kind: "node", instance_size: "m5.2xlarge", utilization: 2, monthly_cost: 278 },
    { name: "rds-main", kind: "database", instance_size: "db.r6g.4xlarge", monthly_cost: 1180 },
    { name: "flashdeal-alb", kind: "load_balancer", monthly_cost: 46 },
    { name: "flashdeal-eks", kind: "cluster", monthly_cost: 73 },
    { name: "deals-media", kind: "bucket", monthly_cost: 210 },
  ],
  services: [
    { name: "deals-api", kind: "api", health: "degraded", replicas: 6, version: "5.2.1", last_deploy: "9 days ago" },
    { name: "eks-cluster", kind: "cluster", health: "healthy", replicas: 4, version: "1.29", last_deploy: "31 days ago" },
    { name: "rds-main", kind: "database", health: "degraded", replicas: 1, version: "postgres 15.6", last_deploy: "62 days ago" },
    { name: "flashdeal-alb", kind: "load_balancer", health: "healthy", replicas: 2, version: "alb 2.0", last_deploy: "12 days ago" },
    { name: "cost-explorer", kind: "reporting", health: "healthy", replicas: 1, version: "billing export", last_deploy: "1 day ago" },
  ],
  steps: [
    {
      key: "load-test",
      title: "Measure what the sale will do",
      goal: "Find the breaking point before customers find it for you.",
      whatHappening:
        "The midnight sale starts in nine hours and there has been no load test on record since March. Checkout already times out when organic traffic merely doubles, and the support queue blames the app without any numbers behind it.",
      whatNext: "Run a load test against the staging checkout endpoint and read the p95 latency and the error count instead of the average.",
      author: "Nikhil Rao",
      ticket: { key: "FLD-801", title: "Sale starts tonight, prepare for 10x traffic", priority: "P1", slaMinutes: 480 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 480, subSteps: 1 },
        hard: { slaMinutes: 240, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "hey -z 30s -c 100 against the staging checkout URL prints response times, a histogram and the status-code split in one screen." },
        {
          title: "Concept",
          body: "The average is the number nobody experiences. A 300ms average with a 4s p95 means one customer in twenty waits four seconds — and that is the customer who abandons the cart. Read p95 and the error rate.",
        },
        {
          title: "Steps",
          items: [
            "hey -z 30s -c 100 https://staging.flashdeal.internal/api/checkout",
            "hey -z 30s -c 100 https://staging.flashdeal.internal/api/deals",
            "kubectl top pods -n prod",
          ],
        },
      ],
      doneWhen: ["hey -z"],
    },
    {
      key: "add-hpa",
      title: "Put an autoscaler on deals-api",
      goal: "Let the platform add pods when the queue grows instead of when someone notices.",
      whatHappening:
        "deals-api runs a fixed six replicas. Under load the pods sit at 94% CPU and the request queue drains slower than it fills, so latency grows until the load balancer starts returning 503.",
      whatNext: "Create a horizontal autoscaler with a floor of three and a ceiling of twelve at 60% CPU, then confirm it exists and watch the pods come up.",
      author: "Nikhil Rao",
      ticket: { key: "FLD-803", title: "deals-api cannot scale past six pods", priority: "P1", slaMinutes: 240 },
      variants: {
        easy: { slaMinutes: 1200, subSteps: 1 },
        medium: { slaMinutes: 240, subSteps: 2 },
        hard: { slaMinutes: 120, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "kubectl autoscale deployment deals-api --min=3 --max=12 --cpu-percent=60 -n prod creates the HPA. Then kubectl get hpa to see it." },
        {
          title: "Concept",
          body: "An autoscaler reacts to a metric with a delay: metrics-server scrape, then the controller's sync period, then a pod that needs to start and pass readiness. Ten minutes of sale traffic is roughly forty scaling decisions, so the floor matters as much as the ceiling.",
        },
        {
          title: "Steps",
          items: [
            "kubectl get deploy deals-api -n prod",
            "kubectl autoscale deployment deals-api --min=3 --max=12 --cpu-percent=60 -n prod",
            "kubectl get hpa -n prod",
            "kubectl get pods -n prod",
          ],
        },
      ],
      doneWhen: ["kubectl autoscale", "kubectl get hpa"],
    },
    {
      key: "slow-query",
      title: "Kill the slow query on RDS",
      goal: "Fix the database work that no amount of extra pods can buy its way out of.",
      whatHappening:
        "rds-main sits at 96% CPU even with twelve pods behind it. The deals endpoint runs a sequential scan over four million rows twice per request, and every extra pod just makes the scan run more often.",
      whatNext: "Read the slow query log, run an EXPLAIN to confirm the scan, add the missing composite index, then reload the endpoint to see the difference.",
      author: "Kabir Shah",
      ticket: { key: "FLD-804", title: "Deals endpoint scans 4M rows per request", priority: "P2", slaMinutes: 300 },
      variants: {
        easy: { slaMinutes: 1200, subSteps: 1 },
        medium: { slaMinutes: 300, subSteps: 2 },
        hard: { slaMinutes: 150, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "Query mysql.slow_log for the worst offenders, EXPLAIN the statement to see the scan, then CREATE INDEX on the columns in the WHERE clause." },
        {
          title: "Concept",
          body: "An index on (city_id, ends_at) lets the planner jump straight to the rows that are live in that city. Order matters: the equality column first, the range column second. Adding pods to a sequential scan multiplies the problem.",
        },
        {
          title: "Steps",
          items: [
            'mysql -h rds-main.flashdeal.internal -u ops -e "SELECT * FROM mysql.slow_log ORDER BY query_time DESC LIMIT 5;"',
            'mysql -h rds-main.flashdeal.internal -u ops deals -e "EXPLAIN SELECT * FROM deals WHERE city_id = 42 AND ends_at > NOW();"',
            'mysql -h rds-main.flashdeal.internal -u ops deals -e "CREATE INDEX idx_deals_city_ends ON deals (city_id, ends_at);"',
            "hey -z 30s -c 100 https://staging.flashdeal.internal/api/deals",
          ],
        },
      ],
      doneWhen: ["slow_log", "idx_deals_city_ends"],
    },
    {
      key: "idle-resources",
      title: "Find and stop the idle capacity",
      goal: "Pay for what is being used, not for what was once needed.",
      whatHappening:
        "Finance flags the bill at 30% over budget. Two nodes have been at 2–3% CPU for eleven days; nothing schedules there because of a taint somebody added during the last migration and never removed.",
      whatNext: "List the instances and the monthly spend by service, confirm the two idle nodes, then stop them.",
      author: "Farah Qureshi",
      ticket: { key: "FLD-802", title: "Cloud bill is 30 percent over budget", priority: "P2", slaMinutes: 600 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 600, subSteps: 2 },
        hard: { slaMinutes: 300, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "aws ec2 describe-instances lists every node with its type; aws ce get-cost-and-usage breaks the month down by service. The two m5.2xlarge nodes are the ones that are idle." },
        {
          title: "Concept",
          body: "Cost work is evidence work: name the resource, the monthly number and the utilization, then act. Stopping an idle node is reversible in a minute; leaving it running for another quarter is not reversible on the invoice.",
        },
        {
          title: "Steps",
          items: [
            "aws ec2 describe-instances",
            "aws ce get-cost-and-usage --time-period Start=2026-10-01,End=2026-10-25 --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE",
            "kubectl top nodes",
            "aws ec2 stop-instances --instance-ids <InstanceId of the three idle nodes>",
          ],
        },
      ],
      doneWhen: ["describe-instances", "stop-instances"],
    },
    {
      key: "right-size",
      title: "Right-size the database and prove the saving",
      goal: "Cut the oversize instance and show finance the number move.",
      whatHappening:
        "rds-main is a db.r6g.4xlarge for a workload that peaks at 22% CPU on a bad day. Finance does not want a promise that the bill will fall; they want the monthly figure re-read after the change.",
      whatNext: "Describe the instance, step the class down one size, and re-read the cost breakdown.",
      author: "Farah Qureshi",
      ticket: { key: "FLD-805", title: "rds-main is four times the size it needs", priority: "P2", slaMinutes: 480 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 480, subSteps: 2 },
        hard: { slaMinutes: 240, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "aws rds modify-db-instance --db-instance-identifier rds-main --db-instance-class db.r6g.xlarge --apply-immediately. Then re-read the cost breakdown." },
        {
          title: "Concept",
          body: "Right-sizing is the cheapest capacity work there is: the workload did not change, only the invoice did. Step down one class at a time and keep the p95 from the load test as the guardrail for when to stop.",
        },
        {
          title: "Steps",
          items: [
            "aws rds describe-db-instances --db-instance-identifier rds-main",
            "aws rds modify-db-instance --db-instance-identifier rds-main --db-instance-class db.r6g.xlarge --apply-immediately",
            "aws ce get-cost-and-usage --time-period Start=2026-10-01,End=2026-10-25 --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE",
          ],
        },
      ],
      doneWhen: ["modify-db-instance", "get-cost-and-usage"],
    },
  ],
  messages: [
    {
      id: "f1",
      trigger: "project_start",
      author: "Meera Iyer",
      role: "Head of engineering",
      body:
        "The sale opens at midnight and marketing is running the countdown on every channel. Last month the same traffic profile took checkout down for twenty-two minutes. I would like this evening to be boring.",
      variants: {
        easy: {
          body:
            "@{player} the midnight sale is coming and last month the same traffic took checkout down for twenty-two minutes. Take it one piece at a time: load test staging first and tell me the p95 and where it starts to break.",
        },
        hard: {
          body:
            "@{player} sale at midnight. Last month checkout died for twenty-two minutes. Fix it before then, and finance wants the bill down too.",
        },
      },
      replies: [
        { id: "measure", label: "Load testing staging now", next: "f2" },
        { id: "scale", label: "Adding capacity right away", next: "f3" },
      ],
    },
    {
      id: "f2",
      trigger: "reply",
      author: "Nikhil Rao",
      role: "Backend lead",
      body: "Good — numbers first. hey will tell us where it breaks and roughly how much headroom we have before we touch anything.",
    },
    {
      id: "f3",
      trigger: "reply",
      author: "Nikhil Rao",
      role: "Backend lead",
      body:
        "More capacity without knowing what breaks is how the bill got to 30% over budget. Run the load test; it takes thirty seconds.",
    },
    {
      id: "f4",
      trigger: "step_start",
      step: "load-test",
      author: "Nikhil Rao",
      role: "Backend lead",
      body:
        "Staging is on the same build as prod. Point hey at the checkout endpoint with a hundred concurrent clients for thirty seconds and send me the p95, not the average.",
    },
    {
      id: "f5",
      trigger: "step_done",
      step: "load-test",
      author: "Nikhil Rao",
      role: "Backend lead",
      body: "Four thousand milliseconds at p95 and a bucket of 504s. Now the sale has a number attached to it.",
    },
    {
      id: "f6",
      trigger: "step_start",
      step: "add-hpa",
      author: "Kabir Shah",
      role: "SRE",
      body:
        "deals-api is pinned at six pods. Put an HPA on it — floor three, ceiling twelve, 60% CPU — and then confirm the object exists before the sale, not during it.",
      replies: [
        { id: "hpa", label: "Creating the HPA now", next: "f7" },
        { id: "manual", label: "Scaling replicas by hand instead", next: "f8" },
      ],
    },
    {
      id: "f7",
      trigger: "reply",
      step: "add-hpa",
      author: "Kabir Shah",
      role: "SRE",
      body: "That will follow the traffic curve instead of waiting for a human at 00:40. Watch kubectl get hpa once under load.",
    },
    {
      id: "f8",
      trigger: "reply",
      step: "add-hpa",
      author: "Kabir Shah",
      role: "SRE",
      body:
        "Then someone has to sit and type kubectl scale all night, and the moment they blink we are back to six pods. The HPA does the same thing every fifteen seconds.",
      replies: [{ id: "hpa", label: "Creating the HPA now", next: "f7" }],
    },
    {
      id: "f9",
      trigger: "mistake",
      step: "add-hpa",
      author: "Kabir Shah",
      role: "SRE",
      body: "That did not create an autoscaler. kubectl autoscale deployment deals-api --min=3 --max=12 --cpu-percent=60 -n prod is the shape of it.",
      variants: {
        easy: {
          body: "Nothing is broken — the autoscaler just is not there yet. Try kubectl autoscale deployment deals-api --min=3 --max=12 --cpu-percent=60 -n prod.",
        },
      },
    },
    {
      id: "f10",
      trigger: "step_start",
      step: "slow-query",
      author: "Nikhil Rao",
      role: "Backend lead",
      body:
        "Twelve pods and the database is still pegged at 96%. That is not a scaling problem any more — the deals endpoint scans four million rows twice per request. Start in the slow query log.",
    },
    {
      id: "f11",
      trigger: "step_done",
      step: "slow-query",
      author: "Nikhil Rao",
      role: "Backend lead",
      body: "Down from 3.2s to under 200ms and the CPU graph finally moved. Same hardware, one index.",
    },
    {
      id: "f12",
      trigger: "step_start",
      step: "idle-resources",
      author: "Farah Qureshi",
      role: "Finance partner",
      body:
        "I am looking at a bill 30% over budget and a capacity graph that is flat at 2% on two machines. If they are not needed tonight, I would like them stopped before midnight.",
    },
    {
      id: "f13",
      trigger: "step_done",
      step: "idle-resources",
      author: "Farah Qureshi",
      role: "Finance partner",
      body: "Two nodes down. That is the first line of this review that goes in the right direction.",
    },
    {
      id: "f14",
      trigger: "step_start",
      step: "right-size",
      author: "Farah Qureshi",
      role: "Finance partner",
      body:
        "And rds-main: 22% CPU peak on a machine sized for four times that. Step it down and re-read the monthly breakdown so I can put the saving in front of the CFO.",
    },
    {
      id: "f15",
      trigger: "timer",
      atMinute: 65,
      step: "slow-query",
      author: "Meera Iyer",
      role: "Head of engineering",
      body: "Status check before I join the sale war room: are we scaling on our own yet, or still by hand?",
      replies: [
        { id: "auto", label: "Autoscaler is live, indexing now", next: "f16" },
        { id: "unknown", label: "Load test done, nothing changed yet", next: "f17" },
      ],
    },
    {
      id: "f16",
      trigger: "reply",
      step: "slow-query",
      author: "Meera Iyer",
      role: "Head of engineering",
      body: "Good. Send me the p95 when the index is in — I want one number I can quote to the exec channel.",
    },
    {
      id: "f17",
      trigger: "reply",
      step: "slow-query",
      author: "Meera Iyer",
      role: "Head of engineering",
      body: "We are four hours from the spike. A measurement without a change is not preparation.",
    },
    {
      id: "f18",
      trigger: "incident_end",
      step: "right-size",
      author: "Kabir Shah",
      role: "SRE",
      body:
        "Midnight came and went: p95 held at 190ms, nothing paged, and the bill is lower than last month. I have put the autoscaler and the index into the runbook.",
    },
    {
      id: "fld-red-1",
      redHerring: true,
      trigger: "step_start",
      step: "add-hpa",
      author: "Nikhil Rao",
      role: "Backend lead",
      body:
        "Before you touch the autoscaler: the cluster is on Kubernetes 1.29 and everyone knows 1.30 schedules pods faster. An upgrade tonight would probably fix the latency by itself.",
    },
    {
      id: "fld-red-2",
      redHerring: true,
      trigger: "step_start",
      step: "idle-resources",
      author: "Farah Qureshi",
      role: "Finance partner",
      body:
        "Saving money fastest: the media bucket is 210 a month and nobody would notice if we deleted it tonight. Two idle nodes can wait until next week.",
    },
  ],
};