---
name: vercel-react-best-practices
description: Use when writing, reviewing, or refactoring React or Next.js code to follow Vercel performance patterns for components, pages, data fetching, bundle optimization, rendering, and client/server boundaries.
---

# Vercel React Best Practices

Comprehensive performance optimization guide for React and Next.js applications based on Vercel Engineering guidance. Use these rules to steer code generation, reviews, and refactors toward faster and leaner React and Next.js code.

License: MIT
Source style: Vercel Engineering guidance
Version: 1.0.0

## When to Apply

- Writing new React components or Next.js pages
- Implementing data fetching on the server or client
- Reviewing code for performance issues
- Refactoring existing React or Next.js code
- Optimizing bundle size or load times

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Eliminating Waterfalls | CRITICAL | `async-` |
| 2 | Bundle Size Optimization | CRITICAL | `bundle-` |
| 3 | Server-Side Performance | HIGH | `server-` |
| 4 | Client-Side Data Fetching | MEDIUM-HIGH | `client-` |
| 5 | Re-render Optimization | MEDIUM | `rerender-` |
| 6 | Rendering Performance | MEDIUM | `rendering-` |
| 7 | JavaScript Performance | LOW-MEDIUM | `js-` |
| 8 | Advanced Patterns | LOW | `advanced-` |

## Quick Reference

### 1. Eliminating Waterfalls

- `async-defer-await` - Move await into branches where actually used
- `async-parallel` - Use `Promise.all()` for independent operations
- `async-dependencies` - Use better-all for partial dependencies
- `async-api-routes` - Start promises early, await late in API routes
- `async-suspense-boundaries` - Use Suspense to stream content

### 2. Bundle Size Optimization

- `bundle-barrel-imports` - Import directly, avoid barrel files
- `bundle-dynamic-imports` - Use `next/dynamic` for heavy components
- `bundle-defer-third-party` - Load analytics or logging after hydration
- `bundle-conditional` - Load modules only when a feature is activated
- `bundle-preload` - Preload on hover or focus for perceived speed

### 3. Server-Side Performance

- `server-auth-actions` - Authenticate server actions like API routes
- `server-cache-react` - Use `React.cache()` for per-request deduplication
- `server-cache-lru` - Use LRU cache for cross-request caching
- `server-dedup-props` - Avoid duplicate serialization in RSC props
- `server-serialization` - Minimize data passed to client components
- `server-parallel-fetching` - Restructure components to parallelize fetches
- `server-after-nonblocking` - Use `after()` for non-blocking operations

### 4. Client-Side Data Fetching

- `client-swr-dedup` - Use SWR for automatic request deduplication
- `client-event-listeners` - Deduplicate global event listeners
- `client-passive-event-listeners` - Use passive listeners for scroll
- `client-localstorage-schema` - Version and minimize localStorage data

### 5. Re-render Optimization

- `rerender-defer-reads` - Do not subscribe to state used only in callbacks
- `rerender-memo` - Extract expensive work into memoized components
- `rerender-memo-with-default-value` - Hoist default non-primitive props
- `rerender-dependencies` - Use primitive dependencies in effects
- `rerender-derived-state` - Subscribe to derived booleans, not raw values
- `rerender-derived-state-no-effect` - Derive state during render, not effects
- `rerender-functional-setstate` - Use functional `setState` for stable callbacks
- `rerender-lazy-state-init` - Pass function to `useState` for expensive values
- `rerender-simple-expression-in-memo` - Avoid memo for simple primitives
- `rerender-move-effect-to-event` - Put interaction logic in event handlers
- `rerender-transitions` - Use `startTransition` for non-urgent updates
- `rerender-use-ref-transient-values` - Use refs for transient frequent values

### 6. Rendering Performance

- `rendering-animate-svg-wrapper` - Animate a wrapper, not the SVG element
- `rendering-content-visibility` - Use `content-visibility` for long lists
- `rendering-hoist-jsx` - Extract static JSX outside components
- `rendering-svg-precision` - Reduce SVG coordinate precision
- `rendering-hydration-no-flicker` - Use inline script for client-only data
- `rendering-hydration-suppress-warning` - Suppress expected mismatches
- `rendering-activity` - Use Activity component for show and hide
- `rendering-conditional-render` - Use ternary, not `&&`, for conditionals
- `rendering-usetransition-loading` - Prefer `useTransition` for loading state

### 7. JavaScript Performance

- `js-batch-dom-css` - Group CSS changes via classes or `cssText`
- `js-index-maps` - Build `Map` for repeated lookups
- `js-cache-property-access` - Cache object properties in loops
- `js-cache-function-results` - Cache function results in a module-level `Map`
- `js-cache-storage` - Cache `localStorage` or `sessionStorage` reads
- `js-combine-iterations` - Combine multiple `filter` or `map` steps into one loop
- `js-length-check-first` - Check array length before expensive comparison
- `js-early-exit` - Return early from functions
- `js-hoist-regexp` - Hoist `RegExp` creation outside loops
- `js-min-max-loop` - Use a loop for min or max instead of sort
- `js-set-map-lookups` - Use `Set` or `Map` for O(1) lookups
- `js-tosorted-immutable` - Use `toSorted()` for immutability

### 8. Advanced Patterns

- `advanced-event-handler-refs` - Store event handlers in refs
- `advanced-init-once` - Initialize app once per app load
- `advanced-use-latest` - Use `useLatest` for stable callback refs

## How to Use

Reference individual rule files when they exist, for example:

```text
rules/async-parallel.md
rules/bundle-barrel-imports.md
```

Each rule file should contain:
- why the rule matters
- incorrect code example
- correct code example
- additional context and references

## Full Compiled Document

When available, use `AGENTS.md` as the compiled source of all rules.
