# Skorskal © by MrDhameri — Official 2026 OMR Exam Scanner

Skorskal is an installable, offline-capable A4 OMR scanner for 20-question or 40-question answer keys, using one standardized 40-bubble A4 sheet (four black registration anchors, six-digit shaded pupil/subject ID).

## Pupils — read-only official 2026 roster

Pupil names come from the **publisher-managed 2026 school roster** only. The file `roster-2026.json` contains **encrypted** records; names are not stored in public source code. Authorised staff unlock the roster using the staff access phrase supplied privately by the publisher. The roster is displayed on both the webapp and Android APK.

The **Pupils** tab provides a **read-only exam candidate list** filtered by Year (1–6) and Class (Cemerlang, Gemilang, Terbilang). It does not mark, store, send, or submit attendance. Attendance belongs exclusively to the separate [SMADBOD Guest](https://mohammaddhameri-blip.github.io/smadbod/attendance/index.html) and Master applications.

To update official pupil names, the publisher generates a new encrypted roster file and updates the repository. The webapp fetches it online when available, retaining an offline cache; the Android APK gets roster changes through signed APK updates.

## OMR marking

1. Choose Year and Subject under **Answer keys**, then type/paste 20 or 40 A–D letters. A 20-letter paste populates questions 1–20; 21–40 remain blank and are not graded. Save the key.
2. **Scan** an A4 OMR sheet using camera or an image. Review the ID, pupils' names and detected answers.
3. Save the result. The answer key persists for the next pupil.
4. **Results** keeps local marks, supports CSV/Excel exports, and allows JSON backup/restore of results and answer keys. Backups cannot replace the official pupil roster.

## Android APK — GitHub self-update

The native Android APK checks the controlled GitHub Release tag **`android-latest`** each time the app opens (when online). A manual **↻** update button is also present in the APK header.

If a higher Android `versionCode` is published, Skorskal asks for approval, downloads the official `Skorskal-OMR.apk` and its SHA-256 checksum, validates the download, and invokes Android's system package installer for final approval. Offline use is unaffected when GitHub is unavailable. The application and local data stay intact with normal same-signature in-place upgrades.

The GitHub Actions APK publishing workflow builds a **non-debuggable release APK** and restores its signing certificate from a private Actions cache. It fails safely rather than silently rotating an established signing certificate. **Keep a durable private backup of the signing keystore**: if GitHub discards that cache, future in-place updates cannot be published until the original certificate is restored.

**Important for older test APKs:** previously published `v0.2.0-test` APKs may use a different signing certificate, and Android will not install the newly signed app over them. Back up saved marking results first, then uninstall the old test APK and install the official `android-latest` APK once. Future releases with the same publisher certificate can update in place.

[Official APK releases](https://github.com/mohammaddhameri-blip/skorskal-omr/releases/tag/android-latest) · [APK build workflow](https://github.com/mohammaddhameri-blip/skorskal-omr/actions/workflows/build-android.yml)

## Website

GitHub Pages hosts the site at [mohammaddhameri-blip.github.io/skorskal-omr](https://mohammaddhameri-blip.github.io/skorskal-omr/), with HTTPS for camera access. The webapp and Android app maintain independent **device-local** marking records and attendance; no marks are automatically transmitted to GitHub or elsewhere.

© Skorskal by MrDhameri. All rights reserved.
