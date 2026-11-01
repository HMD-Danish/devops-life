export type FsNode = { type: "file" | "dir"; content?: string };
export type Fs = Record<string, FsNode>;

export const HOME = "/home/engineer";
export const REPO = `${HOME}/repo`;

export function dirOf(path: string): string {
  if (path === "/" || !path) return "/";
  const idx = path.lastIndexOf("/");
  if (idx <= 0) return "/";
  return path.slice(0, idx);
}

export function baseOf(path: string): string {
  if (path === "/") return "/";
  return path.slice(path.lastIndexOf("/") + 1);
}

export function resolvePath(cwd: string, target = "."): string {
  if (!target || target === ".") return cwd;
  let raw = target;
  if (raw === "~") raw = HOME;
  else if (raw.startsWith("~/")) raw = `${HOME}/${raw.slice(2)}`;
  const start = raw.startsWith("/") ? [] : cwd.split("/").filter(Boolean);
  const parts = raw.startsWith("/") ? raw.split("/").filter(Boolean) : [...start, ...raw.split("/").filter(Boolean)];
  const stack: string[] = [];
  parts.forEach((part) => {
    if (part === ".") return;
    if (part === "..") stack.pop();
    else stack.push(part);
  });
  return `/${stack.join("/")}`;
}

export function displayPath(path: string): string {
  return path === HOME ? "~" : path.startsWith(`${HOME}/`) ? `~${path.slice(HOME.length)}` : path;
}

export function isDir(fs: Fs, path: string): boolean {
  return fs[path]?.type === "dir";
}

export function readFile(fs: Fs, path: string): string | null {
  const node = fs[path];
  if (!node || node.type !== "file") return null;
  return node.content ?? "";
}

export function ensureDir(fs: Fs, path: string): void {
  const parts = path.split("/").filter(Boolean);
  let cur = "";
  for (const part of parts) {
    cur += `/${part}`;
    if (!fs[cur]) fs[cur] = { type: "dir" };
  }
}

export function writeFile(fs: Fs, path: string, content: string): void {
  ensureDir(fs, dirOf(path));
  fs[path] = { type: "file", content };
}

export function removePath(fs: Fs, path: string): void {
  Object.keys(fs).forEach((key) => {
    if (key === path || key.startsWith(`${path}/`)) delete fs[key];
  });
}

export function listDir(fs: Fs, path: string) {
  const prefix = path === "/" ? "/" : `${path}/`;
  const seen = new Map<string, { name: string; type: "file" | "dir"; size: number }>();
  Object.keys(fs).forEach((key) => {
    if (!key.startsWith(prefix)) return;
    const rest = key.slice(prefix.length);
    if (!rest) return;
    const name = rest.split("/")[0];
    if (!name) return;
    if (rest.includes("/")) {
      seen.set(name, { name, type: "dir", size: 4096 });
    } else {
      const node = fs[key];
      seen.set(name, {
        name,
        type: node.type,
        size: node.type === "file" ? (node.content || "").length : 4096,
      });
    }
  });
  return [...seen.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}

type SeedWorld = {
  company: string;
  cluster: string;
  region: string;
  database: string;
  accountId: string;
  primaryService: string;
  primaryImage: string;
  replicas: number;
  services: string[];
};

const f = (fs: Fs, path: string, content: string) => writeFile(fs, path, content);

export function seedFilesystem(world: SeedWorld): Fs {
  const fs: Fs = {};
  ensureDir(fs, `${HOME}/.kube`);
  ensureDir(fs, "/var/spool/cron");
  f(fs, `${HOME}/.bashrc`, "# ~/.bashrc\nexport PS1='\\u@\\h:\\w$ '\nalias k='kubectl'\nalias tf='terraform'\n");
  f(fs, `${HOME}/.kube/config`, `apiVersion: v1
kind: Config
current-context: ${world.cluster}
clusters:
- name: ${world.cluster}
  cluster: { server: https://${world.accountId}.gr7.${world.region}.eks.amazonaws.com }
contexts:
- name: ${world.cluster}
  context: { cluster: ${world.cluster}, user: engineer, namespace: prod }
users:
- name: engineer
  user: { exec: { apiVersion: client.authentication.k8s.io/v1beta1, command: aws } }
`);
  f(fs, "/var/spool/cron/engineer", `# m h dom mon dow command
0 2 * * * /home/engineer/repo/scripts/backup-db.sh >> /var/log/backup.log 2>&1
*/5 * * * * curl -fsS localhost:8080/healthz > /dev/null || logger "healthz failed"
0 3 * * 0 /home/engineer/repo/scripts/rotate-certs.sh
`);

  f(fs, `${REPO}/README.md`, `# ${world.primaryService}

${world.company} production service. Owned by Platform.

## Layout
- \`cmd/server\` — the service
- \`k8s/\` — manifests
- \`terraform/\` — cluster, node group, database
- \`ansible/\` — node bootstrap

## Run locally
    docker compose up -d
    curl -s localhost:8080/healthz

## Deploy
    git push origin main          # pipeline builds, tests, deploys
    kubectl rollout status deploy/${world.primaryService} -n prod
`);

  f(fs, `${REPO}/go.mod`, `module ${world.company.toLowerCase()}/${world.primaryService}

go 1.22

require github.com/jackc/pgx/v5 v5.7.1
`);

  f(fs, `${REPO}/go.sum`, `github.com/jackc/pgx/v5 v5.7.1 h1:9bYb3l0mS2cT4nq0hQ0m0m0m0m0m0m0m0m0m0m0m0m1=\ngithub.com/jackc/pgx/v5 v5.7.1/go.mod h1:MO0v0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0=\n`);

  f(fs, `${REPO}/Dockerfile`, `FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server

FROM gcr.io/distroless/static:nonroot
COPY --from=build /out/server /server
USER nonroot
EXPOSE 8080
ENTRYPOINT ["/server"]
`);

  f(fs, `${REPO}/docker-compose.yml`, `services:
  api:
    build: .
    ports: ["8080:8080"]
    environment:
      DATABASE_URL: postgres://app:app@postgres:5432/${world.database}
      REDIS_URL: redis://redis:6379
    depends_on: [postgres, redis]
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${world.database}
      POSTGRES_PASSWORD: app
  redis:
    image: redis:7-alpine
`);

  f(fs, `${REPO}/Jenkinsfile`, `pipeline {
  agent { label 'docker' }
  options { timeout(time: 30, unit: 'MINUTES') }
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Install') { steps { sh 'go mod download' } }
    stage('Test') { steps { sh 'go test ./... -race' } }
    stage('Build image') {
      steps {
        sh "docker build -t \$ECR_REGISTRY/\$IMAGE_REPO:\$GIT_COMMIT ."
        sh "docker push \$ECR_REGISTRY/\$IMAGE_REPO:\$GIT_COMMIT"
      }
    }
    stage('Migrations') {
      steps { sh 'go run ./cmd/migrate up' }
    }
    stage('Deploy') {
      steps { sh 'kubectl apply -k overlays/prod' }
    }
  }
  post { failure { slackSend channel: '#incidents', message: "deploy failed: \${env.BUILD_URL}" } }
}
`);

  f(fs, `${REPO}/build.log`, `[12:01:04] Started by upstream project "deploy/prod" build number 1284
[12:01:05] Checking out ${world.primaryService} @ main
[12:01:19] go mod download
[12:01:44] go test ./... -race
[12:02:02] ok   ${world.company.toLowerCase()}/${world.primaryService}/internal/orders   3.412s
[12:02:11] docker build -t ${world.primaryImage} .
[12:02:58] Successfully tagged ${world.primaryImage}
[12:03:03] go run ./cmd/migrate up
[12:03:41] migrate: applying 20251018_orders_audit
[12:03:42] ERROR: role "app_write" does not have permission on orders_audit
[12:03:42] migrate: rollback of 20251018_orders_audit
[12:03:43] Build step 'Migrations' marked build as failure
[12:03:43] Finished: FAILURE
`);

  f(fs, `${REPO}/.env`, `ENVIRONMENT=prod
AWS_REGION=${world.region}
IMAGE_TAG=latest
DATABASE_URL=postgres://app_write@${world.database}:5432/${world.database}?sslmode=require
POOL_MAX_CONNECTIONS=100
LOG_LEVEL=info
`);

  f(fs, `${REPO}/k8s/deployment.yaml`, `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${world.primaryService}
  namespace: prod
spec:
  replicas: ${world.replicas}
  selector:
    matchLabels: { app: ${world.primaryService} }
  template:
    metadata:
      labels: { app: ${world.primaryService} }
    spec:
      containers:
      - name: app
        image: ${world.primaryImage}
        ports: [{ containerPort: 8080 }]
        env:
        - name: ENVIRONMENT
          value: prod
        resources:
          requests: { cpu: 250m, memory: 384Mi }
          limits: { cpu: "1", memory: 768Mi }
        readinessProbe:
          httpGet: { path: /healthz, port: 8080 }
          initialDelaySeconds: 5
        livenessProbe:
          httpGet: { path: /healthz, port: 8080 }
          periodSeconds: 20
`);

  f(fs, `${REPO}/k8s/service.yaml`, `apiVersion: v1
kind: Service
metadata:
  name: ${world.primaryService}
  namespace: prod
spec:
  type: ClusterIP
  selector: { app: ${world.primaryService} }
  ports: [{ port: 80, targetPort: 8080 }]
`);

  f(fs, `${REPO}/k8s/hpa.yaml`, `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${world.primaryService}
  namespace: prod
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: ${world.primaryService} }
  minReplicas: 3
  maxReplicas: 12
  metrics:
  - type: Resource
    resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
`);

  f(fs, `${REPO}/k8s/ingress.yaml`, `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${world.primaryService}
  namespace: prod
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:${world.region}:${world.accountId}:certificate/9a1c
spec:
  rules:
  - host: ${world.primaryService}.${world.company.toLowerCase()}.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend: { service: { name: ${world.primaryService}, port: { number: 80 } } }
`);

  f(fs, `${REPO}/terraform/main.tf`, `terraform {
  required_version = ">= 1.7.0"
  backend "s3" {
    bucket = "${world.company.toLowerCase()}-tfstate"
    key    = "prod/eks/terraform.tfstate"
    region = "${world.region}"
  }
}

module "vpc" {
  source               = "terraform-aws-modules/vpc/aws"
  version              = "5.5.1"
  name                 = "prod-vpc"
  cidr                 = "10.20.0.0/16"
  azs                  = ["${world.region}a", "${world.region}b"]
  private_subnets      = ["10.20.1.0/24", "10.20.2.0/24"]
  public_subnets       = ["10.20.101.0/24", "10.20.102.0/24"]
  enable_nat_gateway   = true
}

module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  version         = "20.8.4"
  cluster_name    = "${world.cluster}"
  cluster_version = "1.29"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets

  eks_managed_node_groups = {
    prod = {
      instance_types = ["c6i.2xlarge"]
      min_size       = 2
      desired_size   = 4
      max_size       = 6
    }
  }
}
`);

  f(fs, `${REPO}/terraform/variables.tf`, `variable "region" {
  type    = string
  default = "${world.region}"
}

variable "node_desired_size" {
  type    = number
  default = 4
}

variable "database_instance_class" {
  type    = string
  default = "db.r6g.xlarge"
}
`);

  f(fs, `${REPO}/terraform/terraform.tfvars`, `region                = "${world.region}"
node_desired_size     = 4
database_instance_class = "db.r6g.xlarge"
`);

  f(fs, `${REPO}/ansible/inventory.ini`, `[nodes]
prod-node-a ansible_host=10.20.1.11
prod-node-b ansible_host=10.20.1.12
prod-node-c ansible_host=10.20.1.13

[bastion]
bastion ansible_host=10.20.0.5
`);

  f(fs, `${REPO}/ansible/playbook.yml`, `- name: bootstrap node
  hosts: nodes
  become: true
  tasks:
    - name: install packages
      package: { name: ["chrony", "jq", "unzip"], state: present }
    - name: enable chrony
      service: { name: chrony, state: started, enabled: true }
    - name: tune sysctl
      sysctl: { name: "{{ item }}", value: "1", sysctl_set: true }
      loop: [net.ipv4.ip_forward, vm.overcommit_memory]
    - name: logrotate config
      copy: { src: files/logrotate.conf, dest: /etc/logrotate.d/app }
`);

  f(fs, `${REPO}/nginx/nginx.conf`, `worker_processes auto;
events { worker_connections 2048; }
http {
  upstream app { server ${world.primaryService}.prod.svc.cluster.local:80; }
  server {
    listen 8080;
    location /healthz { return 200 "ok"; }
    location / {
      proxy_pass http://app;
      proxy_read_timeout 60s;
      proxy_next_upstream error timeout http_502;
    }
  }
}
`);

  f(fs, `${REPO}/.github/workflows/deploy.yml`, `name: deploy
on:
  push: { branches: [main] }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: go test ./...
      - run: docker build -t ${world.primaryImage} .
      - run: docker push ${world.primaryImage}
      - run: kubectl rollout status deploy/${world.primaryService} -n prod
`);

  f(fs, `${REPO}/cmd/server/main.go`, `package main

import (
	"net/http"
	"os"
)

func main() {
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	http.ListenAndServe(":"+port, nil)
}
`);

  f(fs, `${REPO}/scripts/rotate-certs.sh`, `#!/usr/bin/env bash
set -euo pipefail
aws acm request-certificate \\
  --domain-name ${world.primaryService}.${world.company.toLowerCase()}.example.com \\
  --validation-method DNS
# TODO: wait for validation, then update the ingress annotation
`);

  return fs;
}