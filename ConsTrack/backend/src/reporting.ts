import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RunDoc, ZoneDoc } from "./models.js";

const execFileAsync = promisify(execFile);

export type ReportPaths = { pdfPath: string; xlsxPath: string };


export type ZoneRunSummary = {
  zoneId: string;
  name: string;
  type: string;
  hasData: boolean;
  volumeT1M3?: number;
  volumeT2M3?: number;
  volumeChangeM3?: number;
  runCreatedAtISO?: string;
};

export async function generateReportFiles(opts: {
  outDir: string;
  projectName: string;
  run: RunDoc;
  zones: ZoneDoc[];
  /** Per-zone volume data resolved from each zone's own linked-scan Run (see routes/reports.ts).
   *  Lets reports.py show real per-zone numbers instead of a flat site-wide split. */
  zoneRuns?: ZoneRunSummary[];
  /** Name of the zone that the headline run's own scan pair belongs to — lets the report
   *  label the top KPI cards (Overall Progress / Net Volume Change) with which floor/zone
   *  they actually describe, instead of leaving that ambiguous. */
  headlineZoneName?: string;
  t1ScanDate: string; 
  t2ScanDate: string;
  targetVolumeM3: number;
}): Promise<ReportPaths> {
  console.log("[DEBUG 1] Entering generateReportFiles...");
  console.log(`[DEBUG 2.5] Forwarding to Python -> T1 Date: ${opts.t1ScanDate}, T2 Date: ${opts.t2ScanDate}`);
  console.log(`[DEBUG 2.6] Forwarding to Python -> Target Volume: ${opts.targetVolumeM3} m3`);
  console.log(`[DEBUG 2.7] Forwarding to Python -> zoneRuns count: ${opts.zoneRuns?.length ?? 0}`);
  
  fs.mkdirSync(opts.outDir, { recursive: true });
  const ts = Date.now();
  const pdfPath = path.join(opts.outDir, `report_${opts.run.projectId}_${ts}.pdf`);
  const xlsxPath = path.join(opts.outDir, `report_${opts.run.projectId}_${ts}.xlsx`);

  console.log("[DEBUG 2] Calculated paths:", { pdfPath, xlsxPath });

  const payload = {
    outDir: opts.outDir,
    projectName: opts.projectName,
    run: opts.run,
    zones: opts.zones,
    zoneRuns: opts.zoneRuns ?? [],
    headlineZoneName: opts.headlineZoneName ?? "Unknown Zone",
    pdfPath,
    xlsxPath,
    t1ScanDate: opts.t1ScanDate, 
    t2ScanDate: opts.t2ScanDate,
    targetVolumeM3: opts.targetVolumeM3
  };

  const scriptDirectory = path.join(process.cwd(), "src");
  const scriptName = "reports.py"; 

  console.log("[DEBUG 3] Script directory location:", scriptDirectory);
  console.log("[DEBUG 3.5] Looking for file name:", scriptName);

  try {
    console.log("[DEBUG 4] Executing Python process...");
    

    const pyBinRaw = process.env.PYTHON_PATH || "python";
    // Resolve relative paths from the backend root (process.cwd()) so execFile finds the
    // binary even when cwd is changed to scriptDirectory below.
    const pyBin = path.isAbsolute(pyBinRaw) ? pyBinRaw : path.resolve(process.cwd(), pyBinRaw);
    const { stdout, stderr } = await execFileAsync(pyBin, [scriptName, JSON.stringify(payload)], {
      cwd: scriptDirectory
    });
    
    console.log("[DEBUG 5] Python executed successfully!");
    console.log("[DEBUG Python stdout]:", stdout);
    if (stderr) console.log("[DEBUG Python stderr]:", stderr);

  } catch (error: any) {
    console.error("!!! [DEBUG ERROR] Python execution failed !!!");
    console.error("Error Message:", error.message);
    console.error("Python Stderr:", error.stderr);
    console.error("Python Stdout:", error.stdout);
    throw new Error(`Python generation failed: ${error.message}`);
  }

  return { pdfPath, xlsxPath };
}