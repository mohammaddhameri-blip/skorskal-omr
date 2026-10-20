# skorskal — 40-question OMR scanner

Mobile-friendly, installable offline-capable web app for the approved skorskal A4 answer sheet with four black corner anchors, a six-row shaded ID (Year / Class / Examinee tens+ones / Subject tens+ones), a handwritten name line, and 40 A–D questions in two columns.

## Run it

This is a **static website** (no server or API keys required). Host the folder on GitHub Pages or any HTTPS host. For local testing, from inside the extracted folder:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` in your browser. Phone camera access requires HTTPS or localhost; uploading a picture also works.

To enable GitHub Pages, publish the contents of this folder at the repository root, then choose **Settings → Pages → Deploy from a branch**, `main`, `/ (root)`.

## Start marking

1. Go to **Answer keys**. Choose Year and subject code, then tap choices for questions 1–40 or paste 40 answer letters. Save. Keys stay until manually overwritten or cleared by browser storage.
2. Go to **Pupils** and import a roster `.csv` or `.xlsx`, or add pupils manually. CSV column headers should include `Name`, `No`, `Year`, `Class` (synonyms `Nama`, `Bil`, `Tahun`, `Kelas` are accepted). For Excel, sheet names like `5T`, `5 Terbilang`, or full columns for year/class help identify pupils. If no number column exists, the pupil number defaults to the numbered row after the header — review for accuracy.
3. Go to **Scan** and start the camera, upload a photo, or tap **Try sample** to verify the scanner. Ensure the complete four-anchor sheet is visible.
4. Check the pupil ID and answers. Correct mistakes by tapping answer letters. Blank/multiple/uncertain bubbles are scored zero unless corrected by a teacher.
5. **Save this pupil's result**. Tap **Next pupil** and scan another; the key persists. The **Try sample** button uses a temporary 40/40 demo key without changing your saved keys.
6. Go to **Results** to export CSV, update an imported Excel workbook, or back up the device records to JSON.

## Subject codes

`01` Bahasa Melayu and `02` Bahasa Inggeris are confirmed; additional codes `00` and `03`–`10` are proposed and editable in the app's key selection.

## Design / image processing

The scanner requires four black corner anchor squares. It locates large dark square connected components, fits an 8-parameter perspective transform, warps the photo into canonical A4 coordinates, and analyzes darkness inside each printed bubble while excluding the printed outlines. Manual four-corner dragging and 90°/180° rotation controls are available if detection fails. Source image, scores, keys and pupil rosters are not sent to a server.

All scanned results and keys are stored in the browser. Scan images and the imported original workbook are stored in IndexedDB when available; **use Backup JSON and CSV exports regularly**. Clearing browser/site data removes these records. Uploaded Excel workbooks are parsed locally and written back with additional Skorskal columns, preserving existing workbook worksheets and data where supported; for complex or macro-enabled workbooks, keep a backup and review the output.

## Limitations

- Designed for **this exact printable OMR sheet**; do not use a different sheet layout or scale/crop the printed template when copying.
- Requires reasonable focus and lighting; faint erasures and shadows may produce ambiguous readings and require review.
- Does not currently provide automated handwriting OCR, cloud synchronization, teacher login or automatic AI grading for writing tasks.
- On-device records are not synchronized across devices; use exported backups.
- The updated Excel export adds result columns for the latest saved subject per pupil; export CSV retains *all* scanned attempts and subjects.
- PWA installation depends on a supported HTTPS host and browser; APK conversion is a later step.

© skorskal by MrDhameri. All rights reserved.