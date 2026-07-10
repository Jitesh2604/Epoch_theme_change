# Epoch Quiz — Backend Modules Reference

A complete, single-file reference for the backend built under `server/`.

- Tech stack: **Node.js · Express · TypeScript · PostgreSQL · Prisma**
- Base URL: `http://localhost:5000/api/v1`
- Standard response envelope:
  - Success: `{ "success": true, "data": ..., "message": "...", "meta": {...} }`
  - Error:   `{ "success": false, "error": { "code": "...", "message": "...", "details": [...] } }`

> All examples use **PowerShell** (your shell). Replace placeholders like `<A>`, `<SUB>`, `<USER_ID>` with the IDs you receive in earlier responses.

---

## Table of Contents

- [One-time setup](#one-time-setup)
- [Environment variables](#environment-variables)
- [Module 1 — Backend setup](#module-1--backend-setup)
- [Module 2 — Database setup](#module-2--database-setup)
- [Module 3 — Authentication](#module-3--authentication)
- [Module 4 — User management](#module-4--user-management)
- [Module 5 — Assessment system](#module-5--assessment-system)
- [Module 6 — Question system](#module-6--question-system)
- [Module 7 — Excel upload](#module-7--excel-upload)
- [Module 8 — Student assessment flow](#module-8--student-assessment-flow)
- [Module 9 — Results & leaderboard](#module-9--results--leaderboard)
- [All endpoints (cheat sheet)](#all-endpoints-cheat-sheet)
- [Frontend integration notes](#frontend-integration-notes)

---

## One-time setup

From `c:\Jite\Epoch_Quiz\server`:

```powershell
# 1. Install dependencies
npm install

# 2. Copy env template and edit
copy .env.example .env
#    set DATABASE_URL + JWT secrets

# 3. Generate Prisma client
npm run prisma:generate

# 4. Create the initial migration & apply it
npm run prisma:migrate -- --name init

# 5. Seed default subjects + the default admin
npm run prisma:seed

# 6. Start the dev server
npm run dev
```

Server runs at `http://localhost:5000/api/v1`. Liveness check:

```powershell
curl http://localhost:5000/api/v1/health
```

---

## Environment variables

All env vars are validated by Zod at startup; a missing/invalid var fails fast with a clear message.

| Variable | Default | Used by |
|---|---|---|
| `NODE_ENV` | `development` | logging, error verbosity |
| `PORT` | `5000` | server |
| `API_PREFIX` | `/api/v1` | route mounting |
| `DATABASE_URL` | — (required) | Prisma |
| `JWT_ACCESS_SECRET` | — (required, ≥ 16 chars) | auth |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | auth |
| `JWT_REFRESH_SECRET` | — (required, ≥ 16 chars) | auth |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | auth |
| `BCRYPT_SALT_ROUNDS` | `10` | password hash |
| `CORS_ORIGIN` | `http://localhost:5173` | CORS (comma-separated for many) |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | global rate limit |
| `RATE_LIMIT_MAX` | `200` | global rate limit |
| `LOG_LEVEL` | `info` | winston |
| `SEED_ADMIN_EMAIL` | `admin@epoch.local` | seed only |
| `SEED_ADMIN_PASSWORD` | `Admin@12345` | seed only |
| `SEED_ADMIN_NAME` | `Publication Admin` | seed only |

---

## Module 1 — Backend setup

**Goal:** Production-ready Express + TypeScript scaffold.

Everything is wired: `helmet`, `cors`, `compression`, `cookie-parser`, global rate limit, `morgan→winston` logging, validated env (`zod`), Prisma client singleton with HMR-safe cache, graceful shutdown on `SIGINT`/`SIGTERM`, central error handler that maps `ApiError` / `ZodError` / Prisma errors / Multer errors into a uniform JSON envelope.

### Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | public | Liveness (no DB) |
| GET | `/health/db` | public | Readiness (`SELECT 1`) |

### Test
```powershell
curl http://localhost:5000/api/v1/health
curl http://localhost:5000/api/v1/health/db
curl http://localhost:5000/api/v1/does-not-exist   # → standard 404 envelope
```

---

## Module 2 — Database setup

**Goal:** Full Prisma schema with all models, enums, indices and relations.

Models: `User`, `TeacherProfile`, `StudentProfile`, `RefreshToken`, `Subject`, `Assessment`, `Question`, `AssessmentQuestion`, `Submission`, `Answer`.
Enums: `Role`, `UserStatus`, `AssessmentStatus`, `QuestionType` (`MCQ` / `TRUE_FALSE` / `DESCRIPTIVE`), `Difficulty`, `SubmissionStatus`.

Key design choices:
- `cuid()` IDs everywhere
- One submission per (assessment, student) — enforced by `@@unique([assessmentId, studentId])`
- `tags String[]` uses Postgres native `text[]`
- `options Json` on Question (flexible 2..n options)
- Cascading deletes on dependent rows (refresh tokens, profiles, answers)
- Snake_case DB table names (`@@map`) for clean SQL

### Test
```powershell
npm run prisma:migrate -- --name init
npm run prisma:seed        # 6 subjects + 1 admin
npm run prisma:studio      # browse data
```

Verify DB connectivity:
```powershell
curl http://localhost:5000/api/v1/health/db
# → { "success": true, "data": { "database": "connected" } }
```

---

## Module 3 — Authentication

**Goal:** JWT auth (access + refresh) with bcrypt, role-based middleware, refresh-token rotation, brute-force rate limiting on credential endpoints.

- Access token: 15 min (default). Refresh token: 7 days.
- Refresh tokens stored hashed (SHA-256) in `refresh_tokens`.
- Every successful `/refresh` revokes the previous refresh token and issues a fresh pair (rotation).
- Public registration accepts only `TEACHER` / `STUDENT`. Admin accounts are seeded or created by an existing admin (Module 4).

### Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | Signup (TEACHER or STUDENT) |
| POST | `/auth/login` | public | Login → access + refresh |
| POST | `/auth/refresh` | public | Rotate tokens |
| POST | `/auth/logout` | public | Revoke a refresh token |
| GET | `/auth/me` | Bearer | Current user + profile |

### Test
```powershell
# Register a teacher
curl -X POST http://localhost:5000/api/v1/auth/register `
  -H "Content-Type: application/json" `
  -d '{ "name": "Test Teacher", "email": "teacher@epoch.local", "password": "Teacher@123", "role": "TEACHER", "subject": "Mathematics" }'

# Register a student
curl -X POST http://localhost:5000/api/v1/auth/register `
  -H "Content-Type: application/json" `
  -d '{ "name": "Test Student", "email": "student@epoch.local", "password": "Student@123", "role": "STUDENT", "grade": "10", "section": "A" }'

# Login as seeded admin
$ADMIN = (curl -s -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" `
  -d '{ "email": "admin@epoch.local", "password": "Admin@12345" }' | ConvertFrom-Json).data.accessToken

# Protected call
curl http://localhost:5000/api/v1/auth/me -H "Authorization: Bearer $ADMIN"
```

**Error cases:**
- `"role": "ADMIN"` in register → 422
- Wrong password → 401
- Expired access token → 401 `TOKEN_EXPIRED`
- Duplicate email → 409

---

## Module 4 — User management

**Goal:** Admin CRUD for users, role-targeted listings, self-service profile + password change.

- `DELETE /users/:id` is a **soft delete** — sets `status: INACTIVE` and revokes the user's refresh tokens (force-logout everywhere).
- Role is immutable after creation. To change a user's role, soft-delete + recreate.
- Changing your own password atomically revokes all your refresh tokens.

### Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/users` | ADMIN | Paginated list (`?role`, `?status`, `?search`) |
| GET | `/users/teachers` | ADMIN | TeacherRow shape |
| GET | `/users/students` | ADMIN, TEACHER | StudentRow shape (real `avgScore` and `rank` after Module 9) |
| GET | `/users/:id` | ADMIN | Single user + profile |
| POST | `/users` | ADMIN | Create user of any role |
| PATCH | `/users/:id` | ADMIN | Update name/email/status/avatarHue + profile fields |
| DELETE | `/users/:id` | ADMIN | Soft delete |
| GET | `/users/me/stats` | any | **Caller-aware stats** (see Module 9) |
| PATCH | `/users/me` | any | Update own profile |
| PATCH | `/users/me/password` | any | Change own password |

### Test
```powershell
$ADMIN = (curl -s -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" `
  -d '{ "email": "admin@epoch.local", "password": "Admin@12345" }' | ConvertFrom-Json).data.accessToken

# List users
curl -H "Authorization: Bearer $ADMIN" "http://localhost:5000/api/v1/users?role=TEACHER&search=jite"

# Admin creates a teacher
curl -X POST http://localhost:5000/api/v1/users `
  -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" `
  -d '{ "name": "Created", "email": "adminmade@epoch.local", "password": "Admin@12345", "role": "TEACHER", "subject": "Physics" }'

# Teacher / student listings (frontend table shape)
curl -H "Authorization: Bearer $ADMIN" http://localhost:5000/api/v1/users/teachers
curl -H "Authorization: Bearer $ADMIN" http://localhost:5000/api/v1/users/students

# Soft-delete
curl -X DELETE http://localhost:5000/api/v1/users/<USER_ID> -H "Authorization: Bearer $ADMIN"

# Self-service (any role)
$TOKEN = "..."  # access token of any logged-in user
curl -X PATCH http://localhost:5000/api/v1/users/me `
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" `
  -d '{ "name": "Updated Name" }'

curl -X PATCH http://localhost:5000/api/v1/users/me/password `
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" `
  -d '{ "currentPassword": "OldPass@123", "newPassword": "NewPass@123" }'
```

---

## Module 5 — Assessment system

**Goal:** Teachers create/update/delete/publish/unpublish/archive assessments. Role-scoped visibility.

- TEACHER sees only their own; ADMIN sees all (`?mine=true` narrows); STUDENT sees only `PUBLISHED` (404 for everything else — existence hidden).
- Publish requires ≥ 1 question.
- Archived assessments can't be edited or have questions attached/detached.
- Delete is refused if any submission exists — archive instead.

### Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/subjects` | any | List subjects (for dropdowns) |
| GET | `/assessments` | any (auto-scoped) | List w/ `?status`, `?subjectId`, `?search`, `?mine`, pagination |
| POST | `/assessments` | TEACHER, ADMIN | Create DRAFT |
| GET | `/assessments/:id` | any (scoped) | Get one |
| PATCH | `/assessments/:id` | owner / ADMIN | Update fields |
| DELETE | `/assessments/:id` | owner / ADMIN | Delete (refused if submissions exist) |
| POST | `/assessments/:id/publish` | owner / ADMIN | DRAFT → PUBLISHED |
| POST | `/assessments/:id/unpublish` | owner / ADMIN | PUBLISHED → DRAFT |
| POST | `/assessments/:id/archive` | owner / ADMIN | → ARCHIVED |

### Test
```powershell
$TEACHER = (curl -s -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" `
  -d '{ "email": "teacher@epoch.local", "password": "Teacher@123" }' | ConvertFrom-Json).data.accessToken

$SUBJECT = (curl -s -H "Authorization: Bearer $TEACHER" http://localhost:5000/api/v1/subjects | ConvertFrom-Json).data[0].id

# Create
$body = @{ title="Algebra Mid-Term"; description="Quadratics + linear systems"; duration=60; subjectId=$SUBJECT; passingMarks=40 } | ConvertTo-Json
$A = (curl -s -X POST http://localhost:5000/api/v1/assessments -H "Authorization: Bearer $TEACHER" -H "Content-Type: application/json" -d $body | ConvertFrom-Json).data.id

# Update
curl -X PATCH "http://localhost:5000/api/v1/assessments/$A" -H "Authorization: Bearer $TEACHER" -H "Content-Type: application/json" -d '{ "duration": 75 }'

# Publish (fails until Module 6 attaches questions)
curl -X POST "http://localhost:5000/api/v1/assessments/$A/publish" -H "Authorization: Bearer $TEACHER"

# Student listing — sees only PUBLISHED
$STUDENT = (curl -s -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" `
  -d '{ "email": "student@epoch.local", "password": "Student@123" }' | ConvertFrom-Json).data.accessToken
curl -H "Authorization: Bearer $STUDENT" http://localhost:5000/api/v1/assessments
```

---

## Module 6 — Question system

**Goal:** CRUD for `MCQ` / `TRUE_FALSE` / `DESCRIPTIVE` questions + attach/detach/reorder on assessments. Auto-recompute of `Assessment.totalMarks`.

- **No** fill-in-blanks, **no** match-the-following, **no** negative marking (`marks` min is 1, awarded marks default 0).
- Discriminated-union Zod schema rejects type-mismatched fields at the boundary.
- MCQ: 2..6 options; `correctOption` validated in-range.
- Reorder uses a two-phase transaction to dodge the unique `(assessmentId, order)` constraint.

### Endpoints

**Question bank** (TEACHER, ADMIN):

| Method | Path | Purpose |
|---|---|---|
| GET | `/questions` | List (`?type`, `?difficulty`, `?subjectId`, `?search`, `?mine`) |
| POST | `/questions` | Create (typed payload) |
| GET | `/questions/:id` | Get one |
| PATCH | `/questions/:id` | Update (type-coherent) |
| DELETE | `/questions/:id` | Refused if any answer references it |

**Assessment ↔ Question** (owner / ADMIN):

| Method | Path | Purpose |
|---|---|---|
| GET | `/assessments/:id/questions` | List ordered questions in an assessment |
| POST | `/assessments/:id/questions` | Attach `{ questionId, marks? }` OR `{ questionIds: [...] }` |
| PATCH | `/assessments/:id/questions/:questionId` | Update `marks` or `order` |
| DELETE | `/assessments/:id/questions/:questionId` | Detach (auto re-sequences orders) |
| PATCH | `/assessments/:id/questions/reorder` | Bulk reorder `{ order: [{ questionId, order }] }` |

### Payload shapes

**Create MCQ:**
```json
{ "type":"MCQ", "prompt":"What is 2+2?", "options":["3","4","5","6"], "correctOption":1, "marks":1, "difficulty":"EASY", "tags":["arithmetic"], "subjectId":"<id>" }
```

**Create TRUE_FALSE:**
```json
{ "type":"TRUE_FALSE", "prompt":"The Earth is flat.", "correctBoolean":false, "marks":1 }
```

**Create DESCRIPTIVE:**
```json
{ "type":"DESCRIPTIVE", "prompt":"Explain Newton's first law.", "modelAnswer":"An object at rest…", "marks":5 }
```

### Test
```powershell
$SUBJECT = (curl -s -H "Authorization: Bearer $TEACHER" http://localhost:5000/api/v1/subjects | ConvertFrom-Json).data[0].id

# Create one of each
$mcq = @{ type="MCQ"; prompt="What is 2+2?"; options=@("3","4","5","6"); correctOption=1; marks=1; subjectId=$SUBJECT } | ConvertTo-Json
$MCQ = (curl -s -X POST http://localhost:5000/api/v1/questions -H "Authorization: Bearer $TEACHER" -H "Content-Type: application/json" -d $mcq | ConvertFrom-Json).data.id

$tf  = @{ type="TRUE_FALSE"; prompt="The sky is blue."; correctBoolean=$true; marks=1; subjectId=$SUBJECT } | ConvertTo-Json
$TF  = (curl -s -X POST http://localhost:5000/api/v1/questions -H "Authorization: Bearer $TEACHER" -H "Content-Type: application/json" -d $tf | ConvertFrom-Json).data.id

$desc = @{ type="DESCRIPTIVE"; prompt="Define gravity."; modelAnswer="A force..."; marks=5; subjectId=$SUBJECT } | ConvertTo-Json
$DESC = (curl -s -X POST http://localhost:5000/api/v1/questions -H "Authorization: Bearer $TEACHER" -H "Content-Type: application/json" -d $desc | ConvertFrom-Json).data.id

# Bulk attach to assessment $A
$attach = @{ questionIds = @($MCQ, $TF, $DESC) } | ConvertTo-Json
curl -X POST "http://localhost:5000/api/v1/assessments/$A/questions" -H "Authorization: Bearer $TEACHER" -H "Content-Type: application/json" -d $attach
# → { attached: 3, skipped: 0, totalMarks: 7 }

# List questions in the assessment (ordered)
curl -H "Authorization: Bearer $TEACHER" "http://localhost:5000/api/v1/assessments/$A/questions"

# Override marks for a specific question (per-assessment)
curl -X PATCH "http://localhost:5000/api/v1/assessments/$A/questions/$DESC" -H "Authorization: Bearer $TEACHER" -H "Content-Type: application/json" -d '{ "marks": 10 }'

# Reorder
$reorder = @{ order = @(
  @{ questionId=$DESC; order=1 }, @{ questionId=$TF; order=2 }, @{ questionId=$MCQ; order=3 }
) } | ConvertTo-Json -Depth 5
curl -X PATCH "http://localhost:5000/api/v1/assessments/$A/questions/reorder" -H "Authorization: Bearer $TEACHER" -H "Content-Type: application/json" -d $reorder

# Now publish succeeds
curl -X POST "http://localhost:5000/api/v1/assessments/$A/publish" -H "Authorization: Bearer $TEACHER"
```

---

## Module 7 — Excel upload

**Goal:** Bulk-import questions from `.xlsx` / `.xls`. Validates per-row, supports dry-run, optional auto-attach to an assessment.

### File format (this is the format you can change anytime)

Single sheet (any name; first one is used). Header row — case-insensitive; spaces/underscores ignored (`Correct Option` = `correctoption` = `correct_option`).

| Column | Required | Notes |
|---|---|---|
| `type` | ✅ | `MCQ` · `TRUE_FALSE` (or `TF`, `True/False`) · `DESCRIPTIVE` (or `DESC`) |
| `prompt` | ✅ | Question text (≤ 5000 chars) |
| `option1`…`option6` | MCQ | Min 2 non-empty; blanks ignored |
| `correctOption` | MCQ | Letter `A`–`F` OR 1-based number `1`–`6` |
| `correctBoolean` | TRUE_FALSE | `TRUE`/`FALSE`/`T`/`F`/`YES`/`NO`/`Y`/`N`/`1`/`0` |
| `modelAnswer` | optional (DESC) | Sample answer (≤ 5000 chars) |
| `marks` | optional | Integer 1–100 (default 1) |
| `difficulty` | optional | `EASY` / `MEDIUM` / `HARD` (default `MEDIUM`) |
| `tags` | optional | Comma-separated (max 20) |
| `subject` | optional | Subject **name** OR **slug** — must already exist in DB |

**Limits:** 5 MB file size; max 1000 rows.

### Endpoints (TEACHER, ADMIN)
| Method | Path | Purpose |
|---|---|---|
| GET | `/questions/upload/template` | Download a starter `.xlsx` (header + 1 example per type) |
| POST | `/questions/upload` | Multipart upload (field: `file`) |

**Query params on `POST`:**
- `dryRun=true` — validate only, write nothing
- `assessmentId=<id>` — after import, also attach all newly-created questions to this assessment
- `stopOnError=true` — refuse the whole import if any row is invalid (atomic semantics)

### Test
```powershell
# Download the template (gives a working starter file)
curl -H "Authorization: Bearer $TEACHER" -o template.xlsx `
     http://localhost:5000/api/v1/questions/upload/template

# Dry run (validate only)
curl -X POST "http://localhost:5000/api/v1/questions/upload?dryRun=true" `
  -H "Authorization: Bearer $TEACHER" -F "file=@template.xlsx"

# Real import
curl -X POST "http://localhost:5000/api/v1/questions/upload" `
  -H "Authorization: Bearer $TEACHER" -F "file=@template.xlsx"

# Import + auto-attach to assessment $A in one go
curl -X POST "http://localhost:5000/api/v1/questions/upload?assessmentId=$A" `
  -H "Authorization: Bearer $TEACHER" -F "file=@template.xlsx"
```

**Response shape (`ImportSummary`):**
```json
{
  "success": true,
  "message": "Import completed",
  "data": {
    "totalRows": 12,
    "validRows": 10,
    "invalidRows": 2,
    "createdQuestions": 10,
    "attachedToAssessment": 10,
    "dryRun": false,
    "errors": [
      { "row": 4,  "field": "correctOption", "message": "correctOption \"X\" must be a letter A..F or a number 1..4" },
      { "row": 11, "field": "subject",       "message": "Unknown subject \"Biology\"" }
    ]
  }
}
```

---

## Module 8 — Student assessment flow

**Goal:** End-to-end student attempt — start, autosave, submit, view results. Manual grading for descriptive answers.

- One submission per `(assessment, student)` (schema constraint). Re-starting returns the existing in-progress attempt (resume).
- Server-authoritative time limit from `startedAt + duration`. Out-of-time attempts auto-submit on the next interaction.
- Auto-grade MCQ/TF; descriptive left ungraded until manually graded.
- Status flow: `IN_PROGRESS` → `SUBMITTED` (or `GRADED` if no descriptive). Manual grading promotes `SUBMITTED` → `GRADED` once the last descriptive is scored.
- During the attempt: sanitized questions (no correct answers leaked). After submit: full reveal with `marksAwarded` and `isCorrect`.

### Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/assessments/:id/start` | STUDENT, ADMIN | Create/resume attempt |
| POST | `/submissions/:id/answer` | owner / ADMIN | Autosave one answer |
| POST | `/submissions/:id/submit` | owner / ADMIN | Finalize (optional bulk answers + auto-grade) |
| GET | `/submissions/me` | STUDENT | Own submissions list |
| GET | `/submissions` | TEACHER (auto-scoped), ADMIN | List (filters: `status`, `assessmentId`, `studentId`) |
| GET | `/submissions/:id` | any with access | Full detail (reveal after submit) |
| PATCH | `/submissions/:id/answers/:questionId/grade` | TEACHER (owner), ADMIN | Grade descriptive |

### Payload shapes

**`POST /submissions/:id/answer`** (autosave):
```json
{ "questionId": "...", "selectedOption": 1, "timeMs": 8400 }
```

**`POST /submissions/:id/submit`** (final, bulk):
```json
{
  "answers": [
    { "questionId": "...", "selectedOption": 1,     "timeMs": 5200 },
    { "questionId": "...", "selectedBoolean": false, "timeMs": 3100 },
    { "questionId": "...", "textAnswer": "...",     "timeMs": 42000 }
  ]
}
```

**`PATCH .../grade`** (teacher):
```json
{ "marksAwarded": 4, "isCorrect": true }
```

### Test
```powershell
$STUDENT = (curl -s -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" `
  -d '{ "email": "student@epoch.local", "password": "Student@123" }' | ConvertFrom-Json).data.accessToken

# Start attempt
$start = curl -s -X POST "http://localhost:5000/api/v1/assessments/$A/start" -H "Authorization: Bearer $STUDENT" | ConvertFrom-Json
$SUB = $start.data.submission.id
$start.data.submission.questions  # sanitized — no correct answers

# Submit all answers at once
$payload = @{
  answers = @(
    @{ questionId = $start.data.submission.questions[0].questionId; selectedOption = 1;     timeMs = 4200 },
    @{ questionId = $start.data.submission.questions[1].questionId; selectedBoolean = $true; timeMs = 1900 },
    @{ questionId = $start.data.submission.questions[2].questionId; textAnswer = "An object remains at rest…"; timeMs = 22000 }
  )
} | ConvertTo-Json -Depth 5

curl -X POST "http://localhost:5000/api/v1/submissions/$SUB/submit" -H "Authorization: Bearer $STUDENT" -H "Content-Type: application/json" -d $payload

# Student sees own attempts
curl -H "Authorization: Bearer $STUDENT" http://localhost:5000/api/v1/submissions/me

# Teacher views submissions for their assessments
curl -H "Authorization: Bearer $TEACHER" "http://localhost:5000/api/v1/submissions?assessmentId=$A"

# Teacher grades the descriptive answer
$DESC_QID = $start.data.submission.questions[2].questionId
curl -X PATCH "http://localhost:5000/api/v1/submissions/$SUB/answers/$DESC_QID/grade" `
  -H "Authorization: Bearer $TEACHER" -H "Content-Type: application/json" -d '{ "marksAwarded": 4, "isCorrect": true }'
```

**Error cases worth checking:**
- Restart after submission → 409
- Wrong field type for a question type → 400
- Submitting after time is up → 400 (auto-submitted)
- Grading a non-descriptive answer → 400

---

## Module 9 — Results & leaderboard

**Goal:** Per-assessment leaderboard, global student leaderboard, role-aware "my stats" endpoint. Also wires real `avgScore` + `rank` into `/users/students`.

- Per-assessment ranking: `score DESC, timeTakenSec ASC, submittedAt ASC` — fastest highest-scorer wins ties.
- Student access to assessment leaderboard requires their own submission to be finalized (`SUBMITTED` or `GRADED`).
- Global ranking is by `totalScore DESC` (then `avgPercent`).
- `myStats` returns a different payload per role (student / teacher / admin).

### Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/assessments/:id/leaderboard` | ADMIN, TEACHER (own), STUDENT (must have submitted) | Ranked list for one assessment |
| GET | `/leaderboard` | any | Global student leaderboard (`?subjectId`, `?limit`, pagination) |
| GET | `/users/me/stats` | any | Caller-aware stats (different payload per role) |

### Response shapes

**`GET /assessments/:id/leaderboard`:**
```json
{
  "success": true,
  "data": [
    { "rank": 1, "studentId": "...", "studentName": "...", "avatarHue": 207,
      "score": 9, "totalMarks": 10, "percent": 90.00,
      "timeTakenSec": 187, "submittedAt": "...", "status": "GRADED", "passed": true }
  ],
  "meta": { "page": 1, "limit": 50, "total": 12, "totalPages": 1,
            "assessment": { "id": "...", "title": "...", "totalMarks": 10, "passingMarks": 4 } }
}
```

**`GET /leaderboard`:**
```json
{
  "success": true,
  "data": [
    { "rank": 1, "studentId": "...", "studentName": "...", "avatarHue": 207,
      "grade": "10", "section": "A",
      "attempted": 5, "totalScore": 42, "totalPossible": 50, "avgPercent": 84.00 }
  ],
  "meta": { "page": 1, "limit": 20, "total": 35, "totalPages": 2 }
}
```

**`GET /users/me/stats` (per role):**

```jsonc
// STUDENT
{ "role": "STUDENT", "attempted": 5, "inProgress": 0,
  "totalScore": 42, "totalPossible": 50, "avgPercent": 84.00,
  "totalTimeSec": 1820, "rank": 3 }

// TEACHER
{ "role": "TEACHER", "assessmentsCreated": 4, "totalSubmissions": 87,
  "avgScore": 6.4, "avgTimeSec": 412, "avgPercent": 73.50 }

// ADMIN
{ "role": "ADMIN", "users": { "ADMIN": 1, "TEACHER": 8, "STUDENT": 142 },
  "totalAssessments": 21, "totalSubmissions": 320,
  "gradedSubmissions": 310, "platformAvgPercent": 71.20 }
```

### Test
```powershell
# Per-assessment leaderboard (any role with access)
curl -H "Authorization: Bearer $TEACHER" "http://localhost:5000/api/v1/assessments/$A/leaderboard"

# Global leaderboard
curl -H "Authorization: Bearer $STUDENT" "http://localhost:5000/api/v1/leaderboard?limit=10"

# My stats (returns different payload per role)
curl -H "Authorization: Bearer $STUDENT" http://localhost:5000/api/v1/users/me/stats
curl -H "Authorization: Bearer $TEACHER" http://localhost:5000/api/v1/users/me/stats
curl -H "Authorization: Bearer $ADMIN"   http://localhost:5000/api/v1/users/me/stats

# Student list now has real avgScore + rank
curl -H "Authorization: Bearer $ADMIN" http://localhost:5000/api/v1/users/students
```

---

## All endpoints (cheat sheet)

Base: `http://localhost:5000/api/v1`

```
GET    /health                                              public
GET    /health/db                                           public

POST   /auth/register                                       public
POST   /auth/login                                          public
POST   /auth/refresh                                        public
POST   /auth/logout                                         public
GET    /auth/me                                             Bearer

GET    /users                                               ADMIN
GET    /users/teachers                                      ADMIN
GET    /users/students                                      ADMIN, TEACHER
GET    /users/:id                                           ADMIN
POST   /users                                               ADMIN
PATCH  /users/:id                                           ADMIN
DELETE /users/:id                                           ADMIN (soft)
GET    /users/me/stats                                      any
PATCH  /users/me                                            any
PATCH  /users/me/password                                   any

GET    /subjects                                            any

GET    /assessments                                         any (auto-scoped)
POST   /assessments                                         TEACHER, ADMIN
GET    /assessments/:id                                     any (scoped)
PATCH  /assessments/:id                                     owner / ADMIN
DELETE /assessments/:id                                     owner / ADMIN
POST   /assessments/:id/publish                             owner / ADMIN
POST   /assessments/:id/unpublish                           owner / ADMIN
POST   /assessments/:id/archive                             owner / ADMIN
POST   /assessments/:id/start                               STUDENT, ADMIN
GET    /assessments/:id/leaderboard                         scoped

GET    /assessments/:id/questions                           owner / ADMIN
POST   /assessments/:id/questions                           owner / ADMIN
PATCH  /assessments/:id/questions/reorder                   owner / ADMIN
PATCH  /assessments/:id/questions/:questionId               owner / ADMIN
DELETE /assessments/:id/questions/:questionId               owner / ADMIN

GET    /questions                                           TEACHER, ADMIN
POST   /questions                                           TEACHER, ADMIN
GET    /questions/:id                                       owner / ADMIN
PATCH  /questions/:id                                       owner / ADMIN
DELETE /questions/:id                                       owner / ADMIN
GET    /questions/upload/template                           TEACHER, ADMIN
POST   /questions/upload                                    TEACHER, ADMIN

GET    /submissions/me                                      STUDENT
GET    /submissions                                         TEACHER, ADMIN
GET    /submissions/:id                                     scoped
POST   /submissions/:id/answer                              STUDENT (owner), ADMIN
POST   /submissions/:id/submit                              STUDENT (owner), ADMIN
PATCH  /submissions/:id/answers/:questionId/grade           TEACHER (owner), ADMIN

GET    /leaderboard                                         any
```

---

## Frontend integration notes

Things worth remembering when wiring `client/` against the API.

**Token handling**
- Store the access token in memory; send `Authorization: Bearer <token>` on every protected request.
- Store the refresh token securely (httpOnly cookie ideally; if you must use `localStorage`, accept the XSS risk).
- On `401 TOKEN_EXPIRED`: call `POST /auth/refresh`, then retry the original request once.
- On logout: call `POST /auth/logout` server-side first, then clear client storage.

**Casing differences**
- Frontend types use lowercase for `Role` (`'admin' | 'teacher' | 'student'`), `QuestionType` (`'mcq' | 'truefalse' | 'descriptive'`), `AssessmentStatus` (`'draft' | 'published' | 'archived'`). Backend returns the **uppercase** Prisma enums. Map both directions in your API client.
- Frontend `Assessment` uses `name` for what the backend calls `title`. Map `title ↔ name`.
- Frontend `BankQuestion.correct` is `number | boolean` — maps to `correctOption` (MCQ) or `correctBoolean` (TF).
- Frontend `BankQuestion.answer` is the model answer — maps to `modelAnswer`.

**Quiz-attempt flow**
- Use `remainingSec` from `POST /assessments/:id/start` as the source of truth for the countdown — don't poll the server clock.
- On page refresh mid-attempt, just call `start` again. You'll get the same in-progress submission back, with `savedAnswers` and an adjusted `remainingSec`.
- Autosave (`/answer`) is optional. If your UX submits everything in one shot, just call `/submit` with the full `answers` array.

**Leaderboard UX**
- Per-assessment leaderboard reveals to a student only after their attempt is finalized. Show a "Submit to see standings" message otherwise.
- The global leaderboard's `subjectId` filter is supported — pass it for subject-specific boards.

**Errors**
- All errors come in `{ success:false, error: { code, message, details? } }`. `details` is an array of `{ field?, message }` and is most useful for surfacing per-field form validation errors (it's populated for `ZodError` failures).

---

## Schema v2 — What changed (migration guide)

> Run this after pulling the updated `prisma/schema.prisma`:
> ```powershell
> npm run prisma:migrate -- --name full_schema_v2
> npm run prisma:generate
> ```

### Breaking: Role enum renamed
| Old value | New value |
|---|---|
| `ADMIN` | `SUPER_ADMIN` |
| _(new)_ | `PUBLICATION_ADMIN` |
| _(new)_ | `CONTENT_MANAGER` |

Update every `Role.ADMIN` reference in controllers/validators to `Role.SUPER_ADMIN`.

### Breaking: QuestionType expanded
| Old | New |
|---|---|
| `MCQ` | `MCQ_SINGLE` |
| _(new)_ | `MCQ_MULTIPLE` |
| `TRUE_FALSE` | `TRUE_FALSE` (unchanged) |
| `DESCRIPTIVE` | `DESCRIPTIVE` (kept for compatibility) |
| _(new)_ | `FILL_IN_BLANK` |
| _(new)_ | `MATCH_THE_COLUMN` |

### Breaking: Question fields changed
- `options Json` → removed; replaced by `optionA / optionB / optionC / optionD` (String) + `*ImageUrl` fields.
- `correctOption Int` → removed; replaced by `correctAnswer String` ("A"/"B"/"C"/"D" / "TRUE"/"FALSE" / text).
- `correctOptions String[]` added for `MCQ_MULTIPLE`.
- `negativeMarks Float` added.
- `bookId`, `chapterId`, `classId` FKs added.

### Breaking: AssessmentQuestion field renamed
- `marks Int?` → `marksOverride Float?`
- `negMarksOverride Float?` added.

### New tables (no breaking changes)
`publications`, `boards`, `series`, `classes`, `chapters`, `books`,
`student_books`, `teacher_classes`, `teacher_subjects`, `teacher_series`, `teacher_books`,
`quizzes`, `quiz_questions`, `quiz_chapters`, `quiz_assigned_classes`, `quiz_assigned_students`,
`quiz_attempts`, `attempt_answers`, `leaderboard`,
`assessment_chapters`, `assessment_assigned_classes`, `assessment_assigned_students`,
`otps`, `question_uploads`

### New User fields
- `mobileNo String? @unique`
- `publicationId String?` (FK → publications, for `PUBLICATION_ADMIN`)

### New TeacherProfile fields
- `mobileNo`, `dob`, `schoolName`, `boardId`, `teacherCode` (unique), `address`, `country`, `state`, `city`, `zip`, `imageUrl`
- Relations: `classes` (m2m via `teacher_classes`), `subjects` (m2m via `teacher_subjects`), `teacherSeries` (m2m), `books` (m2m)

### New StudentProfile fields
- `mobileNo`, `dob`, `schoolName`, `boardId`, `classId`, `seriesId`, `teacherCode`, `address`, `country`, `state`, `city`, `zip`, `imageUrl`
- Removed: `grade`, `section`, `rollNo` (superseded by `classId` FK and `seriesId` FK)

---

## Module 10 — Publication, Board, Series, Class, Subject, Book, Chapter

**Goal:** Manage the publication hierarchy that all quizzes and questions are organized under.

Hierarchy: `Publication → Board → Series → Class → Subject → Book → Chapter`

### Validate schema
```powershell
# One-time: after running the migration, confirm tables exist
npm run prisma:studio
# Browse: publications, boards, series, classes, subjects, books, chapters
```

### Seed a full hierarchy (manual SQL / Prisma Studio or via API once controllers are built)

Minimal hierarchy needed before creating any Quiz or Question:
1. Create a **Publication** (name, email, optional gst/pan/address)
2. Create a **Board** linked to that publication (e.g. CBSE, ICSE)
3. Create a **Series** linked to that publication (e.g. "Gold Series 2025")
4. Create a **Class** (e.g. "Class 6", serial "6")
5. Create a **Subject** (e.g. "Mathematics", slug "mathematics")
6. Create a **Book** linked to publication + board + series + class + subject
7. Create **Chapters** linked to that book (e.g. "Chapter 1: Integers")

### Test via Prisma Studio
```powershell
npm run prisma:studio
# Open http://localhost:5555
# Add rows to: publications → boards → series → classes → subjects → books → chapters
# Verify FK dropdowns populate correctly
```

---

## Module 11 — Quiz Module

**Goal:** Teachers create quizzes (Practice / Olympiad / Chapter Test / Mock Test / Live Quiz / Assignment), attach questions, configure rules, assign to classes or students, and publish.

Key rules:
- `quizType = PRACTICE` → `maxAttempts = null` (unlimited), `duration = 0` (untimed).
- `quizType = OLYMPIAD` → timed + ranked + `leaderboardEnabled = true`.
- `quizType = ASSIGNMENT` → `endDatetime` required; assigned to specific classes or students.
- A quiz must have ≥ 1 question before it can be published.
- `shuffleOptions` shuffles A/B/C/D per attempt, so `correctAnswer` stays as "A"/"B" etc. (the shuffle is purely display-side).

### Endpoints (to be implemented)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/quizzes` | any (auto-scoped) | List (`?quizType`, `?status`, `?classId`, `?bookId`, `?search`) |
| POST | `/quizzes` | TEACHER, SUPER_ADMIN | Create DRAFT |
| GET | `/quizzes/:id` | any (scoped) | Get one + question count |
| PATCH | `/quizzes/:id` | owner / SUPER_ADMIN | Update fields |
| DELETE | `/quizzes/:id` | owner / SUPER_ADMIN | Delete (refused if attempts exist) |
| POST | `/quizzes/:id/publish` | owner / SUPER_ADMIN | DRAFT → PUBLISHED |
| POST | `/quizzes/:id/unpublish` | owner / SUPER_ADMIN | PUBLISHED → DRAFT |
| POST | `/quizzes/:id/archive` | owner / SUPER_ADMIN | → ARCHIVED |
| GET | `/quizzes/:id/questions` | owner / SUPER_ADMIN | Ordered question list |
| POST | `/quizzes/:id/questions` | owner / SUPER_ADMIN | Attach `{ questionId, sortOrder?, marksOverride?, negMarksOverride? }` |
| PATCH | `/quizzes/:id/questions/:questionId` | owner / SUPER_ADMIN | Update order/marks |
| DELETE | `/quizzes/:id/questions/:questionId` | owner / SUPER_ADMIN | Detach |

### Test (once controllers are implemented)
```powershell
$TEACHER = (curl -s -X POST http://localhost:5000/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d '{ "email": "teacher@epoch.local", "password": "Teacher@123" }' | ConvertFrom-Json).data.accessToken

# Create a Practice quiz
$body = @{
  title = "Chapter 1 Practice"
  quizType = "PRACTICE"
  subjectId = "<SUBJECT_ID>"
  bookId = "<BOOK_ID>"
  classId = "<CLASS_ID>"
  totalMarks = 10
  marksPerQuestion = 1
  showResultAfter = "IMMEDIATELY"
  leaderboardEnabled = $false
} | ConvertTo-Json
$QUIZ = (curl -s -X POST http://localhost:5000/api/v1/quizzes `
  -H "Authorization: Bearer $TEACHER" -H "Content-Type: application/json" `
  -d $body | ConvertFrom-Json).data.id

# Attach a question
curl -X POST "http://localhost:5000/api/v1/quizzes/$QUIZ/questions" `
  -H "Authorization: Bearer $TEACHER" -H "Content-Type: application/json" `
  -d "{ \"questionId\": \"<QUESTION_ID>\", \"sortOrder\": 1 }"

# Publish
curl -X POST "http://localhost:5000/api/v1/quizzes/$QUIZ/publish" `
  -H "Authorization: Bearer $TEACHER"
```

### Create an Olympiad quiz
```powershell
$olympiad = @{
  title = "Science Olympiad 2025"
  quizType = "OLYMPIAD"
  subjectId = "<SUBJECT_ID>"
  classId = "<CLASS_ID>"
  duration = 60
  totalMarks = 50
  marksPerQuestion = 1
  negativeMarking = $true
  negativeMarksValue = 0.25
  shuffleQuestions = $true
  shuffleOptions = $true
  showResultAfter = "AFTER_END_DATE"
  certificateEnabled = $true
  leaderboardEnabled = $true
  startDatetime = "2025-09-01T09:00:00Z"
  endDatetime = "2025-09-01T10:00:00Z"
  passingMarks = 30
} | ConvertTo-Json
curl -X POST http://localhost:5000/api/v1/quizzes `
  -H "Authorization: Bearer $TEACHER" -H "Content-Type: application/json" -d $olympiad
```

---

## Module 12 — Quiz Attempt Flow

**Goal:** Students attempt quizzes with multiple-attempt support. Each attempt is tracked independently. Auto-grade MCQ/TF; leaderboard updated on submit.

Attempt flow:
1. `POST /quizzes/:id/attempts/start` → creates a new `QuizAttempt` row (auto-increments `attemptNumber`).
2. `POST /quiz-attempts/:id/answer` → saves/updates one `AttemptAnswer`.
3. `POST /quiz-attempts/:id/submit` → finalizes attempt, grades all answers, updates `QuizAttempt` stats (score, rank, isPassed), upserts `Leaderboard` row.

Rules:
- If `maxAttempts` is set, reject start if student has reached the limit.
- If `endDatetime` has passed, reject start.
- Auto-grade: `MCQ_SINGLE` / `MCQ_MULTIPLE` / `TRUE_FALSE` / `FILL_IN_BLANK` are graded server-side. `DESCRIPTIVE` and `MATCH_THE_COLUMN` may require manual review.
- `Leaderboard` row is upserted on each submit — only kept if score improves (best attempt wins).

### Endpoints (to be implemented)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/quizzes/:id/attempts/start` | STUDENT | Start new attempt |
| POST | `/quiz-attempts/:id/answer` | owner | Autosave one answer |
| POST | `/quiz-attempts/:id/submit` | owner | Submit + grade |
| GET | `/quiz-attempts/me` | STUDENT | Own attempts list |
| GET | `/quiz-attempts/:id` | owner / TEACHER / SUPER_ADMIN | Full attempt detail |
| GET | `/quizzes/:id/attempts` | TEACHER (own quiz), SUPER_ADMIN | All attempts for a quiz |
| GET | `/quizzes/:id/leaderboard` | any | Ranked leaderboard for a quiz |

### Test (once controllers are implemented)
```powershell
$STUDENT = (curl -s -X POST http://localhost:5000/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d '{ "email": "student@epoch.local", "password": "Student@123" }' | ConvertFrom-Json).data.accessToken

# Start attempt
$start = curl -s -X POST "http://localhost:5000/api/v1/quizzes/$QUIZ/attempts/start" `
  -H "Authorization: Bearer $STUDENT" | ConvertFrom-Json
$ATTEMPT = $start.data.attemptId
$start.data.questions   # sanitized — no correct answers revealed

# Save answers one by one (autosave)
curl -X POST "http://localhost:5000/api/v1/quiz-attempts/$ATTEMPT/answer" `
  -H "Authorization: Bearer $STUDENT" -H "Content-Type: application/json" `
  -d '{ "questionId": "<Q1>", "selectedOption": "A", "timeSpentSec": 12 }'

curl -X POST "http://localhost:5000/api/v1/quiz-attempts/$ATTEMPT/answer" `
  -H "Authorization: Bearer $STUDENT" -H "Content-Type: application/json" `
  -d '{ "questionId": "<Q2>", "selectedOption": "TRUE", "timeSpentSec": 8 }'

# Mark a question for review (student can come back to it)
curl -X POST "http://localhost:5000/api/v1/quiz-attempts/$ATTEMPT/answer" `
  -H "Authorization: Bearer $STUDENT" -H "Content-Type: application/json" `
  -d '{ "questionId": "<Q3>", "isMarkedReview": true }'

# Submit (bulk answers + finalize)
$payload = @{
  answers = @(
    @{ questionId = "<Q1>"; selectedOption = "B"; timeSpentSec = 15 },
    @{ questionId = "<Q2>"; selectedOption = "FALSE"; timeSpentSec = 6 },
    @{ questionId = "<Q3>"; selectedOption = "C"; timeSpentSec = 20 }
  )
} | ConvertTo-Json -Depth 5
curl -X POST "http://localhost:5000/api/v1/quiz-attempts/$ATTEMPT/submit" `
  -H "Authorization: Bearer $STUDENT" -H "Content-Type: application/json" -d $payload
# → { score, percentage, rank, isPassed, correctAnswers, wrongAnswers, skipped }

# View leaderboard (student must have submitted at least once)
curl -H "Authorization: Bearer $STUDENT" "http://localhost:5000/api/v1/quizzes/$QUIZ/leaderboard"

# MCQ_MULTIPLE answer example
curl -X POST "http://localhost:5000/api/v1/quiz-attempts/$ATTEMPT/answer" `
  -H "Authorization: Bearer $STUDENT" -H "Content-Type: application/json" `
  -d '{ "questionId": "<Q_MULTI>", "selectedOptions": ["A","C"], "timeSpentSec": 18 }'
```

**Error cases:**
- Start attempt when `maxAttempts` reached → 409
- Start attempt after `endDatetime` → 400
- Submit already-submitted attempt → 409
- Answer a question not in this quiz → 400

---

## Module 13 — OTP

**Goal:** OTP verification for registration/login/password-reset.

OTP flow:
1. On registration/login, generate a 6-digit OTP → save to `otps` table with `expiresAt = now + 10 min`.
2. User submits OTP → verify code + expiry → set `isVerified = true`.
3. If wrong OTP → increment `attemptCount`; lock after 5 failed attempts.

### OTP table fields
| Field | Notes |
|---|---|
| `mobileOrEmail` | The contact used for delivery |
| `otpCode` | 6-digit string, stored hashed or plain depending on impl |
| `otpType` | `REGISTRATION` / `LOGIN` / `PASSWORD_RESET` / `PHONE_VERIFY` |
| `expiresAt` | `now() + 10 minutes` |
| `isVerified` | Flipped to `true` on successful verify |
| `attemptCount` | Incremented on each wrong attempt |

### Endpoints (to be implemented)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/send-otp` | public | Send OTP to mobile/email |
| POST | `/auth/verify-otp` | public | Verify OTP code |

### Test (once controllers are implemented)
```powershell
# Send OTP (registration)
curl -X POST http://localhost:5000/api/v1/auth/send-otp `
  -H "Content-Type: application/json" `
  -d '{ "mobileOrEmail": "student@epoch.local", "otpType": "REGISTRATION" }'
# → { "success": true, "message": "OTP sent" }

# Verify OTP
curl -X POST http://localhost:5000/api/v1/auth/verify-otp `
  -H "Content-Type: application/json" `
  -d '{ "mobileOrEmail": "student@epoch.local", "otpCode": "123456", "otpType": "REGISTRATION" }'
# → { "success": true, "data": { "verified": true } }

# Wrong OTP (increment attemptCount)
curl -X POST http://localhost:5000/api/v1/auth/verify-otp `
  -H "Content-Type: application/json" `
  -d '{ "mobileOrEmail": "student@epoch.local", "otpCode": "000000", "otpType": "REGISTRATION" }'
# → 400 INVALID_OTP

# Expired OTP
# (insert a row with expiresAt in the past via Prisma Studio, then verify)
# → 400 OTP_EXPIRED
```

---

## Module 14 — Question Paper Upload (Quiz-linked Excel Import)

**Goal:** Teacher uploads an `.xlsx` file to bulk-import questions directly into a Quiz (or Assessment). Each upload job is tracked in `question_uploads`. Questions are saved to the Question Bank first, then mapped to the Quiz.

### Excel file format (row 1 = headers)
| Column | Required | Example |
|---|---|---|
| `question_text` | Yes | `What is the capital of France?` |
| `question_type` | Yes | `MCQ (Single)` / `MCQ (Multiple)` / `True/False` / `Fill in Blank` |
| `question_level` | Yes | `Easy` / `Medium` / `Hard` |
| `option_a` | MCQ only | `Paris` |
| `option_b` | MCQ only | `London` |
| `option_c` | No | `Berlin` |
| `option_d` | No | `Rome` |
| `correct_answer` | Yes | `A` / `B` / `C` / `D` / `TRUE` / `FALSE` / text |
| `explanation` | No | `Paris is the capital of France.` |
| `marks` | No (default from upload form) | `2` |
| `negative_marks` | No | `0.5` |
| `chapter_topic` | No | `World Geography` |
| `language` | No | `English` |
| `tags` | No | `geography, capitals` |

**Notes:**
1. Row 1 must be headers exactly as above.
2. `question_text`, `question_type`, `question_level`, `correct_answer` are mandatory for every row.
3. For MCQ: `option_a` and `option_b` are required; `option_c` / `option_d` optional.
4. For True/False: `correct_answer` must be `TRUE` or `FALSE`.
5. System validates ALL rows first; no partial imports on failure (atomic).
6. Duplicate `question_text` in the same upload shows a warning (not an error).

### Endpoints (to be implemented)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/questions/upload/quiz-template` | TEACHER, SUPER_ADMIN | Download starter `.xlsx` for quiz upload |
| POST | `/questions/upload/quiz` | TEACHER, SUPER_ADMIN | Multipart upload linked to a Quiz |

**Query params on `POST /questions/upload/quiz`:**
- `quizId=<id>` — **required** — which quiz to map questions to
- `dryRun=true` — validate only, write nothing
- `overrideExisting=true` — remove current quiz question mappings before import
- `defaultMarks=1` — fallback marks if column is blank
- `defaultNegMarks=0` — fallback negative marks if column is blank

### Test (once controller is implemented)
```powershell
$TEACHER = (curl -s -X POST http://localhost:5000/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d '{ "email": "teacher@epoch.local", "password": "Teacher@123" }' | ConvertFrom-Json).data.accessToken

# Download quiz-specific template
curl -H "Authorization: Bearer $TEACHER" -o quiz_template.xlsx `
     "http://localhost:5000/api/v1/questions/upload/quiz-template"

# Dry-run (validate only, no DB writes)
curl -X POST "http://localhost:5000/api/v1/questions/upload/quiz?quizId=$QUIZ&dryRun=true" `
  -H "Authorization: Bearer $TEACHER" -F "file=@quiz_template.xlsx"
# → { totalRows, validRows, invalidRows, errors: [{row, field, message}] }

# Real import into quiz
curl -X POST "http://localhost:5000/api/v1/questions/upload/quiz?quizId=$QUIZ&defaultMarks=1" `
  -H "Authorization: Bearer $TEACHER" -F "file=@quiz_template.xlsx"
# → { totalRows: 15, validRows: 15, rowsImported: 15, rowsFailed: 0, uploadId: "..." }

# Import with override (replaces existing quiz questions)
curl -X POST "http://localhost:5000/api/v1/questions/upload/quiz?quizId=$QUIZ&overrideExisting=true" `
  -H "Authorization: Bearer $TEACHER" -F "file=@quiz_template.xlsx"

# Check upload job status
curl -H "Authorization: Bearer $TEACHER" "http://localhost:5000/api/v1/question-uploads/<UPLOAD_ID>"
# → { uploadStatus: "SUCCESS", totalRows, rowsImported, rowsFailed, errorLog }
```

**Response shape (`QuizImportSummary`):**
```json
{
  "success": true,
  "message": "Import completed",
  "data": {
    "uploadId": "...",
    "totalRows": 15,
    "validRows": 14,
    "invalidRows": 1,
    "rowsImported": 14,
    "rowsFailed": 1,
    "dryRun": false,
    "errors": [
      { "row": 7, "field": "correct_answer", "message": "correct_answer must be A, B, C, or D for MCQ type" }
    ]
  }
}
```

---

## Module 15 — Publication & Book Admin (CRUD)

**Goal:** Super Admin and Publication Admin manage the full publication hierarchy.

### Endpoints (to be implemented)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/publications` | SUPER_ADMIN | List all publications |
| POST | `/publications` | SUPER_ADMIN | Create publication |
| GET | `/publications/:id` | SUPER_ADMIN, PUBLICATION_ADMIN (own) | Get one |
| PATCH | `/publications/:id` | SUPER_ADMIN | Update |
| GET | `/boards` | any | List boards (`?publicationId`) |
| POST | `/boards` | SUPER_ADMIN, PUBLICATION_ADMIN | Create board |
| GET | `/series` | any | List series (`?publicationId`) |
| POST | `/series` | SUPER_ADMIN, PUBLICATION_ADMIN | Create series |
| GET | `/classes` | any | List classes |
| POST | `/classes` | SUPER_ADMIN, PUBLICATION_ADMIN | Create class |
| GET | `/subjects` | any | List subjects (existing endpoint) |
| POST | `/subjects` | SUPER_ADMIN, PUBLICATION_ADMIN | Create subject |
| GET | `/books` | any | List books (`?publicationId`, `?boardId`, `?classId`, `?subjectId`) |
| POST | `/books` | SUPER_ADMIN, PUBLICATION_ADMIN | Create book |
| PATCH | `/books/:id` | SUPER_ADMIN, PUBLICATION_ADMIN | Update book |
| GET | `/books/:id/chapters` | any | List chapters for a book |
| POST | `/books/:id/chapters` | SUPER_ADMIN, PUBLICATION_ADMIN, TEACHER | Add chapter |

### Test (once controllers are implemented)
```powershell
$ADMIN = (curl -s -X POST http://localhost:5000/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d '{ "email": "admin@epoch.local", "password": "Admin@12345" }' | ConvertFrom-Json).data.accessToken

# Create a publication
$PUB = (curl -s -X POST http://localhost:5000/api/v1/publications `
  -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" `
  -d '{ "name": "Epoch Publishers", "email": "pub@epoch.com", "mobileNo": "9999999999" }' `
  | ConvertFrom-Json).data.id

# Create a board under it
$BOARD = (curl -s -X POST http://localhost:5000/api/v1/boards `
  -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" `
  -d "{ \"name\": \"CBSE\", \"publicationId\": \"$PUB\" }" | ConvertFrom-Json).data.id

# Create a series
$SERIES = (curl -s -X POST http://localhost:5000/api/v1/series `
  -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" `
  -d "{ \"name\": \"Gold Series 2025\", \"publicationId\": \"$PUB\" }" | ConvertFrom-Json).data.id

# Create a class
$CLASS = (curl -s -X POST http://localhost:5000/api/v1/classes `
  -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" `
  -d '{ "name": "Class 6", "serial": "6" }' | ConvertFrom-Json).data.id

# Create a subject
$SUBJECT = (curl -s -X POST http://localhost:5000/api/v1/subjects `
  -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" `
  -d '{ "name": "Mathematics", "slug": "mathematics" }' | ConvertFrom-Json).data.id

# Create a book
$BOOK = (curl -s -X POST http://localhost:5000/api/v1/books `
  -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" `
  -d "{
    \"name\": \"Maths Class 6 Gold CBSE\",
    \"publicationId\": \"$PUB\",
    \"boardId\": \"$BOARD\",
    \"seriesId\": \"$SERIES\",
    \"classId\": \"$CLASS\",
    \"subjectId\": \"$SUBJECT\",
    \"isbn\": \"978-81-XXXXX-XX-X\"
  }" | ConvertFrom-Json).data.id

# Add chapters to the book
curl -X POST "http://localhost:5000/api/v1/books/$BOOK/chapters" `
  -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" `
  -d '{ "name": "Chapter 1: Knowing Our Numbers", "serial": 1 }'

curl -X POST "http://localhost:5000/api/v1/books/$BOOK/chapters" `
  -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" `
  -d '{ "name": "Chapter 2: Whole Numbers", "serial": 2 }'

# List all books filtered by class
curl -H "Authorization: Bearer $ADMIN" "http://localhost:5000/api/v1/books?classId=$CLASS"
```

---

## All endpoints — updated cheat sheet

Base: `http://localhost:5000/api/v1`

```
# ── Health ──────────────────────────────────────────────────
GET    /health                                              public
GET    /health/db                                           public

# ── Auth ────────────────────────────────────────────────────
POST   /auth/register                                       public
POST   /auth/login                                          public
POST   /auth/refresh                                        public
POST   /auth/logout                                         public
GET    /auth/me                                             Bearer
POST   /auth/send-otp                                       public         (Module 13)
POST   /auth/verify-otp                                     public         (Module 13)

# ── Users ───────────────────────────────────────────────────
GET    /users                                               SUPER_ADMIN
GET    /users/teachers                                      SUPER_ADMIN
GET    /users/students                                      SUPER_ADMIN, TEACHER
GET    /users/:id                                           SUPER_ADMIN
POST   /users                                               SUPER_ADMIN
PATCH  /users/:id                                           SUPER_ADMIN
DELETE /users/:id                                           SUPER_ADMIN (soft)
GET    /users/me/stats                                      any
PATCH  /users/me                                            any
PATCH  /users/me/password                                   any

# ── Publication hierarchy ────────────────────────────────────
GET    /publications                                        SUPER_ADMIN    (Module 15)
POST   /publications                                        SUPER_ADMIN    (Module 15)
GET    /publications/:id                                    SUPER_ADMIN, PUBLICATION_ADMIN
PATCH  /publications/:id                                    SUPER_ADMIN
GET    /boards                                              any            (Module 15)
POST   /boards                                             SUPER_ADMIN, PUBLICATION_ADMIN
GET    /series                                              any            (Module 15)
POST   /series                                             SUPER_ADMIN, PUBLICATION_ADMIN
GET    /classes                                             any            (Module 15)
POST   /classes                                            SUPER_ADMIN, PUBLICATION_ADMIN
GET    /subjects                                            any
POST   /subjects                                           SUPER_ADMIN, PUBLICATION_ADMIN
GET    /books                                               any            (Module 15)
POST   /books                                              SUPER_ADMIN, PUBLICATION_ADMIN
PATCH  /books/:id                                          SUPER_ADMIN, PUBLICATION_ADMIN
GET    /books/:id/chapters                                  any            (Module 15)
POST   /books/:id/chapters                                 SUPER_ADMIN, PUBLICATION_ADMIN, TEACHER

# ── Assessments (existing) ───────────────────────────────────
GET    /assessments                                         any (auto-scoped)
POST   /assessments                                         TEACHER, SUPER_ADMIN
GET    /assessments/:id                                     any (scoped)
PATCH  /assessments/:id                                     owner / SUPER_ADMIN
DELETE /assessments/:id                                     owner / SUPER_ADMIN
POST   /assessments/:id/publish                             owner / SUPER_ADMIN
POST   /assessments/:id/unpublish                           owner / SUPER_ADMIN
POST   /assessments/:id/archive                             owner / SUPER_ADMIN
POST   /assessments/:id/start                               STUDENT, SUPER_ADMIN
GET    /assessments/:id/leaderboard                         scoped
GET    /assessments/:id/questions                           owner / SUPER_ADMIN
POST   /assessments/:id/questions                           owner / SUPER_ADMIN
PATCH  /assessments/:id/questions/reorder                   owner / SUPER_ADMIN
PATCH  /assessments/:id/questions/:questionId               owner / SUPER_ADMIN
DELETE /assessments/:id/questions/:questionId               owner / SUPER_ADMIN

# ── Questions (existing + extended) ─────────────────────────
GET    /questions                                           TEACHER, SUPER_ADMIN
POST   /questions                                           TEACHER, SUPER_ADMIN
GET    /questions/:id                                       owner / SUPER_ADMIN
PATCH  /questions/:id                                       owner / SUPER_ADMIN
DELETE /questions/:id                                       owner / SUPER_ADMIN
GET    /questions/upload/template                           TEACHER, SUPER_ADMIN (assessment Excel)
POST   /questions/upload                                    TEACHER, SUPER_ADMIN (assessment Excel)
GET    /questions/upload/quiz-template                      TEACHER, SUPER_ADMIN (Module 14)
POST   /questions/upload/quiz                               TEACHER, SUPER_ADMIN (Module 14)

# ── Submissions (existing) ───────────────────────────────────
GET    /submissions/me                                      STUDENT
GET    /submissions                                         TEACHER, SUPER_ADMIN
GET    /submissions/:id                                     scoped
POST   /submissions/:id/answer                              STUDENT (owner), SUPER_ADMIN
POST   /submissions/:id/submit                              STUDENT (owner), SUPER_ADMIN
PATCH  /submissions/:id/answers/:questionId/grade           TEACHER (owner), SUPER_ADMIN

# ── Quizzes (Module 11) ──────────────────────────────────────
GET    /quizzes                                             any (auto-scoped)
POST   /quizzes                                             TEACHER, SUPER_ADMIN
GET    /quizzes/:id                                         any (scoped)
PATCH  /quizzes/:id                                         owner / SUPER_ADMIN
DELETE /quizzes/:id                                         owner / SUPER_ADMIN
POST   /quizzes/:id/publish                                 owner / SUPER_ADMIN
POST   /quizzes/:id/unpublish                               owner / SUPER_ADMIN
POST   /quizzes/:id/archive                                 owner / SUPER_ADMIN
GET    /quizzes/:id/questions                               owner / SUPER_ADMIN
POST   /quizzes/:id/questions                               owner / SUPER_ADMIN
PATCH  /quizzes/:id/questions/:questionId                   owner / SUPER_ADMIN
DELETE /quizzes/:id/questions/:questionId                   owner / SUPER_ADMIN
GET    /quizzes/:id/leaderboard                             any (scoped)
GET    /quizzes/:id/attempts                                TEACHER (own quiz), SUPER_ADMIN

# ── Quiz Attempts (Module 12) ────────────────────────────────
POST   /quizzes/:id/attempts/start                          STUDENT
POST   /quiz-attempts/:id/answer                            owner
POST   /quiz-attempts/:id/submit                            owner
GET    /quiz-attempts/me                                    STUDENT
GET    /quiz-attempts/:id                                   owner / TEACHER / SUPER_ADMIN

# ── Leaderboard (existing + quiz) ────────────────────────────
GET    /leaderboard                                         any  (global assessment leaderboard)
GET    /quizzes/:id/leaderboard                             any  (per-quiz leaderboard)

# ── Upload jobs ───────────────────────────────────────────────
GET    /question-uploads/:id                                owner / SUPER_ADMIN
```
