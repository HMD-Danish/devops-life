// Project 5 — Skyloom Media's cloud network. Terraform, AWS VPC, EC2, S3, IAM.
// Own cast, own account numbers, own five steps. Nothing here appears in
// another project definition.
export default {
  key: "terraform-vpc",
  title: "Build the cloud network with Terraform",
  company: "Skyloom",
  summary:
    "Skyloom's dev environment was clicked together in the AWS console and a scanner just found SSH open to the world. Write the network as code, read the plan before you apply it, prove the bucket is private, then tear the whole test environment down.",
  needsTerminal: true,
  ticketPrefix: "SKY",
  workdir: "~/repo",
  tools: ["Terraform", "AWS VPC", "EC2", "S3", "IAM"],
  terminal: {
    host: "cloud-shell",
    allowed: ["terraform", "aws", "cat", "ls", "cd", "grep", "sed", "echo", "git"],
  },
  runtime: {
    label: "EC2 instances",
    items: [
      { name: "i-0f31c9a2d7", detail: "t3.micro · running · dev" },
      { name: "i-0b77d1e440", detail: "t3.micro · running · dev" },
    ],
  },
  incidents: [
    { id: "SEC-318", title: "Security scanner flags SSH open to 0.0.0.0/0", severity: "sev2", opened: "Thu 09:20", owner: "you" },
  ],
  difficulty: {
    easy: {
      scoreMultiplier: 0.8,
      hintCeiling: 3,
      steps: ["terraform-init", "vpc-plan", "ssh-fix"],
      redHerrings: [],
    },
    medium: {
      scoreMultiplier: 1,
      hintCeiling: 3,
      steps: ["terraform-init", "vpc-plan", "ssh-fix", "bucket-teardown"],
      redHerrings: ["tf-red-1"],
    },
    hard: {
      scoreMultiplier: 1.5,
      hintCeiling: 2,
      steps: ["terraform-init", "vpc-plan", "state-lock", "ssh-fix", "bucket-teardown"],
      redHerrings: ["tf-red-1", "tf-red-2"],
    },
  },
  chart: {
    title: "dev account spend (USD per day)",
    points: [41, 44, 43, 47, 52, 49, 55, 58, 54, 61, 63, 60],
  },
  services: [
    { name: "vpc-main", kind: "network", health: "healthy", replicas: 1, version: "10.40.0.0/16", last_deploy: "hand-built, 2 years ago" },
    { name: "ec2-bastion", kind: "node", health: "degraded", replicas: 1, version: "t3.micro", last_deploy: "18 days ago" },
    { name: "s3-assets", kind: "bucket", health: "degraded", replicas: 1, version: "greencdn-assets", last_deploy: "43 days ago" },
    { name: "iam-roles", kind: "iam", health: "healthy", replicas: 1, version: "4 roles", last_deploy: "90 days ago" },
  ],
  steps: [
    {
      key: "terraform-init",
      title: "Initialise the working directory",
      goal: "Get Terraform talking to the provider before writing a single resource.",
      whatHappening:
        "terraform init stops on the provider constraint in versions.tf: it asks for an AWS provider older than the one the rest of the module was written against, and nothing else runs until that resolves.",
      whatNext: "Read the constraint, loosen it to the installed provider, and initialise again.",
      author: "Rohan",
      ticket: { key: "SKY-314", title: "Fix the AWS provider version constraint", priority: "P2", slaMinutes: 480 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 480, subSteps: 1 },
        hard: { slaMinutes: 180, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "init fails before it reads a resource. The constraint is in versions.tf, not in main.tf." },
        {
          title: "Concept",
          body: "A version constraint is a contract with the provider registry. Pinning the AWS provider below the version the module needs fails at init, which is why the error looks unrelated to the network you are about to write.",
        },
        {
          title: "Steps",
          items: ['cd terraform', 'cat versions.tf', 'sed -i "s/~> 4.0/~> 5.0/g" versions.tf', "terraform init"],
        },
      ],
      doneWhen: ["terraform init"],
    },
    {
      key: "vpc-plan",
      title: "Write the VPC and read the plan",
      goal: "Describe the network in code, then know exactly what apply would do.",
      whatHappening:
        "main.tf still holds only the bastion security group. The VPC, the two subnets, the internet gateway and the route table live in the console and in nobody's repository.",
      whatNext: "Add the VPC and two subnets to main.tf, then plan it and read the plan before touching apply.",
      author: "Rohan",
      ticket: { key: "SKY-310", title: "Create the dev VPC with two subnets", priority: "P2", slaMinutes: 600 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 600, subSteps: 1 },
        hard: { slaMinutes: 240, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "The plan is the review. Write the resources, plan, and read every line before you apply." },
        {
          title: "Concept",
          body: "terraform plan diffs what the code declares against what the state records. Reading it is the only cheap moment to notice that a subnet is about to be replaced — after apply, the same knowledge costs an outage.",
        },
        {
          title: "Steps",
          items: [
            "cat terraform/main.tf",
            "Add aws_vpc plus two aws_subnet blocks",
            "terraform plan",
            "Check the counts: how many to add, change, destroy",
          ],
        },
      ],
      doneWhen: ["terraform plan"],
    },
    {
      key: "state-lock",
      title: "Clear the stale state lock",
      goal: "Get the backend writable again without racing another apply.",
      whatHappening:
        "The previous apply was killed mid-run and left its lock in the state backend. Every command now waits for the lock and dies with an id that nobody on the team recognises.",
      whatNext: "Confirm nobody else is applying, then force-unlock with the id from the error and plan again.",
      author: "Anjali Deshpande",
      ticket: { key: "SKY-312", title: "Clear the orphaned state lock", priority: "P1", slaMinutes: 240 },
      variants: {
        easy: { slaMinutes: 960, subSteps: 1 },
        medium: { slaMinutes: 240, subSteps: 1 },
        hard: { slaMinutes: 120, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "The error prints a lock id. That id is the argument." },
        {
          title: "Concept",
          body: "A lock protects the state file from two writers at once. force-unlock with the lock id clears it, but only after you are sure the other run is dead — otherwise two applies race and the state loses.",
        },
        {
          title: "Steps",
          items: ["terraform plan", "Copy the Lock Info ID from the error", "terraform force-unlock <ID>", "terraform plan"],
        },
      ],
      doneWhen: ["terraform force-unlock"],
    },
    {
      key: "ssh-fix",
      title: "Close SSH to the world",
      goal: "Remove the finding the scanner opened, in code rather than in the console.",
      whatHappening:
        "The bastion security group allows port 22 from 0.0.0.0/0. That is the scanner's finding, and it is also the fastest way onto the network for anyone who guesses a password.",
      whatNext: "Scope the rule to the office CIDR in main.tf, plan it, then apply.",
      author: "Anjali Deshpande",
      ticket: { key: "SKY-311", title: "Close open SSH access on the bastion", priority: "P1", slaMinutes: 180 },
      variants: {
        easy: { slaMinutes: 720, subSteps: 1 },
        medium: { slaMinutes: 180, subSteps: 1 },
        hard: { slaMinutes: 90, subSteps: 1 },
      },
      hints: [
        { title: "Nudge", body: "The rule is a cidr_blocks line in main.tf, not a console edit." },
        {
          title: "Concept",
          body: "0.0.0.0/0 on 22 exposes SSH to every address on the internet and is the first line an auditor greps for. Scope it to the office or a VPN range and apply, so the security group in AWS matches the code in git.",
        },
        {
          title: "Steps",
          items: [
            "grep cidr_blocks terraform/main.tf",
            'sed -i "s|0.0.0.0/0|203.0.113.0/24|g" terraform/main.tf',
            "terraform plan",
            "terraform apply",
          ],
        },
      ],
      doneWhen: ["terraform apply"],
    },
    {
      key: "bucket-teardown",
      title: "Prove the bucket is private, then tear down",
      goal: "Leave the assets bucket behind correctly, and the rest of the environment gone.",
      whatHappening:
        "The dev environment has done its job for this sprint. Before it goes, the assets bucket has to exist with public access blocked, and the whole workspace has to be destroyed so it stops billing.",
      whatNext: "Add the bucket with public access blocked, apply, list it with the AWS CLI, then destroy the workspace.",
      author: "Rohan",
      ticket: { key: "SKY-313", title: "Add the private assets bucket and remove the dev environment", priority: "P2", slaMinutes: 600 },
      variants: {
        easy: { slaMinutes: 1440, subSteps: 1 },
        medium: { slaMinutes: 600, subSteps: 2 },
        hard: { slaMinutes: 300, subSteps: 2 },
      },
      hints: [
        { title: "Nudge", body: "A bucket is private by default. The block is what stops someone undoing that later." },
        {
          title: "Concept",
          body: "aws_s3_bucket_public_access_block has four switches, and all four belong on. Verify with aws s3 ls that the bucket exists, then destroy — the verification is what a reviewer will ask for.",
        },
        {
          title: "Steps",
          items: [
            "Add aws_s3_bucket and aws_s3_bucket_public_access_block to main.tf",
            "terraform apply",
            "aws s3 ls",
            "terraform destroy",
          ],
        },
      ],
      doneWhen: ["aws s3 ls", "terraform destroy"],
    },
  ],
  messages: [
    {
      id: "t1",
      trigger: "project_start",
      step: "terraform-init",
      author: "Rohan",
      role: "Cloud architect",
      body:
        "@{player} the dev network exists in the console and in nobody's repo. Before we add anything to it, I want a clean init and a plan I can read. Start there and tell me what init is unhappy about.",
      variants: {
        easy: {
          body: "@{player} the dev network exists in the console but not in any code, and I would like it the other way round. Start in ~/repo/terraform: init the workspace, then read main.tf before you plan anything.",
        },
        hard: {
          body: "@{player} dev network, no code, scanner finding from this morning. Init first, then give me a plan.",
        },
      },
      replies: [
        { id: "init", label: "Running init now", next: "t2" },
        { id: "console", label: "Should I import what is in the console?", next: "t3" },
      ],
    },
    {
      id: "t2",
      trigger: "reply",
      step: "terraform-init",
      author: "Rohan",
      role: "Cloud architect",
      body: "Good. If init complains about a provider version, fix the constraint — do not pin the whole module to an old provider.",
    },
    {
      id: "t3",
      trigger: "reply",
      step: "terraform-init",
      author: "Rohan",
      role: "Cloud architect",
      body: "Not yet. Import the console resources after we have a plan that matches them, otherwise the state becomes a museum of guesses.",
    },
    {
      id: "t4",
      trigger: "step_start",
      step: "vpc-plan",
      author: "Anjali Deshpande",
      role: "Security",
      body:
        "When you write the subnets: the bastion goes in the public one, everything else in the private one. I am not approving a flat network.",
    },
    {
      id: "t5",
      trigger: "step_done",
      step: "terraform-init",
      author: "Rohan",
      role: "Cloud architect",
      body: "Init is clean. Now the VPC and two subnets in main.tf — and run the plan before you apply anything.",
    },
    {
      id: "t6",
      trigger: "mistake",
      step: "vpc-plan",
      author: "Rohan",
      role: "Cloud architect",
      body: "That plan did not produce anything usable. Re-read main.tf — a subnet without its VPC reference will not plan.",
      variants: {
        easy: {
          body: "Nothing was created, so nothing is broken. Check the resource blocks in main.tf and plan again.",
        },
      },
    },
    {
      id: "t7",
      trigger: "step_start",
      step: "ssh-fix",
      author: "Anjali Deshpande",
      role: "Security",
      body:
        "The scanner finding is on my desk: 22 open to 0.0.0.0/0 on the bastion group. Fix it in main.tf and apply, then I close the ticket.",
      replies: [
        { id: "scope", label: "Scoping it to the office CIDR", next: "t8" },
        { id: "keep", label: "It is only dev — can it wait?", next: "t9" },
      ],
    },
    {
      id: "t8",
      trigger: "reply",
      step: "ssh-fix",
      author: "Anjali Deshpande",
      role: "Security",
      body: "That is the right answer. Apply it and paste the plan line that shows the rule changing.",
    },
    {
      id: "t9",
      trigger: "reply",
      step: "ssh-fix",
      author: "Anjali Deshpande",
      role: "Security",
      body:
        "Dev still runs on the corporate network with real IAM roles on it. Waiting is how it becomes production. Close it today.",
      replies: [{ id: "scope", label: "Scoping it to the office CIDR", next: "t8" }],
    },
    {
      id: "t10",
      trigger: "step_start",
      step: "bucket-teardown",
      author: "Rohan",
      role: "Cloud architect",
      body:
        "Last piece: the assets bucket, public access blocked on all four switches. Then destroy the test environment — it has been billing six weeks for nothing.",
    },
    {
      id: "t11",
      trigger: "timer",
      atMinute: 90,
      step: "bucket-teardown",
      author: "Rohan",
      role: "Cloud architect",
      body: "Finance pinged me about the dev account. One line: is it destroyed yet?",
      replies: [{ id: "soon", label: "Bucket first, then destroy", next: "t12" }],
    },
    {
      id: "t12",
      trigger: "reply",
      step: "bucket-teardown",
      author: "Rohan",
      role: "Cloud architect",
      body: "Fine, but bucket before destroy — I do not want a destroy plan that also takes the assets with it.",
    },
    {
      id: "t13",
      trigger: "step_done",
      step: "ssh-fix",
      author: "Anjali Deshpande",
      role: "Security",
      body: "Finding closed. The security group matches the code now, which is the part I actually care about.",
    },
    {
      id: "t14",
      trigger: "step_done",
      step: "bucket-teardown",
      author: "Rohan",
      role: "Cloud architect",
      body: "Bucket exists, all four public switches on, environment destroyed. That is the first network we can rebuild from nothing.",
    },
    {
      id: "t15",
      trigger: "incident_end",
      step: "bucket-teardown",
      author: "Anjali Deshpande",
      role: "Security",
      body: "Postmortem note: the finding was two years old. It surfaced the day we started reading the network as code, not the day someone clicked wrong.",
    },
    {
      id: "tf-red-1",
      redHerring: true,
      trigger: "step_start",
      step: "ssh-fix",
      author: "Rohan",
      role: "Cloud architect",
      body: "The EC2 instance type looks undersized for the bastion. I would resize it before touching security groups — that is probably why the scanner complained.",
    },
    {
      id: "tf-red-2",
      redHerring: true,
      trigger: "step_start",
      step: "bucket-teardown",
      author: "Anjali Deshpande",
      role: "Security",
      body: "IAM has four roles and three of them are unused. Delete them first and the bucket work gets much simpler.",
    },
  ],
};