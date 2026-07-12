<h1 id="constrack">ConsTrack</h1>
<p><strong>Construction progress tracking from 3D point cloud scans.</strong></p>
<p>ConsTrack lets construction crews scan a site with LiDAR or photogrammetry at two points in time (t₁ = earlier, t₂ = later) and automatically measures how much work has actually been done. The backend computes the volume change between the two scans, and a dashboard turns that into an overall progress percentage, a forecasted completion date, and alerts for zones that are falling behind schedule.</p>
<h2 id="key-features">Key Features</h2>
<ul>
<li><strong>Scan upload &amp; comparison</strong> — upload <code>.las</code>, <code>.laz</code>, <code>.ply</code>, <code>.e57</code> point cloud scans and pair them up as t₁/t₂ snapshots of a zone.</li>
<li><strong>Automatic volume-diff computation</strong> — Python (Open3D, laspy, NumPy) crunches the point clouds to compute volume change between scans.</li>
<li><strong>3D point cloud viewer</strong> — explore scans directly in the browser using Three.js/WebGL.</li>
<li><strong>Progress dashboard</strong> — overall completion %, confidence rating, and a forecasted completion date extrapolated from current progress.</li>
<li><strong>Zone/area hierarchy</strong> — track progress per zone (floor, wall, etc.) with parent/child relationships, and flag lagging zones.</li>
<li><strong>Reports</strong> — generate downloadable PDF and Excel progress reports.</li>
<li><strong>Real-time updates</strong> — a WebSocket connection pushes updates to every connected browser tab when a computation finishes, no manual refresh needed.</li>
<li><strong>AI chat &amp; recommendations</strong> — ask questions about project progress via a Gemini-powered chat assistant.</li>
<li><strong>Schedule sync &amp; work diary</strong> — track planned vs. actual work over time.</li>
<li><strong>Authentication</strong> — JWT-based auth with email-based password reset (via Brevo).</li>
</ul>
<h2 id="tech-stack">Tech Stack</h2>
<p><strong>Frontend</strong> (<code>src/</code>)</p>
<ul>
<li>React 19 + TypeScript</li>
<li>Vite 7 (dev server + build)</li>
<li>React Router 7</li>
<li>Tailwind CSS 4</li>
<li>Three.js (3D point cloud rendering)</li>
</ul>
<p><strong>Backend</strong> (<code>backend/</code>)</p>
<ul>
<li>Express + TypeScript (run via <code>tsx</code>)</li>
<li>MongoDB + Mongoose</li>
<li>JWT auth (<code>jsonwebtoken</code>, <code>bcrypt</code>)</li>
<li>File uploads (<code>multer</code>)</li>
<li>WebSockets (<code>ws</code>) for real-time updates</li>
<li>Report generation (<code>pdfkit</code>, <code>exceljs</code>)</li>
<li>Transactional email (<code>@getbrevo/brevo</code>)</li>
<li>Gemini API for AI chat/recommendations</li>
</ul>
<p><strong>Point cloud processing</strong> (<code>backend/python/</code>)</p>
<ul>
<li>Open3D, laspy, pye57, lazrs — point cloud parsing and volume computation</li>
<li>NumPy, SciPy, scikit-learn — numerical processing</li>
<li>ReportLab, openpyxl, Matplotlib — report generation support</li>
</ul>
<p>The Node.js backend cannot do 3D point cloud math itself, so it spawns these Python scripts as child processes and reads back JSON results.</p>
<h2 id="project-structure">Project Structure</h2>
<pre><code>ConsTrack/
├── src/            <span class="hljs-meta"># Frontend (React + Vite)</span>
├── backend/        <span class="hljs-meta"># Backend (Express + MongoDB + Python scripts)</span>
├── docs/           <span class="hljs-meta"># Deep-dive architecture documentation</span>
└── <span class="hljs-keyword">public</span>/         <span class="hljs-meta"># Static frontend assets</span>
</code></pre><h2 id="prerequisites">Prerequisites</h2>
<ul>
<li><a href="https://nodejs.org/">Node.js</a> 18+ and npm</li>
<li><a href="https://www.mongodb.com/">MongoDB</a> (local instance or Atlas connection string)</li>
<li>Python 3 + pip</li>
</ul>
<h2 id="getting-started">Getting Started</h2>
<h3 id="1-clone-and-install-dependencies">1. Clone and install dependencies</h3>
<pre><code class="lang-bash">git <span class="hljs-built_in">clone</span> &lt;repo-url&gt;
<span class="hljs-built_in">cd</span> ConsTrack

<span class="hljs-comment"># Frontend</span>
npm install

<span class="hljs-comment"># Backend</span>
<span class="hljs-built_in">cd</span> backend
npm install
<span class="hljs-built_in">cd</span> ..
</code></pre>
<h3 id="2-install-python-dependencies">2. Install Python dependencies</h3>
<pre><code class="lang-bash">pip install -r backend<span class="hljs-regexp">/python/</span>requirements.txt
</code></pre>
<p>(This also happens automatically as part of <code>npm run build</code> in the backend, but for local development it needs to be installed up front.)</p>
<h3 id="3-configure-environment-variables">3. Configure environment variables</h3>
<p>Create <code>backend/.env</code>:</p>
<pre><code class="lang-env"><span class="hljs-attr">MONGODB_URI</span>=mongodb://localhost:<span class="hljs-number">27017</span>/constrack
<span class="hljs-attr">JWT_SECRET</span>=your-secret-key
<span class="hljs-attr">BREVO_API_KEY</span>=your-brevo-key
<span class="hljs-attr">FROM_EMAIL</span>=noreply@example.com
<span class="hljs-attr">FROM_NAME</span>=ConsTrack
<span class="hljs-attr">GEMINI_API_KEY</span>=your-gemini-key
<span class="hljs-attr">UPLOAD_DIR</span>=./uploads
<span class="hljs-attr">REPORTS_DIR</span>=./downloads/reports
<span class="hljs-attr">PYTHON_PATH</span>=python
<span class="hljs-attr">PORT</span>=<span class="hljs-number">4000</span>
</code></pre>
<table>
<thead>
<tr>
<th>Variable</th>
<th>Purpose</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>MONGODB_URI</code></td>
<td>MongoDB connection string</td>
</tr>
<tr>
<td><code>JWT_SECRET</code></td>
<td>Secret used to sign/verify auth tokens</td>
</tr>
<tr>
<td><code>BREVO_API_KEY</code></td>
<td>Brevo (Sendinblue) API key for sending password-reset emails</td>
</tr>
<tr>
<td><code>FROM_EMAIL</code> / <code>FROM_NAME</code></td>
<td>Sender identity for outgoing emails</td>
</tr>
<tr>
<td><code>GEMINI_API_KEY</code></td>
<td>API key for the Gemini-powered chat/recommendations feature</td>
</tr>
<tr>
<td><code>UPLOAD_DIR</code></td>
<td>Where uploaded scan files are stored on disk</td>
</tr>
<tr>
<td><code>REPORTS_DIR</code></td>
<td>Where generated PDF/Excel reports are stored on disk</td>
</tr>
<tr>
<td><code>PYTHON_PATH</code></td>
<td>Path to the Python interpreter used to run the point cloud scripts</td>
</tr>
<tr>
<td><code>PORT</code></td>
<td>Port the backend server listens on</td>
</tr>
</tbody>
</table>
<p>The frontend talks to the backend through Vite&#39;s dev proxy, so no extra <code>.env</code> is required for local development. If you need to point it elsewhere, set <code>VITE_API_URL</code>.</p>
<h2 id="running-locally">Running Locally</h2>
<p>Run the backend and frontend in two separate terminals:</p>
<pre><code class="lang-bash"><span class="hljs-comment"># Terminal 1 — backend (http://localhost:4000)</span>
cd backend
npm <span class="hljs-keyword">run</span><span class="bash"> dev
</span>
<span class="hljs-comment"># Terminal 2 — frontend (http://localhost:5173)</span>
npm <span class="hljs-keyword">run</span><span class="bash"> dev</span>
</code></pre>
<p>Open <code>http://localhost:5173</code> in your browser.</p>
<h2 id="building-for-production">Building for Production</h2>
<pre><code class="lang-bash"><span class="hljs-comment"># Frontend</span>
npm <span class="hljs-keyword">run</span><span class="bash"> build
</span>
<span class="hljs-comment"># Backend</span>
cd backend
npm <span class="hljs-keyword">run</span><span class="bash"> build
</span>npm start
</code></pre>
<h2 id="deployment">Deployment</h2>
<p>A <code>vercel.json</code> is included to deploy the frontend as a single-page app on Vercel (all routes rewrite to <code>index.html</code>). The backend is a standalone Express server and needs to be hosted separately (e.g. a Node host with MongoDB access and a Python runtime available for the point cloud scripts).</p>
<h2 id="license">License</h2>
<p>Proprietary — All rights reserved. This project is not currently licensed for public use, modification, or distribution.</p>
