# Deploying the ConsTrack backend to AWS Lightsail

The frontend stays on Vercel. The backend and its database move from the Windows PC + ngrok onto one
AWS Lightsail instance (**Xlarge-16GB**: 4 vCPU, 16 GB RAM, 320 GB SSD, $84/month flat) running three
Docker containers:

```
Browser ──HTTPS──► Vercel (React)
   │
   └──HTTPS / WSS──► Lightsail instance
                       ├─ caddy    :80/:443  automatic HTTPS certificate
                       ├─ backend  :4000     Express + WebSocket + Python pipeline
                       └─ mongo    :27017    database (not reachable from the internet)
                       data/  ← uploads, reports, database files
```

There's no domain, so the backend address is a free **sslip.io** hostname built from the server IP:
`203.0.113.10` → `https://203-0-113-10.sslip.io`. Caddy gets a real Let's Encrypt certificate for it.
That's why step 1 gives the server a **static IP**: if the IP changed, the address would change with it.

Commands marked **PC** run in PowerShell on Windows. Commands marked **server** run over SSH.
The example IP throughout is `203.0.113.10`; replace it with yours.

---

## 1. Create the instance (lightsail.aws.amazon.com)

Use the AWS account the college pays for. Lightsail bills a fixed monthly price, with no usage surprises.

1. Click **Create instance**:
   - **Region:** Frankfurt (eu-central-1), the closest Lightsail region to Israel
   - **Platform:** Linux/Unix → **OS Only** → **Ubuntu 24.04 LTS**
   - **SSH key pair:** keep the default key for the region, then click **Download** and save the
     `.pem` file to `C:\Users\Daniil Hessen\.ssh\` (for example as `lightsail-frankfurt.pem`)
   - **Automatic snapshots:** turn on. Lightsail takes a daily snapshot of the whole disk and keeps the last 7.
     Snapshot storage is billed separately, a few dollars a month.
   - **Network type:** Dual-stack (IPv4 + IPv6)
   - **Plan:** General purpose → **$84 — 16 GB RAM, 4 vCPUs, 320 GB SSD**
   - **Name:** `constrack`
2. **Static IP.** Go to **Networking → Create static IP** and attach it to `constrack`. It's free while
   it's attached. Write the IP down.
3. **Firewall.** Open the instance's **Networking** tab. Under both the IPv4 and IPv6 firewalls, keep
   SSH (22) and HTTP (80) and **add HTTPS (443)**.

## 2. Connect and prepare the server

**PC** — let only you read the key (once), then connect:
```powershell
icacls "$HOME\.ssh\lightsail-frankfurt.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"
ssh -i "$HOME\.ssh\lightsail-frankfurt.pem" ubuntu@203.0.113.10
```
The login user is `ubuntu`, not `root`. Use `sudo` for system commands. The browser-based
**Connect using SSH** button in Lightsail works too.

**server:**
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh       # Docker + compose plugin
sudo usermod -aG docker ubuntu                    # use docker without sudo

# 8 GB swap: a safety net so a huge scan slows down instead of getting killed
sudo fallocate -l 8G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

sudo timedatectl set-timezone Asia/Jerusalem
exit                                              # log out so the docker group takes effect
```
Then connect again with the same `ssh` command.

## 3. Get the code onto the server

**server:**
```bash
cd ~
git clone https://github.com/<owner>/<repo>.git ConsTrack
cd ConsTrack
mkdir -p data/uploads data/reports data/mongo     # owned by "ubuntu", so scp can write into them later
```
If the repo is private, GitHub asks for a password. Use a **fine-grained personal access token** with
read-only access to this one repo (GitHub → Settings → Developer settings), not your real password.

## 4. Settings and secrets

**PC** — copy your backend `.env` to the server:
```powershell
scp -i "$HOME\.ssh\lightsail-frankfurt.pem" "C:\Users\Daniil Hessen\Documents\Braude\ConsTrack\constrack\ConsTrack\backend\.env" ubuntu@203.0.113.10:~/ConsTrack/backend/.env
```

**server:**
```bash
cd ~/ConsTrack

# 1) Production JWT secret. The current one is the "your-secret-key" placeholder.
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" backend/.env

# 2) Server-level settings
cp deploy/server.env.example .env
nano .env        # DOMAIN=203-0-113-10.sslip.io   CORS_ORIGIN=https://<your-app>.vercel.app
```
`MONGODB_URI`, `PYTHON_PATH` and `PORT` in `backend/.env` are ignored on the server.
`docker-compose.yml` overrides them, so you don't need to edit them.

> Changing JWT_SECRET logs everyone out once. They just log in again.

## 5. Start everything

**server:**
```bash
docker compose up -d --build        # first build takes ~5–10 min (Open3D is big)
docker compose ps                   # all three should be "running"
docker compose logs -f backend      # expect "Backend listening on http://localhost:4000" (Ctrl+C to exit)
curl https://203-0-113-10.sslip.io/api/health      # → {"ok":true}
```
If the health check fails with a certificate error, run `docker compose logs caddy`. The usual cause is
that port 443 isn't open in the Lightsail firewall (step 1.3).

## 6. Move the existing data (optional — skip to start with an empty system)

### 6a. Database
**PC** — install the free **MongoDB Database Tools** (mongodb.com → Tools → Database Tools), then:
```powershell
cd $HOME\Desktop
mongodump --uri "mongodb://127.0.0.1:27017/constrack" --archive=constrack.archive --gzip
scp -i "$HOME\.ssh\lightsail-frankfurt.pem" constrack.archive ubuntu@203.0.113.10:~/
```
**server:**
```bash
cd ~/ConsTrack
docker compose exec -T mongo mongorestore --archive --gzip --drop < ~/constrack.archive
```

### 6b. Scan files and reports
**PC:**
```powershell
cd "C:\Users\Daniil Hessen\Documents\Braude\ConsTrack\constrack\ConsTrack\backend"
scp -i "$HOME\.ssh\lightsail-frankfurt.pem" -r uploads ubuntu@203.0.113.10:~/ConsTrack/data/
scp -i "$HOME\.ssh\lightsail-frankfurt.pem" -r reports ubuntu@203.0.113.10:~/ConsTrack/data/
```

### 6c. Fix the file paths stored in the database
Scans and reports store full Windows paths (`C:\Users\...\uploads\room1.ply`). This rewrites them to
the server's paths:
```bash
docker compose exec backend node scripts/migrate-paths.mjs           # dry run: shows what changes
docker compose exec backend node scripts/migrate-paths.mjs --apply   # actually writes
```

## 7. Point the frontend at the new backend

Vercel → your project → **Settings → Environment Variables**:

| Name | Value | Environment |
|---|---|---|
| `VITE_API_BASE` | `https://203-0-113-10.sslip.io` | Production (and Preview if you use it) |

Then go to **Deployments → ⋯ → Redeploy**. Vite bakes env vars in at build time, so you need a
redeploy. Open the site and test: log in, upload a scan, run a comparison, download a report.

Once that works, **stop ngrok** on the PC.

---

## Day-to-day

| Task | Command (server, in `~/ConsTrack`) |
|---|---|
| Deploy new code | `git pull && docker compose up -d --build` |
| Watch backend logs (incl. Python progress) | `docker compose logs -f backend` |
| Restart | `docker compose restart backend` |
| Disk usage | `df -h /` and `du -sh data/*` |
| Manual DB backup | `docker compose exec -T mongo mongodump --archive --gzip > ~/db-$(date +%F).archive` |
| Server/OS updates | `sudo apt update && sudo apt upgrade -y` (reboot if asked; containers start by themselves) |

The containers restart automatically after a crash or a server reboot (`restart: unless-stopped`).
To restore from a snapshot, use the Lightsail console: Snapshots → create a new instance from the
snapshot, then move the static IP to it. The sslip.io address stays the same.

## Local development after the move

Your PC still runs its own MongoDB at `127.0.0.1`, so local development keeps working as before.
It's a separate copy, though: projects you create locally don't appear on the server, and the other
way round.
