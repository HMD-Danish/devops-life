// Project content is data, not code: every step, hint and chat line is written
// here once and released by the engine. Nothing is generated at runtime.
export default {
  key: "docker-webapp",
  title: "Ship the checkout service in Docker",
  company: "Shopfront",
  summary: "The checkout API only runs on the dev lead's laptop. Containerise it, build the image and prove it boots.",
  needsTerminal: true,
  ticketPrefix: "SHP",
  workdir: "~/repo",
  terminal: {
    host: "bastion",
    allowed: ["docker", "git", "ls", "cd", "cat", "pwd", "echo", "curl"],
  },
  runtime: {
    label: "Containers",
    items: [
      { name: "checkout-db", detail: "postgres:15 · up 21d" },
      { name: "redis-cart", detail: "redis:7.2 · up 12d" },
    ],
  },
  build: { number: 1287, status: "failing", branch: "main", detail: "build failed: no Dockerfile" },
  incidents: [
    { id: "SHP-309", title: "checkout-api p95 above 300ms since the 1.4.2 deploy", severity: "sev3", opened: "Fri 09:40", owner: "you" },
  ],
  // What the chosen level changes here: which steps are played, how tight the
  // SLAs are, how many hints the Tech Lead gives, and which chatter is a
  // deliberate dead end.
  difficulty: {
    easy: {
      scoreMultiplier: 0.8,
      hintCeiling: 3,
      steps: ["read-dockerfile", "build-image"],
      redHerrings: [],
    },
    medium: {
      scoreMultiplier: 1,
      hintCeiling: 3,
      steps: ["read-dockerfile", "build-image", "run-container"],
      redHerrings: ["m-red-1"],
    },
    hard: {
      scoreMultiplier: 1.5,
      hintCeiling: 2,
      steps: ["read-dockerfile", "build-image", "run-container", "push-image"],
      redHerrings: ["m-red-1", "m-red-2"],
    },
  },
  chart: {
    title: "checkout-api p95 latency (ms)",
    points: [180, 176, 195, 210, 240, 228, 265, 288, 274, 310, 341, 366],
  },
  services: [
    { name: "checkout-api", kind: "api", health: "degraded", replicas: 2, version: "1.4.2", last_deploy: "3 days ago" },
    { name: "checkout-db", kind: "database", health: "healthy", replicas: 1, version: "15.4", last_deploy: "21 days ago" },
    { name: "redis-cart", kind: "cache", health: "healthy", replicas: 2, version: "7.2", last_deploy: "12 days ago" },
  ],
  steps: [
    {
      key: "read-dockerfile",
      title: "Read the Dockerfile",
      goal: "Understand what the image is supposed to contain before building it.",
      whatHappening:
        "The checkout API is deployed by hand from a developer laptop. The repo already has a Dockerfile, but nobody on the team has read it since a dependency upgrade.",
      whatNext: "Open the repo on the jumpbox and read the Dockerfile line by line.",
      ticket: {
        title: "Review the checkout Dockerfile before the first build",
        priority: "P3",
        slaMinutes: 5760,
      },
      variants: {
        easy: { slaMinutes: 5760, subSteps: 1 },
        medium: { slaMinutes: 1440, subSteps: 1 },
        hard: { slaMinutes: 240, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "The build definition is already in the repo — look at the repo root, not in a subfolder." },
        {
          title: "Concept",
          body: "A Dockerfile is a build recipe: FROM picks the base image, WORKDIR sets the build directory, COPY brings files in, RUN executes at build time and CMD is what starts when the container runs. Reading it first tells you which tag and port you are dealing with.",
        },
        {
          title: "Steps",
          items: [
            "cd ~/repo",
            "ls",
            "cat Dockerfile",
            "Note the FROM tag and the port in EXPOSE.",
          ],
        },
      ],
      doneWhen: ["cat Dockerfile"],
    },
    {
      key: "build-image",
      title: "Build the image",
      goal: "Produce a tagged image locally so anyone can run the service.",
      whatHappening:
        "There is no image in the registry, so every environment is hand-built. A tagged build is the first thing QA needs.",
      whatNext: "Build the image with an explicit tag — never :latest.",
      ticket: {
        title: "Build and tag checkout-api:1.4.3",
        priority: "P2",
        slaMinutes: 1440,
      },
      variants: {
        easy: { slaMinutes: 2880, subSteps: 1 },
        medium: { slaMinutes: 1440, subSteps: 1 },
        hard: { slaMinutes: 240, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "The image has to carry a version. Look at how the running service is versioned." },
        {
          title: "Concept",
          body: "docker build reads the Dockerfile and layers the result into a local image. The -t flag names it repo:tag, and the trailing dot is the build context — the directory whose files Docker can see.",
        },
        {
          title: "Steps",
          items: [
            "cd ~/repo",
            "docker build -t checkout-api:1.4.3 .",
            "docker images",
          ],
        },
      ],
      doneWhen: ["docker build"],
    },
    {
      key: "run-container",
      title: "Run it and check the health endpoint",
      goal: "Prove the image actually serves traffic.",
      whatHappening:
        "QA cannot test anything until the image runs outside the developer laptop. The health endpoint is the agreed signal.",
      whatNext: "Run the container with the port published, then curl /health from the jumpbox.",
      ticket: {
        title: "Run checkout-api on 8080 and verify /health",
        priority: "P2",
        slaMinutes: 1440,
      },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 720, subSteps: 2 },
        hard: { slaMinutes: 180, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "A container that is not published is unreachable. Which port does the Dockerfile expose?" },
        {
          title: "Concept",
          body: "docker run starts a container from an image. -p publishes a container port on the host as host:container, -d detaches it, and --name gives it a stable name you can inspect later.",
        },
        {
          title: "Steps",
          items: [
            "docker run -d --name checkout -p 8080:8080 checkout-api:1.4.3",
            "docker ps",
            "curl -s localhost:8080/health",
          ],
        },
      ],
      doneWhen: ["docker run", "curl"],
    },
    {
      key: "push-image",
      title: "Push the image to the registry",
      goal: "Put the tagged build somewhere every other machine can pull it.",
      whatHappening:
        "The image lives only on the jumpbox, so QA and the deploy job still have nothing to pull. A local image is not a delivery.",
      whatNext: "Tag the build for the team registry, then push that tag.",
      ticket: {
        title: "Push checkout-api:1.4.3 to the team registry",
        priority: "P2",
        slaMinutes: 720,
      },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 720, subSteps: 1 },
        hard: { slaMinutes: 180, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "Tagging only renames a local image. Pushing is what makes it reachable from another host." },
        {
          title: "Concept",
          body: "docker tag gives the same layers a second name — registry/name:tag — and docker push uploads those layers under that name. The registry is the handover point between your machine and everyone else's.",
        },
        {
          title: "Steps",
          items: [
            "docker tag checkout-api:1.4.3 registry.local/checkout-api:1.4.3",
            "docker push registry.local/checkout-api:1.4.3",
            "docker images",
          ],
        },
      ],
      doneWhen: ["docker push"],
    },
  ],
  messages: [
    {
      id: "m1",
      trigger: "project_start",
      step: "read-dockerfile",
      author: "Ravi Chandran",
      role: "Dev lead",
      body:
        "@{player} you're on the checkout service. Right now it only runs from my laptop, which is embarrassing. Start with the Dockerfile in ~/repo and tell me what you find.",
      variants: {
        easy: {
          body:
            "@{player} first week here, so let's start somewhere gentle: the checkout service only runs on my laptop. The Dockerfile is already in ~/repo — read it and tell me the base image and the port it exposes.",
        },
        hard: {
          body:
            "@{player} checkout runs on my laptop, it's a whole thing. Dockerfile is in the repo somewhere. Have a look and get back to me, I'm in back-to-backs.",
        },
      },
      replies: [
        { id: "on-it", label: "On it", next: "m2" },
        { id: "need-info", label: "Need more info", next: "m3" },
      ],
    },
    {
      id: "m2",
      trigger: "reply",
      step: "read-dockerfile",
      author: "Ravi Chandran",
      role: "Dev lead",
      body: "Good. Read it before you build — the FROM tag decides whether the image can even reach the registry.",
    },
    {
      id: "m3",
      trigger: "reply",
      step: "read-dockerfile",
      author: "Ravi Chandran",
      role: "Dev lead",
      body: "The repo is at ~/repo. cd there, ls the root, then cat Dockerfile. That is the whole task for now.",
    },
    {
      id: "m4",
      trigger: "step_start",
      step: "read-dockerfile",
      author: "Bea Okafor",
      role: "QA",
      body: "Nothing is testable until there is an image, so I'm blocked on this ticket. Ping me when docker images shows something.",
    },
    {
      id: "m5",
      trigger: "step_done",
      step: "read-dockerfile",
      author: "Ravi Chandran",
      role: "Dev lead",
      body: "That's the file. Build it as checkout-api:1.4.3 — the next patch version — and do not use :latest.",
      variants: {
        hard: {
          body: "ok. build it. version it properly, don't @ me with :latest again.",
        },
      },
    },
    {
      id: "m6",
      trigger: "step_done",
      step: "build-image",
      author: "Ravi Chandran",
      role: "Dev lead",
      body: "Image built. Now run it on 8080 and curl /health. Security wants the port published explicitly, not the default bridge network.",
    },
    {
      id: "m7",
      trigger: "mistake",
      step: "build-image",
      author: "Hana Sato",
      role: "Security",
      body: "Whatever just failed, don't fall back to :latest. An unpinned tag means we can't tell which digest is in production.",
      variants: {
        easy: {
          body:
            "No harm done — nothing was pushed, so nothing broke. You just need a version tag on the build: checkout-api:1.4.3. Try the same command with it.",
        },
      },
    },
    {
      id: "m8",
      trigger: "timer",
      atMinute: 90,
      step: "run-container",
      author: "Dmitri Volkov",
      role: "Product owner",
      body: "Quick one — support is quoting customers a fix today. Where are we on checkout being runnable outside a laptop?",
      replies: [{ id: "almost", label: "Almost there", next: "m9" }],
    },
    {
      id: "m9",
      trigger: "reply",
      step: "run-container",
      author: "Dmitri Volkov",
      role: "Product owner",
      body: "Perfect, I'll tell support to hold the message until you confirm the health check.",
    },
    {
      id: "m10",
      trigger: "step_done",
      step: "run-container",
      author: "Ravi Chandran",
      role: "Dev lead",
      body: "Health check green and the ticket is closed. That container is now the reference build for QA.",
    },
    {
      id: "m11",
      trigger: "step_start",
      step: "push-image",
      author: "Ravi Chandran",
      role: "Staff engineer",
      body: "Good news travels slowly if the image never leaves your machine. Tag it for registry.local and push — QA pulls from there, not from here.",
    },
    {
      id: "m12",
      trigger: "step_done",
      step: "push-image",
      author: "Bea Okafor",
      role: "QA",
      body: "Pulled it from the registry — same digest as your build, so I can finally test on my own machine. Closing my side of the ticket.",
    },
    {
      id: "m-red-1",
      redHerring: true,
      trigger: "step_start",
      step: "build-image",
      author: "Bea Okafor",
      role: "QA",
      body: "Before you build — I bumped the redis base image last week and staging has been flaky since. Might be worth rebuilding redis first.",
    },
    {
      id: "m-red-2",
      redHerring: true,
      trigger: "step_start",
      step: "build-image",
      author: "Dmitri Volkov",
      role: "Product owner",
      body: "Support says checkout feels slow on mobile. I'd look at the CDN caching rules before you spend time on the container.",
    },
  ],
};