// HTTP client functions for the ConsTrack API — thin wrappers around fetch with auth headers.
import type { ComparisonRun } from "./types";

export type ApiConfig = {
  projectId?: string;
};

const API_BASE = import.meta.env.VITE_API_BASE || '';
/**
 * Generic API wrapper function.
 * Handles authentication headers, error parsing, and auto-logout on 401.
 * 
 * @param path - API endpoint path (e.g. "/api/projects").
 * @param init - Fetch options.
 * @returns {Promise<T>} Typed response data.
 */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("constrack_token");
  const headers: Record<string, string> = {
    'ngrok-skip-browser-warning': 'true',
    ...(init?.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fullPath = API_BASE + path;
  const res = await fetch(fullPath, {
    ...init,
    headers,
  });
  const txt = await res.text();
  let json: any = null;
  if (txt) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json") || txt.trim().startsWith("{") || txt.trim().startsWith("[")) {
      try {
        json = JSON.parse(txt);
      } catch {
        json = null;
      }
    }
  }

  // Handle authentication errors
  if (res.status === 401 || res.status === 403) {
    // Don't redirect if we're already on auth pages
    const currentPath = window.location.pathname;
    if (currentPath.startsWith('/login') || currentPath.startsWith('/register') || currentPath.startsWith('/forgot-password')) {
      throw new Error(json?.error || "Authentication required");
    }

    // Token is invalid or expired, clear auth data
    localStorage.removeItem("constrack_token");
    localStorage.removeItem("constrack_user");
    window.location.href = "/login";
    throw new Error("Authentication required");
  }

  if (!res.ok) {
    const msg = json?.error || res.statusText || "Request failed";
    throw new Error(msg);
  }
  return json as T;
}
/**
 * Fetches the list of projects for the current user.
 */
export type ProjectSummary = {
  id: string;
  name: string;
  createdAtISO: string;
  description?: string;
  startDateISO?: string;
  targetFinishDateISO?: string;
  overallProgressPct: number;
  lastActivityISO: string;
  scanCount: number;
  zoneCount: number;
};

export async function fetchProjects() {
  return api<ProjectSummary[]>("/api/projects");
}

export async function createProject(data: {
  name: string;
  description?: string;
  startDateISO?: string;
  targetFinishDateISO?: string;
}) {
  return api<ProjectSummary>("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateProject(
  id: string,
  data: { name?: string; description?: string; startDateISO?: string; targetFinishDateISO?: string }
) {
  return api<ProjectSummary>(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string) {
  return api(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
}
/**
 * Fetches all zones for a given project.
 */
export async function fetchZones(projectId: string) {
  return api<
    {
      id: string;
      projectId: string;
      name: string;
      type: string;
      parentId?: string;
      completionPct: number;
      linkedScanIds?: string[];
    }[]
  >(`/api/zones?projectId=${encodeURIComponent(projectId)}`);
}

export async function createZone(projectId: string, body: { name: string; type: string; parentId?: string }) {
  return api<{ id: string; projectId: string; name: string; type: string; parentId?: string; completionPct: number }>(`/api/zones`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, ...body }),
  });
}

export async function patchZone(id: string, body: { name?: string; completionPct?: number }) {
  return api(`/api/zones/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function patchZoneLinks(id: string, linkedScanIds: string[]) {
  return api(`/api/zones/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ linkedScanIds }),
  });
}

export async function deleteZone(id: string) {
  return api(`/api/zones/${encodeURIComponent(id)}`, { method: "DELETE" });
}
/**
 * Fetches all scans associated with a project.
 */
export async function fetchScans(projectId: string) {
  return api<{ id: string; name: string; sizeBytes: number; capturedAtISO: string; uploadedAtISO: string; notes?: string }[]>(
    `/api/scans?projectId=${encodeURIComponent(projectId)}`
  );
}
/**
 * Uploads a new point cloud scan file.
 * Uses FormData to handle the file upload.
 */
export async function uploadScan(projectId: string, file: File, capturedAtISO: string, notes?: string, zoneId?: string) {
  const fd = new FormData();
  fd.append("projectId", projectId);
  fd.append("capturedAtISO", capturedAtISO);
  if (notes) fd.append("notes", notes);
  if (zoneId) fd.append("zoneId", zoneId);
  fd.append("file", file);

  const token = localStorage.getItem("constrack_token");
  const headers: Record<string, string> = {
    'ngrok-skip-browser-warning': 'true',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/api/scans/upload`, {
    method: "POST",
    body: fd,
    headers
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || res.statusText);
  return json as { id: string; name: string; sizeBytes: number; capturedAtISO: string; uploadedAtISO: string; notes?: string };
}

export async function deleteScan(id: string) {
  return api(`/api/scans/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchRuns(projectId: string): Promise<ComparisonRun[]> {
  return api<ComparisonRun[]>(`/api/runs?projectId=${encodeURIComponent(projectId)}`);
}
/**
 * Triggers a new volume comparison run between two scans.
 */
export async function createRun(
  projectId: string,
  t1ScanId: string,
  t2ScanId: string,
  voxelSize?: number,
  targetVolumeM3?: number,
): Promise<{ id: string; status: string }> {
  return api<{ id: string; status: string }>(`/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      t1ScanId,
      t2ScanId,
      voxelSize,
      ...(targetVolumeM3 !== undefined ? { targetVolumeM3 } : {}),
    }),
  });
}

export async function fetchDashboard(projectId: string) {
  return api<{ overallProgressPct?: number; volumeChangeM3?: number; forecastCompletionISO: string; productivityIndex?: number; series: { t: string; progressPct: number }[] }>(
    `/api/dashboard?projectId=${encodeURIComponent(projectId)}`
  );
}

export async function fetchReports(projectId: string) {
  return api<any[]>(`/api/reports?projectId=${encodeURIComponent(projectId)}`);
}

export async function createReport(projectId: string, runId: string) {
  return api<any>(`/api/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, runId }),
  });
}

export async function deleteReport(id: string) {
  return api(`/api/reports/${encodeURIComponent(id)}`, { method: "DELETE" });
}
/**
 * Downloads a report file (PDF / Excel) from the backend.
 * Report URLs are backend paths ("/downloads/reports/..."), so a plain <a href> resolves against
 * the frontend host and lands on the SPA's 404. A direct link to the ngrok host can't send the
 * header that skips its browser warning page either, so fetch the file and save it as a blob.
 */
export async function downloadReportFile(url: string) {
  const token = localStorage.getItem("constrack_token");
  const headers: Record<string, string> = {
    'ngrok-skip-browser-warning': 'true',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(API_BASE + url, { headers });
  if (res.status === 404) throw new Error("Report file not found on the server");
  // An HTML response means we hit a web page (SPA fallback, ngrok notice) instead of the file
  if (!res.ok || res.headers.get("content-type")?.includes("text/html")) {
    throw new Error(res.statusText || "Download failed");
  }

  const blobUrl = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = url.split("/").pop() || "report";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export async function chat(prompt: string) {
  return api<{ reply: string }>(`/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
}

export async function fetchRecommendations(projectId: string) {
  return api<{ recommendations: string[] }>(`/api/recommendations?projectId=${encodeURIComponent(projectId)}`);
}

export async function syncSchedule(
  projectId: string,
  provider: "msproject" | "primavera",
  token: string
) {
  return api<{
    provider: string;
    status: string;
    fetchedAtISO: string;
    tasks: {
      id: string;
      providerId: string;
      name: string;
      start: string;
      finish: string;
      progressPct: number;
      owner: string;
      critical: boolean;
    }[];
  }>(`/api/schedule/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, provider, token }),
  });
}

export async function fetchWorkDiary(projectId: string) {
  return api<{ entries: { id: string; projectId: string; dateISO: string; crew: string; summary: string }[] }>(
    `/api/work-diary?projectId=${encodeURIComponent(projectId)}`
  );
}
