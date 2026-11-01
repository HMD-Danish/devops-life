import { REPO } from "./filesystem.ts";

/**
 * Files that belong to one project only. The generic jumpbox repo is seeded for
 * every project first, then these entries overwrite it — so a project without
 * an entry here keeps exactly the repo it always had.
 */
export const PROJECT_SEEDS: Record<string, Record<string, string>> = {
  "release-pipeline": {
    [`${REPO}/build.log`]: `[09:02:11] Started by user karthik
[09:02:11] Checking out git@github.com:paylane/payments-web.git @ main
[09:02:19] + docker run --rm node:16 npm ci
[09:02:19] npm WARN EBADENGINE Unsupported engine {
[09:02:19] npm WARN EBADENGINE   package: 'payments-web@4.8.2',
[09:02:19] npm WARN EBADENGINE   required: { node: '>=18' },
[09:02:19] npm WARN EBADENGINE   current: { node: 'v16.20.2', npm: '8.19.4' }
[09:02:19] npm WARN EBADENGINE }
[09:02:31] + npm test -- --ci
[09:02:43] FAIL test/refund.spec.ts
[09:02:43]   ● Test suite failed to run
[09:02:43]
[09:02:43]     TypeError: structuredClone is not defined
[09:02:43]
[09:02:43]       at src/refund/ledger.ts:12:18
[09:02:43]       at Object.<anonymous> (test/refund.spec.ts:4:1)
[09:02:43]
[09:02:43] Test Suites: 1 failed, 24 skipped, 25 total
[09:02:43] Tests:       0 total
[09:02:43] Snapshots:   0 total
[09:02:43] Time:        2.114 s
[09:02:44] npm ERR! Test failed.  See above for more details.
[09:02:45] Build step 'Test' marked build as failure
[09:02:45] Skipping stage 'SonarQube scan': an earlier stage failed
[09:02:45] Finished: FAILURE
`,
    [`${REPO}/Jenkinsfile`]: `pipeline {
  agent { docker { image 'node:16'; args '-u root' } }

  options {
    timeout(time: 20, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    ECR_REGISTRY = credentials('paylane-ecr')
    IMAGE_REPO   = 'paylane/payments-web'
  }

  stages {
    stage('Checkout') { steps { checkout scm } }

    stage('Install') { steps { sh 'npm ci' } }

    stage('Test') { steps { sh 'npm test -- --ci' } }

    stage('Build image') {
      steps {
        sh "docker build -t \$ECR_REGISTRY/\$IMAGE_REPO:\$GIT_COMMIT ."
      }
    }

    stage('Push image') {
      steps {
        sh "docker push \$ECR_REGISTRY/\$IMAGE_REPO:\$GIT_COMMIT"
      }
    }

    stage('Deploy staging') { steps { sh './scripts/deploy.sh staging' } }

    stage('Deploy prod') { steps { sh './scripts/deploy.sh prod' } }
  }

  post {
    failure { slackSend channel: '#release', message: "payments-web red: \${env.BUILD_URL}" }
  }
}
`,
    [`${REPO}/package.json`]: `{
  "name": "payments-web",
  "version": "4.8.2",
  "private": true,
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "jest --ci",
    "lint": "eslint ."
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  }
}
`,
    [`${REPO}/Dockerfile`]: `FROM node:16-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:16-slim
WORKDIR /app
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
USER node
EXPOSE 3000
CMD ["npm", "start"]
`,
  },

  "terraform-vpc": {
    [`${REPO}/terraform/versions.tf`]: `terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }

  backend "s3" {
    bucket = "skyloom-terraform-state"
    key    = "dev/network.tfstate"
    region = "ap-south-1"
  }
}
`,
    [`${REPO}/terraform/main.tf`]: `# skyloom-dev-network — the VPC below is still console-only.
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project = "skyloom-dev"
      owner   = "platform"
    }
  }
}

# TODO: declare aws_vpc "main" plus the public and private subnets here.
# Until then terraform only manages the bastion security group.

resource "aws_security_group" "bastion" {
  name        = "skyloom-dev-bastion"
  description = "bastion ssh access"
  vpc_id      = "vpc-0a91f2c3d4e5"

  ingress {
    description = "ssh"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
`,
    [`${REPO}/terraform/variables.tf`]: `variable "region" {
  description = "AWS region for the dev network"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}
`,
    [`${REPO}/terraform/terraform.tfvars`]: `region      = "ap-south-1"
environment = "dev"
`,
  },

  "ansible-fleet": {
    [`${REPO}/ansible/inventory.ini`]: `[web]
web-01 ansible_host=10.40.2.11
web-02 ansible_host=10.40.2.12
web-03 ansible_host=10.40.2.13 ansible_ssh_private_key_file=/home/engineer/.ssh/greencart_ed25519

[web:vars]
ansible_user=deploy
ansible_python_interpreter=/usr/bin/python3
`,
    [`${REPO}/ansible/site.yml`]: `---
- name: configure the web tier
  hosts: web
  become: true
  tasks:
    - name: install nginx
      package:
        name: nginx
        state: present

    - name: start nginx
      service:
        name: nginx
        state: started
        enabled: true
`,
    [`${REPO}/nginx/nginx.conf`]: `worker_processes auto;
events { worker_connections 2048; }

http {
  upstream web_cluster {
    server 10.40.2.11:8080;
    server 10.40.2.12:8080;
  }

  server {
    listen 80;
    server_name greencart.internal
    location /healthz { return 200 "ok"; }
    location / {
      proxy_pass http://web_cluster;
      proxy_read_timeout 60s;
    }
  }
}
`,
  },

  "observability-stack": {
    [`${REPO}/prometheus/prometheus.yml`]: `global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - rules/*.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]

  - job_name: grafana
    static_configs:
      - targets: ["localhost:3000"]

  # ride-api has a /metrics endpoint on :8081 but no job yet.
  # Add a scrape_configs entry for it here.
`,
    [`${REPO}/prometheus/rules/ride-api.yml`]: `groups:
  - name: ride-api
    rules:
      - alert: RideApiErrorRateHigh
        expr: |
          sum(rate(ride_http_requests_total{status=~"5.."}[5m]))
            /
          sum(rate(ride_http_requests_total[5m])) > 0.005
        for: 1m
        labels:
          severity: page
        annotations:
          summary: "ride-api error rate above threshold"
          runbook: "https://runbooks.zipcab.internal/ride-api"
`,
    [`${REPO}/logs/ride-api.log`]: `2026-10-28T18:04:51Z level=INFO service=ride-api rid=r-8841203 route=/v1/rides/search status=200 duration=1180ms
2026-10-28T18:04:52Z level=INFO service=ride-api rid=r-8841210 route=/v1/rides/match status=200 duration=210ms
2026-10-28T18:04:53Z level=INFO service=ride-api rid=r-8841204 route=/v1/rides/search status=200 duration=2420ms
2026-10-28T18:04:55Z level=WARN service=ride-api rid=r-8841205 route=/v1/rides/search slow_query_detected table=ride_requests
2026-10-28T18:04:55Z level=ERROR service=ride-api rid=r-8841205 route=/v1/rides/search status=500 duration=8421ms db.statement="SELECT * FROM ride_requests WHERE city_id = $1 AND status = 'searching' ORDER BY created_at DESC" db.plan="Seq Scan on ride_requests (cost=0.00..184203.55 rows=1182 width=412)"
2026-10-28T18:04:56Z level=ERROR service=ride-api rid=r-8841206 route=/v1/rides/search status=504 duration=9104ms upstream=postgres timeout=8s
2026-10-28T18:04:58Z level=INFO service=ride-api rid=r-8841207 route=/v1/rides/search status=200 duration=7620ms
2026-10-28T18:05:01Z level=ERROR service=ride-api rid=r-8841212 route=/v1/rides/search status=500 duration=8802ms db.plan="Seq Scan on ride_requests"
2026-10-28T18:05:04Z level=INFO service=ride-api rid=r-8841214 route=/v1/rides/estimate status=200 duration=96ms
2026-10-28T18:05:09Z level=INFO service=ride-api rid=r-8841219 route=/v1/rides/search status=200 duration=6110ms
`,
  },

  "gitops-delivery": {
    [`${REPO}/argocd/app-books.yaml`]: `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-books
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/booknest/helm-charts
    targetRevision: main
    path: apps/books
    helm:
      valueFiles:
        - values-staging.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: prod
  syncPolicy:
    syncOptions:
      - CreateNamespace=true
`,
    [`${REPO}/helm/apps/values-staging.yaml`]: `replicaCount: 3

image:
  repository: registry.booknest.io/books
  tag: 2.4.0
  pullPolicy: IfNotPresent

resources:
  requests: { cpu: 200m, memory: 256Mi }
  limits: { cpu: "1", memory: 512Mi }

ingress:
  enabled: true
  host: books.staging.booknest.io
`,
    [`${REPO}/helm/apps/values-prod.yaml`]: `replicaCount: 3

image:
  repository: registry.booknest.io/books
  tag: 2.3.1
  pullPolicy: IfNotPresent

resources:
  requests: { cpu: 400m, memory: 512Mi }
  limits: { cpu: "2", memory: 1Gi }

ingress:
  enabled: true
  host: books.booknest.io
`,
    [`${REPO}/apps/books/deployment.yaml`]: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-books
  namespace: prod
spec:
  replicas: 3
  selector:
    matchLabels: { app: app-books }
  template:
    metadata:
      labels: { app: app-books }
    spec:
      containers:
        - name: books
          image: registry.booknest.io/books:2.4.0
          ports:
            - containerPort: 8080
`,
  },

  "platform-lockdown": {
    [`${REPO}/src/config.js`]: `// CareFirst patient-api runtime config
module.exports = {
  port: 8080,
  db: {
    host: "carefirst-records.cluster-ro.ap-south-1.rds.amazonaws.com",
    user: "patient_app",
    // TODO(priya): move this out of the repo - see CFH-701
    password: "Xk9#patient_db_2025",
  },
  storage: {
    bucket: "carefirst-patient-records",
    prefix: "scans/",
    region: "ap-south-1",
  },
  // contractor key, added Monday for the S3 upload work
  AWS_ACCESS_KEY_ID: "AKIA4XQ7ZP2LMN6T3R5V",
  AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  auditLog: true,
};
`,
    [`${REPO}/iam/patient-api-policy.json`]: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PatientRecordsFull",
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": "*"
    }
  ]
}
`,
    [`${REPO}/Dockerfile`]: `FROM debian:12.4-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY patient-api /usr/local/bin/patient-api

USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/patient-api"]
`,
    [`${REPO}/deploy/patient-api.yaml`]: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: patient-api
  namespace: prod
spec:
  replicas: 4
  template:
    spec:
      containers:
        - name: api
          image: registry.carefirst.internal/patient-api:3.8.2
          env:
            - name: DB_HOST
              value: carefirst-records.cluster-ro.ap-south-1.rds.amazonaws.com
            - name: DB_USER
              value: patient_app
            - name: DB_PASSWORD
              value: Xk9#patient_db_2025
`,
  },

  "scale-spike": {
    [`${REPO}/k8s/deals-api.yaml`]: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: deals-api
  namespace: prod
spec:
  replicas: 6
  selector:
    matchLabels: { app: deals-api }
  template:
    metadata:
      labels: { app: deals-api }
    spec:
      containers:
        - name: api
          image: registry.flashdeal.internal/deals-api:5.2.1
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
          readinessProbe:
            httpGet: { path: /healthz, port: 8080 }
            initialDelaySeconds: 5
# No HorizontalPodAutoscaler exists for this deployment.
`,
    [`${REPO}/db/deals.sql`]: `-- deals table, 4.1M rows and growing
CREATE TABLE deals (
  id          bigserial PRIMARY KEY,
  seller_id   bigint NOT NULL,
  city_id     integer NOT NULL,
  title       text NOT NULL,
  price_cents integer NOT NULL,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL
);

-- The listing query filters on city_id and ends_at together, twice per request.
-- Nothing below supports that filter yet.
SELECT * FROM deals WHERE city_id = 42 AND ends_at > NOW();
`,
    [`${REPO}/runbook/sale-night.md`]: `# Sale night runbook

- 21:00  load test staging, record p95
- 22:00  confirm deals-api has a horizontal autoscaler (min 3, max 12)
- 23:00  check rds-main CPU and the slow query log
- 23:30  stop capacity that is not used
- 00:00  sale opens - watch checkout p95 and the 5xx rate
`,
  },
};