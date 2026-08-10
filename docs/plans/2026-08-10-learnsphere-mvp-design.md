# LearnSphere MVP Design

Date: 2026-08-10
Status: Approved for implementation

## 1. Product goal

LearnSphere turns public technical documentation into source-grounded practice. A learner pastes a link, selects one or more detected chapters, generates a configurable quiz, receives a score, reviews attempts, and asks an AI tutor follow-up questions that remain tied to the source and the current question.

The MVP is intentionally local-first. It has no account system and no server-side database. Learning data remains in the browser. A user-supplied OpenAI-compatible API key is sent only with the request that needs it and is never persisted or logged by the server.

## 2. Confirmed product decisions

- Audience: developers, university students, and AI learners using public technical documentation.
- Sources: normal public articles, GitHub Markdown, and documentation sites such as Docsify or VitePress. The supplied Hello-Agents URL is a required acceptance case.
- Scope selection: detect a chapter tree when possible; default to the linked chapter; allow one or more chapters.
- Quiz setup: quick presets plus custom question counts, types, and difficulty.
- Default standard quiz: four single-choice, two multiple-choice, two true/false, and two short-answer questions.
- Scoring: 100 points; objective questions total 70 points and short answers total 30 points. Multiple-choice questions support bounded partial credit. Short answers use a source-grounded rubric and show criterion-level reasoning.
- Tutor: available during the quiz but operates in guided mode. It explains concepts and provides hints without revealing the answer. After submission it may explain the answer directly.
- Language: follow the source language automatically with an explicit override.
- Storage: attempts, sources, quizzes, and settings stay in the browser. The API key defaults to session-only storage with an opt-in “remember on this device” setting.
- Deployment: local development plus production deployment at `learnsphere.nianan.ggff.net` behind HTTPS.

## 3. Technical architecture

### Application

- Next.js App Router with TypeScript.
- React Server Components for the static shell and route boundaries; client components only for interactive study state.
- Purpose-built CSS using semantic design tokens instead of a generic component template.
- Zod schemas at every network and persistence boundary.
- IndexedDB for durable local learning data; sessionStorage/localStorage only for the small API connection settings record.

### Server routes

The server is stateless and exposes narrow endpoints:

- `POST /api/sources/inspect`: validate and fetch a public URL, extract readable content, discover chapters when possible, and return normalized source metadata.
- `POST /api/sources/load`: load selected chapters and return clean Markdown-like text with section locators.
- `POST /api/ai/test`: verify the user’s provider URL, model, and key.
- `POST /api/ai/generate`: produce a source-grounded structured quiz.
- `POST /api/ai/grade`: evaluate short answers against explicit rubrics.
- `POST /api/ai/tutor`: answer a contextual learning question in guided or review mode.

No endpoint writes user content or credentials to server storage.

### Data model

- `SourceDocument`: URL, title, language, detected chapters, normalized sections, content hash, imported timestamp.
- `Quiz`: source references, generation settings, version, questions, and creation timestamp.
- `Question`: type, prompt, options, correct answer, rubric, explanation, difficulty, knowledge tags, source locator, and supporting excerpt.
- `Attempt`: quiz snapshot, per-question responses, assistance events, criterion scores, final score, status, and timestamps.
- `TutorThread`: question/attempt context plus learner and assistant messages. It references content already stored locally rather than duplicating the whole source.

All persisted records include a schema version so migrations can be added without silently corrupting browser data.

## 4. Data flow

1. The browser sends a URL to the inspection endpoint.
2. The server validates the destination against SSRF rules, fetches it with bounded redirects and timeouts, and applies a source adapter.
3. The learner selects chapters and a quiz preset.
4. Selected source sections and AI connection settings are sent to the generation endpoint.
5. The server requests strict JSON from the configured model, validates and repairs safe structural issues, rejects unsupported questions, and returns the quiz.
6. The browser saves the source and quiz in IndexedDB, then starts an attempt.
7. Objective answers are evaluated deterministically in the browser. Short answers are graded in parallel through the grading endpoint when the quiz is submitted.
8. The completed attempt is stored locally and becomes available to the history and review screens.
9. Tutor requests include the relevant source excerpt, question, learner answer, assistance state, and quiz phase so the server can enforce guided mode during an active attempt.

## 5. Source adapters

Adapters run in a deterministic order:

1. GitHub blob/raw adapter: convert public GitHub file URLs to raw content and use repository paths for chapter identity.
2. Docsify adapter: interpret the hash route, probe the matching Markdown path, and read `_sidebar.md` when available.
3. Static documentation adapter: extract navigation links and the primary article region.
4. Generic article adapter: use semantic article/main content, then fall back to readability scoring.

Each source section retains a stable locator and a short excerpt. Questions without a valid locator and supporting excerpt are rejected.

## 6. AI boundary

Provider configuration contains `baseUrl`, `apiKey`, and `model`. The adapter targets the OpenAI-compatible chat-completions contract while keeping provider-specific assumptions isolated in one module.

Generation uses a strict schema and requests balanced coverage across selected chapters. A second validation pass checks answer uniqueness, option shape, rubric totals, source support, and duplicated prompts before a quiz is accepted.

The tutor prompt treats source text as untrusted quoted material, not instructions. In guided mode it must not disclose the correct option or reproduce the reference answer. Assistance is recorded on the attempt so the learner can distinguish independent and assisted performance.

## 7. Scoring rules

- Single-choice and true/false: full credit only for an exact match.
- Multiple-choice: `max(0, correct selections / correct options - incorrect selections / incorrect options) × points`, capped at the question’s point value.
- Short answer: criterion-level points sum to the question value. Every awarded or missed criterion requires a short reason grounded in the source.
- If AI grading fails, objective results are preserved and the short answer is marked “grading pending” with a retry action.
- A final score is only authoritative when all short answers have been graded.

## 8. Interface structure

- Home: URL-first import action, recent learning activity, and an instructive empty state.
- Import workspace: source preview, chapter tree, language selection, and quiz preset configuration.
- Quiz player: one primary question surface, visible progress, answer controls, and a persistent contextual tutor panel.
- Results: score reveal, independent-versus-assisted summary, knowledge-tag breakdown, and question review.
- History: filters for status, question type, chapter, knowledge tag, and date; retake and continue-review actions.
- Settings: provider URL, model, key retention choice, theme, and connection test.

The visual system follows `.impeccable.md`: cobalt blue, acid lime, coral orange, warm tinted neutrals, bold game feedback, dual themes, strong keyboard focus, and reduced-motion support. It explicitly avoids purple AI gradients, decorative glass, glowing chatbot motifs, and repetitive card grids.

## 9. Error handling and security

- Allow only HTTP(S) input URLs; require HTTPS for configured AI providers outside local development.
- Resolve hostnames and reject loopback, link-local, private, multicast, and metadata-service addresses before every fetch and redirect.
- Bound response size, redirect count, and request duration; accept only supported text content types.
- Validate every request on the server and return specific, recoverable Chinese error messages.
- Never include API keys in logs, URLs, thrown error messages, persisted attempts, or analytics.
- Sanitize imported HTML and render normalized text rather than arbitrary source markup.
- Apply request throttling hooks suitable for a single-node deployment.
- Preserve learner input across retryable failures and prevent duplicate generation/submission.

## 10. Testing strategy

- Unit tests: URL safety, source adapters, schema normalization, point allocation, objective scoring, multiple-choice partial credit, and persistence migrations.
- Route tests: invalid input, unsupported source, redirects, timeouts, provider errors, malformed model JSON, and partial grading failure.
- Component tests: keyboard answer selection, theme switching, filters, loading/error states, and tutor mode labels.
- End-to-end smoke test: import the Hello-Agents chapter, configure a mocked compatible model, generate a quiz, submit it, filter an incorrect answer, and open a contextual tutor thread.
- Production checks: lint, typecheck, unit tests, build, accessibility scan, mobile viewport, long CJK content, dark theme, and reduced motion.

## 11. Delivery increments

1. Design and architecture baseline.
2. Next.js project and quality toolchain.
3. Design system, application shell, theme, and local persistence.
4. Secure source inspection, chapter discovery, and loading.
5. Provider settings, connection testing, and structured quiz generation.
6. Quiz player, deterministic scoring, and short-answer grading.
7. Guided tutor, results, history, and filtering.
8. Hardening, documentation, deployment configuration, and production release.

Each increment must pass its relevant tests and build before it is committed. Commit messages use Conventional Commits with a scoped title and a body that records behavior, safety properties, and verification.
