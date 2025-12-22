# PatientView Audit — UI Stabilization

## Overview (what PatientView does)
- **Data flow**
  - Fetches complex data by token via `complexes.getByToken(token)` and stores it in state (`complex`).
  - Stores completion counts in `sessionStorage` under `exercise_counts`, keyed by `exercise_id`.
  - Submits completion progress to `progress.create`, generating a per-session `session_id` in `sessionStorage`.
- **Render structure**
  - Sticky header with logo, patient name, and instructor name (`.patient-header`).
  - Welcome section, progress overview stats, and session controls.
  - Exercises list where each card renders:
    - Header (badge, title, actions)
    - Video block (optional)
    - Description, params (sets/reps or duration, rest), instructions, contraindications, notes.
  - Contact section and sticky CTA.

Primary files:
- `frontend/src/pages/PatientView.js`
- `frontend/src/pages/PatientView.css`

---

## Problems found (code correctness + UI/UX)

### 1) Exercise header layout inconsistency / badge overlap
- **Where**: `frontend/src/pages/PatientView.css` — `.exercise-header`, `.exercise-title-row`, `.exercise-number`, `.completion-info`.
- **Issue**: Layout relies on mixed flex wrapping and nested containers, which can cause the number badge or actions to collide with the title on narrow widths or long exercise names. The badge is visually strong and can appear detached when the title wraps.
- **Impact**: Title overlap or erratic alignment between badge, title, and "Выполнено" actions.

### 2) Video block cropping regressions
- **Where**: `frontend/src/pages/PatientView.css` — `.video-container` / `.exercise-video`.
- **Issue**: The container uses absolute positioning and `overflow: hidden` to enforce the 16:9 layout. If conflicting styles are introduced (e.g., different size constraints or future `object-fit`-like hacks), it can lead to perceived cropping on wider screens.
- **Impact**: Users see clipped video edges on large displays.

### 3) Defensive rendering for numeric params
- **Where**: `frontend/src/pages/PatientView.js` — exercise params (`sets`, `reps`, `duration_seconds`, `rest_seconds`).
- **Issue**: Data may arrive as strings; current rendering trusts raw values. If a value is not numeric, it can surface as `NaN` or render inconsistently.
- **Impact**: Incorrect or confusing display (e.g., `NaN сек`).

---

## Root causes of regressions
- **Conflicting layout strategies**: Nested flex rows for badge/title + separate action block makes alignment brittle, especially when older or future overrides apply.
- **Mixed positioning in video area**: Absolute positioning + overflow hidden can create ambiguity when layout constraints change, making it easier for future adjustments to reintroduce cropping.
- **Unvalidated numeric inputs**: Lack of defensive coercion allows string values to leak into UI.

---

## Recommended fixes (ranked)

### P0 — Must fix immediately
1) **Unify exercise header layout strategy**
   - Use a single grid layout with explicit columns for badge, title, and actions to prevent overlaps.
2) **Ensure video fits 16:9 without cropping**
   - Use `aspect-ratio: 16 / 9` on container with iframe sized to `width: 100%` and `height: 100%` (no cover-like behavior).

### P1 — High priority
1) **Defensive numeric rendering**
   - Coerce `sets`, `reps`, `duration_seconds`, and `rest_seconds` to numbers before rendering to avoid `NaN`.

### P2 — Nice to have
1) **Add visual QA checklist to release notes**
   - Reduce regressions caused by repeated layout changes.

---

## Manual test checklist

### Desktop
- Open PatientView via a valid token link.
- Validate header layout (logo + patient/instructor names aligned).
- In exercises list:
  - Long exercise titles do not overlap the badge.
  - "Выполнено" button remains aligned to the right.
  - Completion badge (if shown) does not shift the title.
  - Video displays full frame without cropping on wide screens.
- Ensure params show numeric values (no `NaN`).

### Mobile (<= 640px)
- Header stacks without overlap.
- Exercise header stacks correctly:
  - Badge and title align in first row.
  - Actions move below title without overlap.
- Video remains 16:9 and fully visible.
- Sticky CTA remains visible and usable.

---

## Files touched in stabilization patch
- `frontend/src/pages/PatientView.js`
- `frontend/src/pages/PatientView.css`
- `docs/PATIENTVIEW_AUDIT.md`
