// One-off migration: rewrite file paths stored in MongoDB from the old Windows
// machine (C:\Users\...\backend\uploads\file.ply) to their location inside the
// server container (/app/uploads/file.ply).
//
// Scans and reports store ABSOLUTE paths, so after copying the files to the
// server the database still points at the Windows PC until this is run.
//
// Usage (on the server, after copying the files into ./data):
//   docker compose exec backend node scripts/migrate-paths.mjs           # dry run
//   docker compose exec backend node scripts/migrate-paths.mjs --apply   # write
//
// Only values that look like Windows paths are touched, so running it twice is safe.

import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");

const TARGETS = [
  // collection        fields                                                    new directory
  { coll: "scans",           fields: ["filePath"],                                       dir: "/app/uploads" },
  { coll: "pointcloudscans", fields: ["rawFilePath", "cleanedPlyPath", "alignedPlyPath"], dir: "/app/uploads" },
  { coll: "reports",         fields: ["pdfPath", "xlsxPath"],                            dir: "/app/reports" },
];

const looksWindows = (p) => typeof p === "string" && (/^[A-Za-z]:[\\/]/.test(p) || p.includes("\\"));
const baseName = (p) => p.split(/[\\/]/).pop();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set");
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;
let changed = 0;

for (const { coll, fields, dir } of TARGETS) {
  const docs = await db.collection(coll).find({}).toArray();
  for (const doc of docs) {
    const set = {};
    for (const f of fields) {
      if (looksWindows(doc[f])) set[f] = `${dir}/${baseName(doc[f])}`;
    }
    if (Object.keys(set).length === 0) continue;
    changed++;
    for (const [f, v] of Object.entries(set)) console.log(`${coll} ${doc._id} ${f}: ${doc[f]}  ->  ${v}`);
    if (APPLY) await db.collection(coll).updateOne({ _id: doc._id }, { $set: set });
  }
}

console.log(`\n${changed} document(s) ${APPLY ? "updated" : "would be updated (dry run — add --apply to write)"}.`);
await mongoose.disconnect();
