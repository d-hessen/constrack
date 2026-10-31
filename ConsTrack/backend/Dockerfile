# ConsTrack backend image: Express (Node 22) + Python 3.11 point-cloud pipeline.
#
# Layout inside the container mirrors backend/ on disk, because the code
# resolves paths relative to it:
#   /app/dist/...          compiled TypeScript  (node dist/index.js)
#   /app/python/*.py       pipeline scripts      (services/python.ts → cwd/python)
#   /app/src/reports.py    PDF/XLSX generator    (reporting.ts → cwd/src)
#   /app/uploads/          scans + uploads/runs  (mounted volume)
#   /app/reports/          generated reports     (mounted volume)

# ── Stage 1: compile TypeScript and collect production node_modules ─────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json && npm prune --omit=dev

# ── Stage 2: runtime (Python base + Node binary copied in) ──────────────────
FROM python:3.11-slim-bookworm

# Shared libraries that the Open3D wheel loads at import time.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libgl1 libgomp1 libglib2.0-0 libusb-1.0-0 libx11-6 libstdc++6 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

# Python deps first so this heavy layer is cached across code changes.
COPY python/requirements.txt python/requirements.txt
RUN pip install --no-cache-dir -r python/requirements.txt

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY python ./python
COPY src/reports.py ./src/reports.py
COPY scripts ./scripts

ENV NODE_ENV=production \
    PORT=4000 \
    PYTHON_PATH=/usr/local/bin/python3 \
    PYTHONUNBUFFERED=1 \
    MPLCONFIGDIR=/tmp/matplotlib

RUN mkdir -p uploads/runs reports

EXPOSE 4000
CMD ["node", "dist/index.js"]
