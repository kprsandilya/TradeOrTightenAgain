# Deploying Trade or Tighten to AWS

This guide covers:

1. **AWS Amplify Auth (Cognito)** – user login before playing  
2. **Backend on EC2** – NestJS + Socket.IO  
3. **Frontend on AWS** – Amplify Hosting (recommended) or S3 + CloudFront  

---

## 1. Amazon Cognito (Auth)

Users must sign in before joining or creating games when Amplify is configured.

### Create a User Pool

1. In **AWS Console** → **Cognito** → **Create user pool**  
2. **Sign-in options**: choose **Email** (and optionally **Username**).  
3. **Password policy**: e.g. 8+ chars, upper/lower/numbers/symbols.  
4. **MFA**: optional.  
5. **User pool name**: e.g. `trade-or-tighten-users`.  
6. **App integration** → **Create app client**:  
   - App type: **Public client** (no secret).  
   - App client name: e.g. `trade-or-tighten-web`.  
   - No hosted UI required.  
7. Create the pool and note:  
   - **User pool ID** (e.g. `us-east-1_xxxxx`)  
   - **App client id** (e.g. `xxxxxxxxxx`)  
   - **Region** (e.g. `us-east-1`)

### Frontend env (Amplify Auth)

Set these for the frontend (local `.env` or Amplify Hosting env vars):

```env
VITE_AMPLIFY_USER_POOL_ID=us-east-1_xxxxx
VITE_AMPLIFY_USER_POOL_CLIENT_ID=xxxxxxxxxx
VITE_AMPLIFY_REGION=us-east-1
```

If these are **not** set, the app runs without login (e.g. local dev).

---

## 2. Backend on EC2

### 2.1 Launch EC2

- **AMI**: Amazon Linux 2 or Ubuntu 22.04.  
- **Instance type**: e.g. `t3.micro` or `t3.small`.  
- **Security group**:  
  - Inbound: **22** (SSH), **80** (HTTP), **443** (HTTPS).  
  - If you put the app directly on the instance: **3000** (or your `PORT`) for the Node server, or rely on nginx only on 80/443.

### 2.2 Install Node.js and run the app

```bash
# Node 20 (example for Amazon Linux 2)
curl -sL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Or on Ubuntu:
# curl -sL https://deb.nodesource.com/setup_20.x | sudo -E bash -
# sudo apt-get install -y nodejs
```

Clone the repo (or copy the `backend` folder) and install:

```bash
cd /home/ec2-user/TradeOrTightenAgain/backend   # or your path
pnpm install
pnpm run build
```

### 2.3 Environment variables

Create `/home/ec2-user/TradeOrTightenAgain/backend/.env` (or export in the same shell you start the app):

```env
PORT=3000
CORS_ORIGIN=https://your-frontend-domain.com
```

- **PORT**: port the NestJS app listens on (default 3000).  
- **CORS_ORIGIN**: comma-separated list of allowed frontend origins (e.g. Amplify app URL). No value = allow all (dev only).

### 2.4 Run with PM2 (recommended)

```bash
sudo npm install -g pm2
cd /home/ec2-user/TradeOrTightenAgain/backend
pm2 start dist/main.js --name trade-or-tighten-api
pm2 save
pm2 startup   # follow the printed command to enable on boot
```

### 2.5 Reverse proxy (nginx) for HTTPS

Install nginx, then configure a server that proxies to the Node app and (optionally) terminates SSL:

```nginx
# /etc/nginx/conf.d/trade-api.conf
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- Use **Certbot** (Let’s Encrypt) for HTTPS and redirect 80 → 443 if needed.  
- Then set **CORS_ORIGIN** to your frontend URL (e.g. `https://main.xxxxx.amplifyapp.com`).

The frontend must connect to this URL (see **VITE_WS_URL** below).

---

## 3. Frontend on AWS

### Option A: Amplify Hosting (recommended)

The repo includes an **`amplify.yml`** at the root that tells Amplify to build the app in the `frontend/` directory. You do not need to set Root directory manually when this file is present.

1. **Connect repository**  
   - Amplify Console → **New app** → **Host web app** → connect your Git provider and repo.

2. **Build settings**  
   - Amplify will use the existing **`amplify.yml`** (app root: `frontend`, build: `pnpm install` + `pnpm run build`, artifacts: `dist`).  
   - If you override in the Console, use **Build command**: `pnpm install && pnpm run build` and **Output directory**: `dist`; set **Root directory** to `frontend` if using a single-app (non-monorepo) configuration.

3. **Environment variables** (Amplify → App → Environment variables):

   | Name | Value |
   |------|--------|
   | `VITE_AMPLIFY_USER_POOL_ID` | Your Cognito user pool ID |
   | `VITE_AMPLIFY_USER_POOL_CLIENT_ID` | Your Cognito app client ID |
   | `VITE_AMPLIFY_REGION` | e.g. `us-east-1` |
   | `VITE_WS_URL` | Backend URL, e.g. `https://api.yourdomain.com` |

   **Important**: `VITE_WS_URL` must be the **full backend URL** (including `https://`) so the Socket.IO client can connect (HTTP/HTTPS and WebSocket).

4. **Redeploy** after changing env vars.

### Option B: S3 + CloudFront

1. Build the frontend with the same env vars (e.g. in CI or locally with `.env.production`):

   ```bash
   cd frontend
   export VITE_AMPLIFY_USER_POOL_ID=...
   export VITE_AMPLIFY_USER_POOL_CLIENT_ID=...
   export VITE_AMPLIFY_REGION=us-east-1
   export VITE_WS_URL=https://api.yourdomain.com
   pnpm run build
   ```

2. Upload `dist/` to an S3 bucket and enable static website hosting or use CloudFront in front of S3.  
3. Point your domain to CloudFront and use HTTPS.

---

## 4. Environment variable reference

### Backend (EC2 / local)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP port | `3000` |
| `CORS_ORIGIN` | Allowed origins (comma-separated) | (allow all) |

### Frontend (build-time)

| Variable | Description | Required for auth |
|----------|-------------|--------------------|
| `VITE_AMPLIFY_USER_POOL_ID` | Cognito user pool ID | Yes |
| `VITE_AMPLIFY_USER_POOL_CLIENT_ID` | Cognito app client ID | Yes |
| `VITE_AMPLIFY_REGION` | AWS region for Cognito | Yes |
| `VITE_WS_URL` | Backend URL for Socket.IO (e.g. `https://api.example.com`) | Yes in production |

---

## 5. Quick checklist

- [ ] Cognito user pool and app client created; frontend env vars set.  
- [ ] Backend on EC2: Node, build, `PORT` and `CORS_ORIGIN` set, PM2 (or similar) and nginx.  
- [ ] Frontend: `VITE_WS_URL` points to backend URL; build and deploy (Amplify or S3/CloudFront).  
- [ ] CORS allows your frontend origin; WebSocket works (nginx proxy and security group allow 80/443).
