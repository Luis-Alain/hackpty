# Synthetic chart-review records (SYNTHETIC CHART A)

SYNTHETIC data only. NOT A REAL PATIENT. No real person, clinic or clinician is
described here, and nothing in this directory may be used as clinical advice.

## Files

| File | Role | Visit date | Encounter |
| --- | --- | --- | --- |
| `SYN-CR-A-2026-06-12.txt` | previous visit (historical approved record) | 2026-06-12 | ENC-SYN-A-2026-06-12 |
| `SYN-CR-A-2026-09-09.txt` | current reviewed source | 2026-09-09 | ENC-SYN-A-2026-09-09 |

Patient: `SYNTHETIC CHART A`, `patientId` `SYN-CHART-A`. General outpatient
English documentation (blood pressure, sleep, headaches, allergy medication).
No psychiatric, crisis or safeguarding content.

## Conventions

- First line of every record is exactly
  `SYNTHETIC OUTPATIENT NOTE - NOT A REAL PATIENT`.
- Plain ASCII, LF line endings, no tabs, 18 short lines each, one printed page.
- Dates are ISO 8601 (`YYYY-MM-DD`) so date reasoning is scoreable.
- Records are the reading material for a human reviewer and the seed content for
  `../../suite/dev-v1.json` and `../../suite/draft-v1.json`. The suite cases are
  self-contained (their texts are inline), so scoring never reads these files and
  never touches the vault.

## Documentation features these two records deliberately contain

These are the phenomena the suite scores; each is planted once so a reviewer can
confirm the gold facts by reading the two pages side by side.

| Feature | Where |
| --- | --- |
| Explicit changed fact | blood pressure 148/92 -> 132/84 mmHg; weight 84.0 -> 82.6 kg |
| Denied symptom (negation) | "Denies dizziness." in both records |
| Newly denied symptom | "Denies chest pain." current record only |
| Missing versus negative | "sleep-related breathing assessment not performed" (never assessed, not ruled out) |
| Not reassessed | "snoring not reassessed" at the current visit |
| Informant attribution | 2026-06-12 snoring is reported by the spouse, not by the patient |
| Medication continued | amlodipine 5 mg once daily in both records |
| Medication stopped, reason unknown | cetirizine stopped in July 2026, "reason for stopping not documented" |
| Missing dose | cetirizine on 2026-06-12, "dose not documented" |
| Provisional wording | "possibly related to ... ; cause not established" in both records |
| Date-anchored resolution | "no headaches since 2026-07-01" |

## Hard rules that apply to anything added here

1. Every record and every fixture text carries `SYNTHETIC` and `NOT A REAL PATIENT`.
2. No real names, no real clinics, no psychiatric or crisis content.
3. Never claim a suite result that has not been measured; a failed or partial run
   is still recorded as a run.
