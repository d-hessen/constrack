import { useEffect, useState } from "react";
import { Card } from "../../components/ui/Card";
import { useAppData } from "../../app/data/useAppData";
import { downloadReportFile } from "../../app/data/api";
import { formatDate } from "../../app/format";

export function ReportsPage() {
  const { reports, deleteReport, refreshReports } = useAppData();
  const [downloading, setDownloading] = useState<string | null>(null); // url of the file being fetched
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => { 
    void refreshReports(); 
  }, []);

  async function download(url: string) {
    setDownloading(url);
    setDownloadError(null);
    try {
      await downloadReportFile(url);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-semibold">Reports</div>
        <div className="text-sm muted">
          Reports are generated automatically after each comparison run.
        </div>
      </div>

      <Card 
        title="Report history" 
        subtitle={`${reports.length} report${reports.length !== 1 ? "s" : ""}`}
      >
        {downloadError && (
          <div className="text-xs text-red-400 mb-2">{downloadError}</div>
        )}
        {reports.length === 0 ? (
          <div className="text-sm muted">No reports yet. Run a comparison to generate one.</div>
        ) : (
          <div className="divide-y divide-app">
            {reports.map((r) => (
              <div 
                key={r.id} 
                className="flex flex-col sm:flex-row sm:items-center justify-between py-4 gap-3"
              >
                {/* תצוגת התאריך */}
                <div className="text-sm font-medium">
                  Report — {formatDate(r.createdAtISO)}
                </div>
                
                {/* אזור הכפתורים - מתאים את עצמו למסך ומסדר את הכפתורים בצורה בטוחה */}
                <div className="flex flex-wrap gap-2 shrink-0 justify-start sm:justify-end">
                  <button
                    className="rounded-lg border border-app px-3 py-1.5 text-xs bg-app hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={downloading === r.pdfUrl}
                    onClick={() => void download(r.pdfUrl)}
                  >
                    {downloading === r.pdfUrl ? "Downloading…" : "Download PDF"}
                  </button>
                  <button
                    className="rounded-lg border border-app px-3 py-1.5 text-xs bg-app hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={downloading === r.xlsxUrl}
                    onClick={() => void download(r.xlsxUrl)}
                  >
                    {downloading === r.xlsxUrl ? "Downloading…" : "Download Excel"}
                  </button>
                  <button
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                    onClick={() => void deleteReport(r.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}