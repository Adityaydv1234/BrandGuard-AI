# BrandGuard AI

Evidence-grounded brand review before content goes live. Built for the Inkloom AI problem statement, CodeNexus India 2026, Round 2 (team InnovaTOR, solo: Aditya Yadav).

A creator submits a draft. BrandGuard checks it against the organisation's **approved** facts, voice guide, terminology and palette, explains each finding with the cited source excerpt, suggests a correction that keeps the creator's intent, and hands the decision to a named human reviewer. An approval is bound to the exact content fingerprint, so editing approved copy cancels the approval.

The demo workspace is a fictional payments company, PayNova. All documents are invented.

## Run it on your laptop

Requirements: Node.js 18.18 or newer.

```bash
npm install
cp .env.example .env.local      # then edit it (see below)
npm run dev
```

Open http://localhost:3000. The first request creates and seeds an embedded Postgres (PGlite) in `./.pglite`, so no database setup is needed. Delete that folder to reset the demo data.

`.env.local` (all optional):

```
OPENAI_API_KEY=sk-...        # or ANTHROPIC_API_KEY=...
SESSION_SECRET=any-long-random-string
```

With no key the app runs in **rules-only mode** and says so on screen. With a key it adds AI claim verification. OpenAI additionally enables embedding retrieval (hybrid search). With only an Anthropic key, retrieval is keyword (BM25) only.

## Using a free AI key instead of OpenAI or Anthropic

Any service with an OpenAI-compatible API works. For Google Gemini's free tier, create a key in Google AI Studio and set these in `.env.local` (or Vercel):

```
OPENAI_API_KEY=<your Gemini key>
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_MODEL=gemini-flash-latest
EMBEDDING_MODEL=gemini-embedding-001
```

Check the model name in AI Studio if a request is rejected. If the embedding call fails the app falls back to keyword search automatically. Free tiers have rate limits, and free-tier prompts may be used by the provider to improve its products, so use only the fictional demo data. This route has not been tested against the live Gemini service; only against a local mock.

The app shows the host that receives draft text on the login page and footer.

## Try the workflow (about 2 minutes)

1. Sign in as **Priya (creator)**. Open *New draft*, choose **Risky festive campaign**, select *Check draft*.
2. Read each finding next to its cited source. Select *Apply all suggested fixes*, then *Save as version 2*.
3. *Submit for review*. Switch to **Arjun (reviewer)** from the top bar. Open the draft and approve, or request changes.
4. Switch back to Priya and edit the approved draft. The approval is shown as no longer applying.
5. As **Meera (admin)**, open *Sources and rules*: upload a PDF/DOCX, approve or retire a source, add terms and rules. Open *Insights* for repeated mistakes and disputed rules.

Other samples: an accurate LinkedIn post (no findings) and an agency email containing a hidden instruction aimed at the AI reviewer.

## How a check works

1. **Deterministic rules first** (always run, reproducible): terminology, claim phrases (guarantees, instant settlement, zero fees), superlatives, exclamation marks and all caps, images without alt text, WCAG 2.2 contrast of supplied colour pairs, off-palette colours, instructions aimed at an AI reviewer, and **numbers that appear in no approved source**.
2. **AI claim verification** (optional): the model extracts atomic claims, the app retrieves candidate evidence only from sources that are *approved* and *effective*, and the model returns supported, contradicted or insufficient. Guards in code:
   - quoted text must exist verbatim in the draft, or the claim is discarded;
   - a supported or contradicted verdict must cite evidence IDs that were actually offered, otherwise it is downgraded to **insufficient evidence**;
   - when a deterministic rule already covers a span, the rule finding wins;
   - submitted text and retrieved text are treated as data, never as instructions.
3. **Human decision**: high-severity findings block approval unless a reviewer writes an override (at least 15 characters). Creators cannot approve their own drafts. Every action is written to an audit log with the policy snapshot used.

## Architecture

| Part | Choice |
|---|---|
| App | Next.js 14 (App Router), TypeScript, Tailwind. API routes under `app/api`. |
| Database | PostgreSQL via `pg` when `DATABASE_URL` is set; embedded PGlite otherwise. |
| Retrieval | BM25 over eligible chunks, blended with OpenAI embeddings (stored as JSONB, cosine in app) when available. |
| Documents | `unpdf` (PDF, page-aware citations), `mammoth` (DOCX), plain text, markdown, HTML. |
| Models | OpenAI chat or Anthropic messages, chosen by whichever key is present. Configurable with `LLM_PROVIDER`, `LLM_MODEL`. |
| Auth | Demo personas with a signed, HTTP-only cookie. Roles enforced on the server. |

Key files: `lib/analysis.ts` (engine), `lib/workflow.ts` (state machine, permissions, insights), `lib/repo.ts` (policy context, versioning, audit), `lib/seed.ts` (demo data), `components/Review.tsx` (proof view).

Data model: workspaces, users, sources, chunks, terms, rules, submissions, versions (immutable, with content hash and policy snapshot), findings, comments, decisions, audit.

## Tests

```bash
npm run build && npm run start          # in one terminal (port 3000)
npm test                                # 55 workflow, role and integrity checks
```

`npm run test:ai` runs 18 checks of the AI path against `tests/mock-openai.mjs`, a scripted model that misbehaves on purpose (fake evidence IDs, invented quotes). Start it with `node tests/mock-openai.mjs`, then start the app on port 3112 with `OPENAI_API_KEY=x OPENAI_BASE_URL=http://localhost:4010/v1`. These tests prove the guards work; they do not measure real model accuracy.

## Deploy (Vercel + Neon, about 15 minutes)

1. Push this folder to a public GitHub repository.
2. Create a free Postgres at neon.tech and copy its connection string.
3. Import the repository in Vercel. Add environment variables: `DATABASE_URL`, `SESSION_SECRET`, and `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`.
4. Deploy, then open the URL in a private window and run the walkthrough above.

Do not deploy without `DATABASE_URL`: the embedded database does not persist on serverless hosts.

## Privacy and AI disclosure

- API keys stay on the server. Only the draft text and the few approved excerpts needed to verify a claim are sent to the configured provider. Source libraries are not sent in full.
- Queries are scoped by workspace id; the demo has one workspace, so cross-tenant isolation has not been tested.
- AI-assisted development: this codebase was written with an AI coding assistant (Claude) and reviewed and tested by the participant. See SUBMISSION.md.

## Known limitations

- Demo login has no passwords. Production would need real identity and SSO.
- Scanned PDFs are not OCR'd; the app warns that those pages were not evaluated.
- Image files are not analysed yet (Round 3). Colour checks use pairs the creator supplies.
- Claim extraction quality depends on the model; precision and recall are not yet measured on a labelled benchmark.
- No interviews or user studies have been run yet.
