# CloudCraft — AWS-hosted web app with EC2, ALB, Auto Scaling & RDS

A small full-stack web app deployed on AWS using a highly-available, auto-scaling
architecture — built as a hands-on project to demonstrate core AWS and cloud
infrastructure skills.

> **Note on live demo:** to keep AWS costs near zero, this environment is spun up
> on demand rather than left running 24/7. See the [Architecture](#architecture)
> section for the on-demand design, or check the screenshots/recording below for
> proof of a working deployment.

## Architecture

```
User → Application Load Balancer → Auto Scaling Group (EC2, 1-3 instances)
                                          │
                                          ├──→ RDS PostgreSQL (contact form + visit counter)
                                          └──→ S3 (deployment artifact storage)
```

- **EC2 Auto Scaling Group**: min 1 / desired 2 / max 3 instances, scaling on
  target-tracking CPU utilization (60%)
- **Application Load Balancer**: routes traffic across healthy instances,
  health-checked via a dedicated `/health` endpoint
- **S3**: stores the deployment package; instances pull the latest code via
  `aws s3 sync` on boot (no build server required)
- **RDS PostgreSQL**: stores contact form submissions and a visit counter,
  reachable only from the EC2 security group (not publicly accessible)
- **IAM role**: scoped to read-only S3 access for the deployment bucket
- **Security groups**: layered so only the ALB accepts public traffic, EC2 only
  accepts traffic from the ALB, and RDS only accepts traffic from EC2

## Tech stack
- **Frontend**: HTML, CSS, vanilla JS
- **Backend**: Node.js, Express
- **Database**: PostgreSQL (Amazon RDS)
- **Infrastructure**: AWS EC2, Auto Scaling Groups, Application Load Balancer, S3, IAM, VPC/Security Groups
- **Deployment**: EC2 launch template with a user-data bootstrap script; app runs as a systemd service

## Features
- Responsive landing page served from EC2 instances behind a load balancer
- Live visitor counter persisted in RDS
- Contact form that writes submissions directly to a PostgreSQL table
- Auto scaling based on CPU load, with a health-checked, self-healing instance group

## Repository structure
```
.
├── server.js              # Express app: static file serving + API routes
├── package.json
├── public/                # Static frontend assets
│   ├── index.html
│   ├── style.css
│   └── script.js
├── user-data.sh            # EC2 launch template bootstrap script
├── docs/
│   └── architecture.png    # Architecture diagram
└── README.md
```

## How it's deployed
1. Code is synced to S3: `aws s3 sync . s3://<bucket>/app/ --exclude "node_modules/*"`
2. An EC2 Auto Scaling Group launches instances from a Launch Template
3. On boot, each instance's user-data script pulls the code from S3, installs
   dependencies, and starts the app as a systemd service
4. The Application Load Balancer health-checks each instance on `/health` and
   only routes traffic to healthy ones
5. The Auto Scaling Group adds/removes instances automatically based on CPU load

## Challenges & how they were solved
This section is deliberately included to show the debugging process, not just
the finished result:

- **Zip structure mismatches**: initial deployment packages had inconsistent
  folder nesting (extra parent folder, files split between root and `public/`),
  causing the app to either not start or serve unstyled pages. Solved by
  switching from a zip-based deploy to `aws s3 sync`, which mirrors the local
  folder structure exactly and removes an entire class of packaging bugs.
- **IAM least-privilege scoping**: `s3 sync` requires both `s3:ListBucket` (on
  the bucket ARN) and `s3:GetObject` (on the bucket's object ARN) — easy to
  grant only one and hit `AccessDenied`. Resolved by scoping the policy
  correctly to both actions.
- **Networking**: instances initially had no outbound internet access during
  boot (no public IP assigned), which silently broke package installation.
  Fixed by enabling auto-assign public IP at the subnet level.
- **Security group chaining**: RDS, EC2, and the ALB are only allowed to talk
  to each other via **security-group-referenced** rules (not IP/CIDR), so a
  compromised or public-facing tier never gets direct access to the database.

## Cost approach
This project intentionally avoids a NAT Gateway and Route53 to stay within a
low/no-cost footprint suitable for a portfolio project, and is designed to be
provisioned and torn down on demand rather than run continuously. See the
architecture notes for a discussion of trade-offs vs. a production setup
(e.g., private subnets + NAT Gateway would be the production-grade choice).

## Possible next steps
- Add Terraform to fully codify this infrastructure
- Add a CI/CD pipeline (Jenkins/GitHub Actions) to automate the S3 sync + instance refresh
- Move to EKS for a container-based version of the same architecture
- Add CloudWatch dashboards and alarms for monitoring

## Local development
```bash
npm install
DB_HOST=localhost DB_USER=postgres DB_PASSWORD=yourpassword DB_NAME=cloudcraftdb npm start
```
