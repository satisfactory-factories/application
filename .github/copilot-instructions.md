# GitHub Copilot Project Instructions

## Project Overview
This project is a Satisfactory game planner and calculator web application. It uses Vue 3, TypeScript, Pinia, and Vitest for testing. The codebase is organized into a `src` directory with components, utilities, stores, and interfaces, and all business logic and UI code is written in TypeScript.

## Copilot Directives

- Use semantic / conventional commit structure in your commit messages, e.g. `feat: I made a new feature` or `fix: I fixed a bug`. Reference github issue numbers where applicable.
- **Only create TypeScript files.**
- All new source files must use the `.ts` or `.vue` (with `<script lang="ts">`) extension.
- Do not generate JavaScript (`.js`) files for new code, tests, or utilities.
- Use TypeScript for all utility, store, and test files (e.g., `.ts`, `.spec.ts`).
- Use TypeScript in all Vue SFCs (`<script setup lang="ts">`).
- Prefer composition API and Pinia for state management.
- Use Vitest for all new tests, and place them in the appropriate `src` subdirectory with `.spec.ts` extension.
- Follow the existing code style and conventions (e.g., attribute order, naming, and formatting).
- Use proper imports with `@/` alias for internal modules.
- Do not use `window.open` for navigation; use anchor tags with `href` for external links.
- All wiki link utilities should use display names and generate URLs in the format: `https://satisfactory.wiki.gg/wiki/Display_Name_With_Underscores`.
- All new code must be type-safe and leverage TypeScript's type system.
- Do not use JavaScript-specific features that are not compatible with TypeScript.
- All new files must include appropriate type annotations and interfaces.

## Example
- ✅ `src/utils/my-util.ts` (TypeScript utility)
- ✅ `src/components/MyComponent.vue` (Vue SFC with `<script setup lang="ts">`)
- ✅ `src/utils/my-util.spec.ts` (Vitest test file)
- ❌ `src/utils/my-util.js` (Not allowed)
- ❌ `src/utils/my-util.test.js` (Not allowed)

---

**Summary:**
> Only create TypeScript files. Do not create JavaScript files. Use TypeScript for all new code, tests, and utilities in this project.
