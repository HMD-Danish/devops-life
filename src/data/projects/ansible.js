// Project 6 — GreenCart Grocery's web fleet. Ansible, Linux, Nginx, systemd, cron.
// Own cast, own inventory, own five steps; nothing borrowed from another project.
export default {
  key: "ansible-fleet",
  title: "Configure the web fleet with Ansible",
  company: "GreenCart",
  summary:
    "GreenCart's web tier was hand-built over three years and no two servers match. Write the inventory, a playbook, a template and a cron job, then find out why nginx refuses to start on the box that is nearly out of disk.",
  needsTerminal: true,
  ticketPrefix: "GRC",
  workdir: "~/repo",
  tools: ["Ansible", "Linux", "Nginx", "systemd", "cron"],
  terminal: {
    host: "ops-bastion",
    allowed: ["ansible", "ansible-playbook", "cat", "ls", "cd", "grep", "sed", "echo", "ssh", "systemctl", "journalctl", "crontab", "nginx"],
  },
  runtime: {
    label: "Web fleet",
    items: [
      { name: "web-01", detail: "running · nginx 1.24 · up 41 days" },
      { name: "web-02", detail: "running · disk 98% full" },
      { name: "web-03", detail: "running · nginx stopped" },
    ],
  },
  incidents: [
    { id: "GRC-4412", title: "web-02 disk 98 percent full", severity: "sev2", opened: "Mon 07:40", owner: "you" },
  ],
  difficulty: {
    easy: {
      scoreMultiplier: 0.8,
      hintCeiling: 3,
      steps: ["inventory-ping", "playbook-nginx", "fix-config"],
      redHerrings: [],
    },
    medium: {
      scoreMultiplier: 1,
      hintCeiling: 3,
      steps: ["inventory-ping", "playbook-nginx", "template-handler", "fix-config"],
      redHerrings: ["ans-red-1"],
    },
    hard: {
      scoreMultiplier: 1.5,
      hintCeiling: 2,
      steps: ["inventory-ping", "playbook-nginx", "template-handler", "cron-cleanup", "fix-config"],
      redHerrings: ["ans-red-1", "ans-red-2"],
    },
  },
  chart: {
    title: "web-02 disk used (%)",
    points: [61, 64, 68, 71, 75, 79, 83, 86, 90, 93, 96, 98],
  },
  services: [
    { name: "web-01", kind: "web", health: "healthy", replicas: 1, version: "nginx 1.24", last_deploy: "41 days ago" },
    { name: "web-02", kind: "web", health: "degraded", replicas: 1, version: "nginx 1.24", last_deploy: "12 days ago" },
    { name: "web-03", kind: "web", health: "down", replicas: 1, version: "nginx 1.18", last_deploy: "2 years ago" },
    { name: "nginx", kind: "proxy", health: "degraded", replicas: 3, version: "1.24", last_deploy: "12 days ago" },
    { name: "cron-jobs", kind: "worker", health: "healthy", replicas: 3, version: "logrotate 3.21", last_deploy: "90 days ago" },
  ],
  steps: [
    {
      key: "inventory-ping",
      title: "Write the inventory and ping the fleet",
      goal: "Know every host Ansible can reach before you write a single task.",
      whatHappening:
        "The fleet is three web servers, and one of them refuses the run before a task even starts: its inventory entry points at a private key that is not on this bastion.",
      whatNext: "Read the inventory, ping every host, and fix the entry that cannot connect.",
      author: "Suresh Kumar",
      ticket: { key: "GRC-410", title: "Standardise the three web servers with one inventory", priority: "P2", slaMinutes: 480 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 480, subSteps: 1 },
        hard: { slaMinutes: 180, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "Ping first. An inventory you have not pinged is a wish, not a fact." },
        {
          title: "Concept",
          body: "Ansible connects over SSH using the inventory's connection details. If one host carries its own private key path, that path wins over the agent — so a stale path fails one host while the other two pass.",
        },
        {
          title: "Steps",
          items: [
            "cat ansible/inventory.ini",
            "ansible all -m ping",
            'sed -i "s| ansible_ssh_private_key_file=.*||" ansible/inventory.ini',
            "ansible all -m ping",
          ],
        },
      ],
      doneWhen: ["ansible all -m ping"],
    },
    {
      key: "playbook-nginx",
      title: "Install and start nginx with a playbook",
      goal: "One playbook, every host, and an honest reading of the task that fails.",
      whatHappening:
        "The playbook installs nginx and asks systemd to start it. Two hosts come back green; web-02 fails, and the failure has nothing to do with nginx itself.",
      whatNext: "Run the playbook and read the failed task on web-02 before changing anything in it.",
      author: "Suresh Kumar",
      ticket: { key: "GRC-412", title: "Install and start nginx across the fleet", priority: "P2", slaMinutes: 480 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 480, subSteps: 1 },
        hard: { slaMinutes: 240, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "The recap tells you which host failed. The task above it tells you why — read both." },
        {
          title: "Concept",
          body: "A play stops at the first failed task on that host, but keeps going on the others. The recap is the summary: ok, changed, unreachable, failed. One failed host is a real problem, not a rounding error.",
        },
        {
          title: "Steps",
          items: [
            "cat ansible/site.yml",
            "ansible-playbook -i ansible/inventory.ini ansible/site.yml",
            "Read the fatal line for web-02",
            "Note which task it belongs to",
          ],
        },
      ],
      doneWhen: ["ansible-playbook"],
    },
    {
      key: "template-handler",
      title: "Template the config and reload through a handler",
      goal: "Stop editing nginx.conf by hand on three machines.",
      whatHappening:
        "Every server has a slightly different nginx.conf, edited by whoever last touched it. A Jinja2 template plus a handler gives all three the same file and a reload only when it actually changes.",
      whatNext: "Add the template task and a reload handler, then re-run with --diff to see what Ansible would change.",
      author: "Suresh Kumar",
      ticket: { key: "GRC-413", title: "Deploy nginx.conf from a Jinja2 template", priority: "P2", slaMinutes: 420 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 420, subSteps: 1 },
        hard: { slaMinutes: 240, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "template the file, notify a handler that reloads nginx. Handlers run once, at the end, and only when notified." },
        {
          title: "Concept",
          body: "A handler fires only when the task that notifies it reports changed. That is what makes a reload safe to leave in the playbook: an unchanged config means no restart, no dropped connections.",
        },
        {
          title: "Steps",
          items: [
            "Create ansible/templates/nginx.conf.j2",
            "Add a template task that notifies the reload handler",
            "Add handlers: reload nginx",
            "ansible-playbook -i ansible/inventory.ini ansible/site.yml --diff",
          ],
        },
      ],
      doneWhen: ["--diff"],
    },
    {
      key: "cron-cleanup",
      title: "Ship the log cleanup as a cron job",
      goal: "Fix the disk by policy, not by one-off deletion.",
      whatHappening:
        "web-02 is at 98 percent because nothing has ever rotated its application logs. A weekly cleanup job, deployed by Ansible, is the part that survives the next deploy.",
      whatNext: "Add the cron task to the playbook, run it with a tag, and prove the entry exists on the hosts.",
      author: "Shalini Rao",
      ticket: { key: "GRC-414", title: "Add weekly log cleanup through Ansible", priority: "P2", slaMinutes: 480 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 480, subSteps: 2 },
        hard: { slaMinutes: 240, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "The job is a task, not a manual crontab edit. Tag it so you can run it alone." },
        {
          title: "Concept",
          body: "The cron module writes the entry only if it is missing, which is what makes it idempotent. Verify with crontab -l on a host, not by trusting the playbook's green line.",
        },
        {
          title: "Steps",
          items: [
            "Add a cron task that truncates logs older than seven days",
            "ansible-playbook -i ansible/inventory.ini ansible/site.yml --tags cron",
            "crontab -l",
          ],
        },
      ],
      doneWhen: ["--tags cron", "crontab -l"],
    },
    {
      key: "fix-config",
      title: "Find why nginx will not start",
      goal: "Read the unit and the journal, then fix the config test.",
      whatHappening:
        "On web-03 the service is not running. The unit file is fine; nginx refuses the configuration it was handed, and systemd only says the control process exited.",
      whatNext: "Ask systemd, then the journal, then run the config test and fix the line it names.",
      author: "Suresh Kumar",
      ticket: { key: "GRC-411", title: "Disk full on web-02 and nginx down on web-03", priority: "P1", slaMinutes: 240 },
      variants: {
        easy: { slaMinutes: 720, subSteps: 1 },
        medium: { slaMinutes: 240, subSteps: 2 },
        hard: { slaMinutes: 120, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "systemctl status tells you it failed. journalctl -u nginx tells you why. nginx -t tells you which line." },
        {
          title: "Concept",
          body: "systemd reports the exit, not the reason: a config error and a port clash look identical from status. The journal has the stderr, and nginx -t turns that into a file and line number you can fix.",
        },
        {
          title: "Steps",
          items: ["systemctl status nginx", "journalctl -u nginx -n 20", "nginx -t", "Fix the line nginx names", "systemctl restart nginx"],
        },
      ],
      doneWhen: ["systemctl status", "nginx -t"],
    },
  ],
  messages: [
    {
      id: "a1",
      trigger: "project_start",
      step: "inventory-ping",
      author: "Suresh Kumar",
      role: "Sysadmin",
      body:
        "@{player} three web servers, three different configs, and one of them will not let Ansible in. Start with the inventory and ping every host — I want to know exactly which one is lying to us.",
      variants: {
        easy: {
          body: "@{player} the three web servers were built by hand over three years and no two of them match. Start with the inventory file: ping all three hosts and tell me which one will not log in and which one is nearly full.",
        },
        hard: {
          body: "@{player} fleet is drifting and web-02 is nearly full. Ping all three first, then we talk about the playbook.",
        },
      },
      replies: [
        { id: "ping", label: "Pinging all three now", next: "a2" },
        { id: "keys", label: "Which host has the key problem?", next: "a3" },
      ],
    },
    {
      id: "a2",
      trigger: "reply",
      step: "inventory-ping",
      author: "Suresh Kumar",
      role: "Sysadmin",
      body: "Good. If one comes back UNREACHABLE, read the inventory line before you touch the server — the problem is usually on this side.",
    },
    {
      id: "a3",
      trigger: "reply",
      step: "inventory-ping",
      author: "Suresh Kumar",
      role: "Sysadmin",
      body: "web-03 carries an old private key path in its inventory line. Nothing here has that key, so it refuses the connection.",
    },
    {
      id: "a4",
      trigger: "step_done",
      step: "inventory-ping",
      author: "Suresh Kumar",
      role: "Sysadmin",
      body: "Three hosts answering. Now the playbook: install nginx, start it, and read the task that fails instead of re-running it.",
    },
    {
      id: "a5",
      trigger: "step_start",
      step: "playbook-nginx",
      author: "Shalini Rao",
      role: "Manager",
      body:
        "Context from my side: web-02 has been alerting on disk all week and I have been telling people it is fine. If the playbook fails there, it is not the playbook.",
    },
    {
      id: "a6",
      trigger: "mistake",
      step: "playbook-nginx",
      author: "Suresh Kumar",
      role: "Sysadmin",
      body: "That run did not complete. Do not hand-fix the host to make it pass — fix the task, then run the playbook again.",
      variants: {
        easy: {
          body: "Nothing changed on the servers, so nothing is broken. Check the playbook path and run it again.",
        },
      },
    },
    {
      id: "a7",
      trigger: "step_start",
      step: "template-handler",
      author: "Suresh Kumar",
      role: "Sysadmin",
      body:
        "Now the part that stops the drift: one template, one handler, three identical configs. Re-run with --diff so we can see the change before it lands.",
    },
    {
      id: "a8",
      trigger: "step_done",
      step: "playbook-nginx",
      author: "Suresh Kumar",
      role: "Sysadmin",
      body: "So web-02 fails at starting nginx, not at installing it. Good catch — that is a disk problem wearing a service costume.",
    },
    {
      id: "a9",
      trigger: "step_start",
      step: "cron-cleanup",
      author: "Shalini Rao",
      role: "Manager",
      body:
        "I do not want to talk about web-02's disk again next month. Put the cleanup in the playbook so every new server gets it, and show me the crontab afterwards.",
      replies: [
        { id: "policy", label: "Weekly job, deployed by Ansible", next: "a10" },
        { id: "manual", label: "I will clear it by hand today", next: "a11" },
      ],
    },
    {
      id: "a10",
      trigger: "reply",
      step: "cron-cleanup",
      author: "Shalini Rao",
      role: "Manager",
      body: "Good. Weekly, in the playbook, and visible in crontab -l. That I can defend in a review.",
    },
    {
      id: "a11",
      trigger: "reply",
      step: "cron-cleanup",
      author: "Shalini Rao",
      role: "Manager",
      body:
        "By hand means it comes back the moment someone deploys again. I have watched that happen twice. Put it in the playbook.",
      replies: [{ id: "policy", label: "Weekly job, deployed by Ansible", next: "a10" }],
    },
    {
      id: "a12",
      trigger: "step_start",
      step: "fix-config",
      author: "Suresh Kumar",
      role: "Sysadmin",
      body:
        "web-03 has nginx stopped and nobody can tell me why. Ask systemd, then the journal, then the config test. One of those three will name the line.",
    },
    {
      id: "a13",
      trigger: "timer",
      atMinute: 75,
      step: "fix-config",
      author: "Shalini Rao",
      role: "Manager",
      body: "Support is asking whether the checkout page is on two servers or three. One line is enough.",
      replies: [{ id: "two", label: "Two healthy, third being fixed", next: "a14" }],
    },
    {
      id: "a14",
      trigger: "reply",
      step: "fix-config",
      author: "Shalini Rao",
      role: "Manager",
      body: "Thank you. I will tell support two, and that the third is coming back today.",
    },
    {
      id: "a15",
      trigger: "step_done",
      step: "fix-config",
      author: "Suresh Kumar",
      role: "Sysadmin",
      body: "nginx is up on all three and the config test is clean. Same file, same template, three machines. That is the whole point.",
    },
    {
      id: "a16",
      trigger: "incident_end",
      step: "fix-config",
      author: "Shalini Rao",
      role: "Manager",
      body: "Postmortem note: the disk filled for six weeks and nobody owned it. Now the playbook owns it, which is better than a person promising to remember.",
    },
    {
      id: "ans-red-1",
      redHerring: true,
      trigger: "step_start",
      step: "playbook-nginx",
      author: "Shalini Rao",
      role: "Manager",
      body: "Marketing wants nginx upgraded to 1.26 on all three this week. I would do that first, then look at whatever the playbook is complaining about.",
    },
    {
      id: "ans-red-2",
      redHerring: true,
      trigger: "step_start",
      step: "fix-config",
      author: "Suresh Kumar",
      role: "Sysadmin",
      body: "web-01 has been up 41 days. I would reboot the whole fleet before chasing one service — a clean boot fixes most of these.",
    },
  ],
};