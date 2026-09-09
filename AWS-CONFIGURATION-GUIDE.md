# AWS configuration guide — CloudCraft demo site

No Route53 / domain used. Access the site via the ALB's auto-generated DNS name once
everything is wired up (found on the ALB's console page after creation).

Build resources in this order: S3 → IAM role → RDS → Security groups → Launch template →
Target group → Auto Scaling group → ALB.

---

## 1. S3 — deployment + static assets bucket

Create one bucket (console: S3 > Create bucket):
- Name: `cloudcraft-deploy-<yourname>` (must be globally unique)
- Region: same as your EC2/RDS resources
- Block all public access: **ON** (this bucket only holds your zipped app code, not public content)

Upload your deployment package:
```bash
cd project/
zip -r app.zip . -x "node_modules/*"
aws s3 cp app.zip s3://cloudcraft-deploy-<yourname>/app.zip
```

If you also want a public assets bucket for images later, create a second bucket, disable
"block all public access" for it, and attach this bucket policy (replace bucket name):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::cloudcraft-assets-<yourname>/*"
    }
  ]
}
```

---

## 2. IAM role — for EC2 instances

Console: IAM > Roles > Create role > Trusted entity: **AWS service > EC2**

Attach this inline policy (lets instances download the app package from S3):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::cloudcraft-deploy-<yourname>/*"
    }
  ]
}
```
Name it: `cloudcraft-ec2-role`. You'll attach this as the "IAM instance profile" in the
launch template.

---

## 3. RDS — PostgreSQL database

Console: RDS > Create database
- Engine: PostgreSQL
- Template: Free tier (if eligible) or Dev/Test
- DB instance identifier: `cloudcraft-db`
- Instance class: `db.t3.micro`
- Storage: 20 GB gp2
- Master username: `appadmin`
- Master password: set your own, store it securely
- Connectivity: use the same VPC as EC2
- Public access: **No**
- VPC security group: create new, name it `cloudcraft-rds-sg` (rules below)
- Initial database name: `cloudcraftdb`

Note the **endpoint** shown after creation — that goes into `DB_HOST` in `user-data.sh`.

---

## 4. Security groups

Create three security groups in your VPC:

**`cloudcraft-alb-sg`** (attached to the ALB)
| Type | Protocol | Port | Source |
|---|---|---|---|
| Inbound | HTTP | 80 | 0.0.0.0/0 |

**`cloudcraft-ec2-sg`** (attached to EC2 instances via launch template)
| Type | Protocol | Port | Source |
|---|---|---|---|
| Inbound | Custom TCP | 3000 | `cloudcraft-alb-sg` (security group, not IP) |
| Inbound | SSH | 22 | Your IP only (for troubleshooting) |

**`cloudcraft-rds-sg`** (attached to RDS)
| Type | Protocol | Port | Source |
|---|---|---|---|
| Inbound | PostgreSQL | 5432 | `cloudcraft-ec2-sg` (security group, not IP) |

This chain means: internet → ALB only; ALB → EC2 only; EC2 → RDS only. Nothing reaches
RDS or EC2 directly from the internet.

---

## 5. Launch template

Console: EC2 > Launch Templates > Create launch template
- Name: `cloudcraft-lt`
- AMI: Amazon Linux 2023 (latest)
- Instance type: `t3.micro`
- Key pair: create/select one (needed if you want SSH access)
- Network settings: security group = `cloudcraft-ec2-sg`
- IAM instance profile: `cloudcraft-ec2-role`
- Advanced details > User data: paste the full contents of `user-data.sh`
  (edit the bucket name and RDS endpoint placeholders first)

---

## 6. Target group

Console: EC2 > Target Groups > Create target group
- Target type: Instances
- Protocol: HTTP, Port: **3000** (matches the app's listening port)
- VPC: same as everything else
- Health check path: `/health`
- Health check settings: leave defaults (30s interval, 2 healthy threshold)

---

## 7. Auto Scaling group

Console: EC2 > Auto Scaling Groups > Create Auto Scaling group
- Name: `cloudcraft-asg`
- Launch template: `cloudcraft-lt`
- VPC + subnets: select **2 public subnets in different AZs**
- Attach to existing load balancer target group: `cloudcraft-tg` (created above)
- Health checks: enable ELB health checks (not just EC2 status checks)
- Group size: Desired = **2**, Minimum = **1**, Maximum = **3**
- Scaling policy: Target tracking, metric = Average CPU Utilization, target value = **60%**

---

## 8. Application Load Balancer

Console: EC2 > Load Balancers > Create > Application Load Balancer
- Name: `cloudcraft-alb`
- Scheme: Internet-facing
- VPC: same VPC, select the 2 public subnets
- Security group: `cloudcraft-alb-sg`
- Listener: HTTP : 80 → forward to `cloudcraft-tg`

Once created, copy the **DNS name** shown on the ALB's details page
(e.g. `cloudcraft-alb-123456789.us-east-1.elb.amazonaws.com`) — that's your live URL.

---

## Verification checklist

1. RDS status = "Available"
2. Launch template has no syntax errors (check `/var/log/user-data.log` on an instance via SSH if the app doesn't start)
3. ASG shows 2 healthy instances in the target group ("healthy" in Target Groups > Targets tab)
4. Visiting the ALB DNS name loads the site and the visitor counter increments
5. Submitting the contact form returns "Thanks! Your message was saved."

## Estimated monthly cost
See the earlier cost breakdown: roughly **$30-45/month** (or near $0 for the first 12
months on a new AWS account's free tier for EC2 and RDS).
