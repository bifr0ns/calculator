# AI usage

This project was built with **Claude Code** (the VS Code extension), using the **Claude Opus 5.5** model, in a single session.

**How the AI was used:**

- proposing the architecture and the API contract;
- writing the backend and frontend code and tests;
- running tests, coverage, builds and end-to-end checks;
- reviewing the finished code.

**Decisions made by the developer:**

- the single endpoint and the `/api/v1` path;
- 422 for arithmetic errors;
- the operation picker with a Calculate button;
- which review findings to fix;
- when to commit.

The developer also ran and checked the UI by hand.

The six main prompts appear below **exactly as written**. The shorter follow-up messages in between (answers, approvals, questions) are **summarized** rather than quoted. The AI's replies aren't included.

---

## 1. Architecture

**Prompt:**

```text
You are a senior software engineer helping me complete a time-boxed technical assignment for Sezzle.

The assignment is to build a full-stack calculator with:
- React and TypeScript frontend
- Go backend with REST API
- Addition, subtraction, multiplication and division
- Input validation and error handling
- Unit tests for both layers
- README with instructions, API examples and design decisions

Constraints:
- Target completion time: 2–4 hours.
- Prioritize correctness, readability, maintainability and testability.
- Avoid overengineering, unnecessary dependencies and advanced features.
- Prefer Go standard library for the backend.

Before writing any code:
1. Propose a minimal project structure.
2. Define the REST API contract and error responses.
3. Explain the main architectural decisions and tradeoffs.
4. Identify important edge cases.
5. Propose a realistic implementation plan.

Do not implement anything yet. I want to review the architecture first.
```

**Follow-ups (summarized):**

- Chose one endpoint with the operation in the body, and the simpler form-style UI.
- Asked why division by zero should return 422; after the explanation, kept 422.
- Asked the AI to check that Go and Node were installed.
- Approved the scaffolding step.
- Chose `main` as the branch name.

## 2. Backend

**Prompt:**

```text
Implement the Go backend using the approved architecture.

Requirements:
- Use the Go standard library wherever practical.
- Expose POST /api/v1/calculate.
- Accept JSON containing an operation and two numeric operands.
- Support add, subtract, multiply and divide.
- Return consistent JSON responses for success and failure.
- Validate malformed JSON, missing fields, invalid types, unsupported operations and division by zero.
- Reject non-finite results that cannot be represented in JSON.
- Separate business logic from HTTP concerns.
- Add unit tests for arithmetic operations and HTTP handlers using testing and httptest.

Keep the implementation small and idiomatic.

After implementation, run the tests and explain any design decisions that are not immediately obvious.
```

**Follow-ups (summarized):**

- Asked how to run and test the backend by hand.
- Asked for the frontend architecture. The AI proposed one and offered two ways to choose the operation.

## 3. Frontend

**Prompt:**

```text
Yes commit. Let's go with Option B: operation selector + calculate button.

I approve the proposed frontend architecture. Please proceed with the implementation using the existing backend API contract.

A few adjustments and requirements:

1. Keep the proposed separation between `numbers.ts`, `calculatorClient.ts`, and `Calculator.tsx`. Avoid adding unnecessary abstractions.

2. Use a proper HTML form so users can calculate by clicking the button or pressing Enter.

3. When users edit an operand or change the selected operation, clear the previous result to avoid displaying stale information.

4. Keep the current numeric input validation approach, but review `formatResult()` carefully. Test floating-point precision, very small values, very large values, and negative zero. Formatting must not introduce misleading results.

5. The backend must remain the single source of truth for calculations and arithmetic errors.

6. Keep the proposed discriminated union for API responses and ensure network failures, invalid responses, and backend errors are handled consistently.

7. Implement the proposed unit and component tests, including keyboard submission and result clearing when inputs change.

8. Keep the UI clean, responsive, accessible, and visually polished without adding a large UI framework.

9. Before starting the frontend, commit the backend only if all existing backend tests pass. Do not modify the backend contract unless absolutely necessary.

Once implementation is complete:
- Run the frontend tests.
- Run the TypeScript type check.
- Run the production build.
- Generate a test coverage report.
- Report the actual results and any remaining issues.
- Do not create the final README yet; we will review the implementation first.

Prioritize correctness, simplicity, and maintainability over additional features.
```

**Follow-ups (summarized):**

- Asked how to run the frontend after PowerShell refused to run `npm` (scripts were disabled on the system).
- Confirmed the UI looked good. Asked to fix the vague error shown when the backend is down; it now says "Could not reach the server".
- Approved adding `.gitattributes` (LF line endings) and committing the frontend.

## 4. End-to-end review

**Prompt:**

```text
Review and test the full-stack application end to end.

Verify the following scenarios:
- Each of the four operations works correctly.
- Negative and decimal numbers work correctly.
- Division by zero returns a meaningful error.
- Empty inputs are rejected.
- Malformed JSON and invalid operand types are rejected.
- Unsupported operations return a proper error.
- Repeated calculations update the result correctly.
- Backend errors are displayed clearly in the frontend.
- The application remains usable on mobile screen sizes.

Run the backend and frontend tests, report actual coverage, and identify missing important test cases.

Fix correctness issues and regressions first. Do not add optional features during this review.
```

**Follow-up (summarized):**

- Approved committing the fixes: long results no longer break across lines on phones, buttons no longer stay highlighted after a tap, and one missing backend test was added.

## 5. Strict code review

**Prompt:**

```text
Act as a strict senior engineer reviewing this submission for a backend/full-stack engineering interview.

Evaluate:
1. Correctness and edge cases.
2. Go idioms and error handling.
3. React and TypeScript best practices.
4. API design and consistency.
5. Unit test quality and coverage.
6. Readability and unnecessary complexity.
7. Security and input validation.
8. Missing assignment requirements.

Categorize findings as Critical, Important or Nice-to-have.

Be specific: reference affected files and explain why each issue matters.

Do not refactor the application yet. Give me a prioritized review that I can evaluate before making changes.
```

**Follow-ups (summarized):**

- Chose which findings to fix:
  - **I1:** the UI rejects numbers with more digits than a double can hold exactly.
  - **I3:** the API rejects field names in the wrong case and duplicate fields. Only documenting this was offered as an alternative and rejected.
  - **N3, N4, N8, N10:** a fresh internal-error value, closing connections when shutdown times out, requiring `Content-Type: application/json`, and recovering if the API client throws.
- Asked for the changes as two commits, one for the backend and one for the frontend.

## 6. Documentation

**Prompt:**

```text
Prepare a concise, professional README for this technical assignment.

Include:
- Project overview and tech stack.
- Prerequisites.
- Backend and frontend setup commands.
- How to run tests and generate coverage reports.
- REST API request and response examples.
- Architecture and design decisions.
- Assumptions, tradeoffs and known limitations.

Only document functionality and commands that actually exist and have been verified.

Keep the README easy for an interviewer to follow. Do not overstate test coverage or claim functionality that has not been implemented.

Also prepare an AI_USAGE.md file documenting the actual AI prompts used during development, without inventing or altering their wording.
```

**Follow-up (summarized):**

- Asked to shorten this file: keep the main prompts word for word and summarize the short ones.
