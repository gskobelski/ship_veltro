---
name: backend-development-patterns
description: Apply when writing or modifying Python code in src/backend/ or src/virtuoso/. Contains rules for async patterns, error handling, logging, path handling, design patterns, LLM prompt safety, Virtuoso tool protocol, and infrastructure. Always invoke this skill before writing new Python code.
---

# Backend Development Patterns

Codified patterns and anti-patterns extracted from real code reviews in the Backend codebase. Apply these rules when writing or modifying Python code in this repository.

License: MIT-compatible project-internal usage

## When to Apply

- Writing new Python code in `src/backend/` or `src/virtuoso/`
- Modifying existing async handlers, LLM prompts, or tool implementations
- Adding logging, error handling, or network operations
- Working with Prometheus metrics, feature flags, or file outputs

## Rule Categories

### 1. Async Patterns

Prevent event loop blocking, optimize resource loading, and ensure proper cleanup.

| Rule | File | Severity |
|------|------|----------|
| Blocking I/O in Async Context | `rules/async-blocking-io.md` | HIGH |
| Loading Resources at Wrong Time | `rules/async-resource-loading.md` | HIGH |
| Async Client Sessions Without Cleanup | `rules/async-unclosed-session.md` | MEDIUM |

### 2. Error Handling

Catch the right exceptions and avoid swallowing errors.

| Rule | File | Severity |
|------|------|----------|
| Overly Broad Try/Except | `rules/error-broad-try-except.md` | HIGH |
| Avoid Log and Reraise | `rules/error-log-and-reraise.md` | MEDIUM |
| Unnecessary Try/Except with Reraise | `rules/error-unnecessary-reraise.md` | LOW |

### 3. Logging

Protect PII, use correct levels, and keep Sentry clean.

| Rule | File | Severity |
|------|------|----------|
| Sensitive Information in Logs | `rules/logging-sensitive-info.md` | HIGH |
| Improper Use of logger.exception() | `rules/logging-exception-method.md` | MEDIUM |
| Multiple Warning Logs for Same Condition | `rules/logging-multiple-warnings.md` | MEDIUM |
| Inappropriate Log Levels | `rules/logging-levels.md` | LOW |
| F-String Formatting in Log Messages | `rules/logging-fstring-format.md` | LOW |

### 4. Path Handling

Use proper path construction and avoid fragile parent chains.

| Rule | File | Severity |
|------|------|----------|
| Hardcoded Relative Paths with .parent Chains | `rules/path-parent-chains.md` | HIGH |
| Using String Concatenation for Paths | `rules/path-string-concat.md` | MEDIUM |

### 5. Design Patterns

Write clear, maintainable code with proper data flow.

| Rule | File | Severity |
|------|------|----------|
| Use Pydantic model_validate Instead of Manual Parsing | `rules/design-pydantic-model-validate.md` | HIGH |
| Mutation as Side Effect via Function Parameters | `rules/design-mutation-side-effect.md` | HIGH |
| Validate Preconditions Early | `rules/design-precondition-checks.md` | MEDIUM |
| Add Size Limits to Pydantic Fields | `rules/design-pydantic-field-limits.md` | MEDIUM |
| Prefer Composition Over Inheritance for Shared Utilities | `rules/design-composition-over-inheritance.md` | MEDIUM |
| Avoid Duplicated Logic Within a Module | `rules/design-avoid-code-duplication.md` | MEDIUM |
| No Trivial or AI-Generated Comments | `rules/design-no-trivial-comments.md` | MEDIUM |
| Use Function/Method Arguments | `rules/design-use-arguments.md` | MEDIUM |
| Inconsistent Parameter Relationships | `rules/design-parameter-relationships.md` | MEDIUM |
| Early Return Pattern Not Used | `rules/design-early-return.md` | LOW |
| Leftover Files and Unused Code | `rules/design-leftover-code.md` | LOW |

### 6. LLM Prompts

Keep prompts maintainable and secure.

| Rule | File | Severity |
|------|------|----------|
| Manual Schema Maintenance Instead of Using Pydantic | `rules/llm-manual-schema.md` | MEDIUM |
| Hardcoded Examples in LLM Prompts | `rules/llm-hardcoded-examples.md` | MEDIUM |
| External Data Without Injection Protection | `rules/llm-injection-protection.md` | MEDIUM |

### 7. Tool Protocol

Virtuoso and Neon Make tool result handling.

| Rule | File | Severity |
|------|------|----------|
| Yielding Multiple Tool Results | `rules/tool-multiple-yields.md` | HIGH |
| Storing Multiple Tool Results/Errors | `rules/tool-multiple-results.md` | HIGH |
| Type Coercion in get_tool_arg | `rules/tool-arg-coercion.md` | LOW |

### 8. Infrastructure

Dependencies, networking, metrics, and feature flags.

| Rule | File | Severity |
|------|------|----------|
| Unvalidated Dependency Upgrades | `rules/infra-dependency-upgrades.md` | HIGH |
| Network Operations Without Timeout | `rules/infra-network-timeout.md` | MEDIUM |
| Missing File Saver Usage | `rules/infra-file-saver.md` | MEDIUM |
| Keyword Arguments for Prometheus Labels | `rules/infra-prometheus-kwargs.md` | MEDIUM |
| Positive Logic in Feature Flags | `rules/infra-feature-flag-logic.md` | MEDIUM |

## Full Reference

See `AGENTS.md` in the backend codebase for the compiled reference when available.
