# Skorskal © by MrDhameri — exam-only OMR scanner

Skorskal is an installable mobile OMR marking app. Attendance and class register handoff belong exclusively to SMADBOD Guest/Master.

## Access without a code

There is no staff roster access phrase or attendance login in Skorskal. The scan saves pupils by the six-row shaded **year, class, examinee number, and subject code**, and the examiner can type a pupil name from the paper (optional). If that examinee number was previously marked on the same device, the saved name can be reused.

**Privacy and roster limitation:** the private official 2026 roster remains encrypted in the repository and is not unlocked or exposed by Skorskal. The Pupils tab and XLSX export show only exam records saved on the current device, **not all pupils on the official 2026 school list**. To match complete private rosters without staff passphrases, a secure authenticated school backend would be needed; never put all pupil names or a decryption key in publicly served JavaScript.

## Workflow

1. Save 20 or 40 question answer keys, grouped by year and subject.
2. Scan an A4 four-anchor OMR sheet; review its shaded ID, answers and optional pupil name.
3. Save the result; select Next pupil without losing the answer scheme.
4. Browse locally marked pupils by year/class or export CSV, marked-pupil XLSX and JSON backup.

## Android APK updates

Both the Skorskal webapp and APK load the same website code after it is published. The native Android app checks the controlled GitHub Release tag `android-latest` for an APK version update and requests installation confirmation; the website alone cannot silently update the APK. Release packaging and signing require a successful GitHub Actions build with the original publisher signing certificate.

[Website](https://mohammaddhameri-blip.github.io/skorskal-omr/) · [Official APK releases](https://github.com/mohammaddhameri-blip/skorskal-omr/releases/tag/android-latest)

© Skorskal by MrDhameri. All rights reserved.
