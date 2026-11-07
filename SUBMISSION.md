# Round 2 submission notes: BrandGuard AI

Team InnovaTOR (solo): Aditya Yadav, Solo Developer and Project Lead.
Fill in before submitting: working project link, repository link.

## Completed features

**Source library (admin)**
- Upload PDF, DOCX, TXT, MD or paste text. Sections starting with "§n" or numbered headings become citable chunks; PDF chunks carry page numbers.
- Each source has an owner, version, status (approved, draft, obsolete) and effective date. Only approved sources whose effective date has arrived are used as evidence. The seeded demo includes an obsolete product sheet and a draft offer to prove they are never cited.
- Terminology list, claim and tone rules (with optional source citation), brand palette. All editable by the admin and applied on the next check.

**Checking**
- Deterministic checks: terminology, guarantee and instant-settlement claims, unqualified fee claims, superlatives, exclamation marks, all-caps, missing image alt text, WCAG 2.2 contrast of supplied colour pairs with a palette-based fix, off-palette colours, instructions aimed at an AI reviewer, and numbers that appear in no approved source.
- Optional AI claim verification with evidence binding (see README). Outcomes: supported, contradicted, insufficient evidence.
- Every finding shows severity, the exact highlighted span, the rationale, the cited source title, version and section with the real excerpt, and a suggested rewrite.

**Workflow**
- Roles: creator, reviewer, admin, enforced server-side. Creators cannot approve their own work; reviewers cannot create drafts.
- States: Draft, In review, Changes requested, Approved, Rejected. Drafts are locked while in review.
- Apply a fix with one click or apply all, edit freely, dispute with a reason, dismiss or uphold (reviewer), comment, version history with word-level diff.
- Approval is bound to the content fingerprint (SHA-256 over content and colours). Editing approved content cancels the approval and records why. High-severity findings block approval unless a reviewer writes an override, which is recorded.
- Audit trail of every action with the policy snapshot used for each check.

**Insights**
- Mistakes caught on first check, issues still open, most repeated checks, rules that people dismissed or disputed (a sign the guideline may be unclear), overrides, cancelled approvals, injection attempts, time to approval.

**Responsible design**
- Rules-only mode is always available and disclosed in the interface. AI provider and what is sent to it are disclosed on the login page, footer and library.
- Prompt-injection text in a draft is surfaced as a finding and never changes workflow state.
- Partially readable files are reported as partially evaluated.

## Technology and implementation

Next.js 14 and TypeScript (UI and API routes), Tailwind, PostgreSQL (`pg`) with embedded PGlite for local use, `unpdf`, `mammoth`, OpenAI or Anthropic chat APIs, OpenAI embeddings (optional). No UI kit or template was used. Fonts: Public Sans and Source Serif 4 via Fontsource.

The code was written with an AI coding assistant (Claude) in the build window and then run, tested and reviewed by the participant. The PayNova documents and sample drafts are invented.

Models used: configurable. Defaults are `gpt-4.1-mini` for OpenAI and `claude-haiku-5-5` for Anthropic, plus `text-embedding-3-small`. Replace with whatever you actually deploy with.

## Changes from the Round 1 plan

| Plan | Built | Why |
|---|---|---|
| Next.js plus separate FastAPI service | One Next.js app with API routes | One deployable unit; less to break in a 3-day build. |
| pgvector | Embeddings stored as JSONB, cosine computed in app, blended with BM25 | Works on any Postgres and locally with no extension; corpus per workspace is small. Still hybrid retrieval. |
| PNG/JPG checks in Round 2 | Deferred to Round 3 | Priority was the complete text approval loop. |
| Approved facts as separate records | Approved facts live as versioned, sectioned source documents | Keeps every citation traceable to a document version and section. |
| Not planned | Deterministic numeric verifier | Found during testing that wrong figures passed silently in rules-only mode. |

## Three improvements for Round 3

1. **Image and creative checks.** Upload PNG or JPG, read dimensions and dominant colours, compare with the palette, sample foreground and background for contrast, and flag missing alt text, with the limits stated.
2. **Policy-change impact.** When a source is edited, retired or approved, re-run the affected drafts and flag approvals whose basis changed, with a before and after comparison of findings.
3. **Guideline clarity analytics and benchmark.** Run a labelled benchmark of 60 to 100 synthetic drafts to report precision, recall and citation correctness, and turn dismissed and disputed patterns into suggested wording improvements for the admin to accept or reject.

## Verification performed

- 55 automated workflow, permission and integrity checks passed on a production build without an AI key.
- PDF (page-aware citations), DOCX and text uploads tested with generated files; empty and unsupported files return clear errors.
- 18 automated checks of the AI path passed against a scripted mock model, including a fake evidence ID being downgraded and an invented quote being discarded.
- A browser walkthrough of the full journey ran with no console errors.
- `npm audit` reports advisories against Next.js 14 (image optimizer, rewrites, middleware, CSP nonce features this app does not use, plus Server Components denial-of-service issues). Fixing them means moving to Next.js 15 or later, which is planned for Round 3. Not yet done: accuracy measured with a real model, interviews or structured user feedback, multi-tenant isolation tests, accessibility audit with assistive technology.

## Honest limitations

Demo personas instead of real authentication; no OCR; claim extraction quality depends on the chosen model; the demo has one workspace; no primary user research yet.
