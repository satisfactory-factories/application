# AGENTS.md

Welcome, AI Agent! This file provides essential context and guidelines for working on the **Satisfactory Factory Planner** project.

## Project Overview
This application is a specialized tool for players of the video game **Satisfactory**. It allows users to:
- Map out production goals for specific factories or sections of a megafactory.
- Define and visualize logistics connections between factories.
- Identify bottlenecks and imbalances in the production chain.
- Manage production scaling and factory updates.

## Core Logic & Concepts
- **Factory Connections**: Factories are linked via item flows. A producer factory ships products to consumer factories.
- **Flow Rebalancing**: The tool ensures concurrency. If a producer ships 100% of its output but the consumer needs more, the tool highlights the issue for the user to rebalance.
- **Exclusive References**: The tool maintains strict references to each factory to ensure data integrity during changes.
- **Bottleneck Highlighting**: Visual indicators (via Vue Flow) show where production or logistics are failing to meet requirements (`hasProblem` flag).
- **User Assistance**: Users can mark factories as "updated" or track their "inSync" status to manage changes across the production chain.
- **Tasks & Notes**: Each factory supports internal tasks and notes for better organization.

## Tech Stack

### Frontend (`/web`)
- **Framework**: Vue 3 (Composition API)
- **Language**: TypeScript
- **UI Components**: Vuetify 3
- **State Management**: Pinia
- **Build Tool**: Vite
- **Testing**: Vitest, @pinia/testing, @vue/test-utils
- **Visualization**: @vue-flow/core
- **Icons**: FontAwesome & custom game assets.

### Backend (`/backend`)
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: MongoDB (via Mongoose)
- **Auth**: JWT & bcryptjs
- **Deployment**: Docker

### Parsing (`/parsing`)
- Specialized tool to convert game `Docs.json` into a readable `gameData.json` used by the frontend.

## Key Workflows

### 1. Updating Game Data
When the game updates recipes or items:
1. Run the parser in `/parsing` to generate a new `gameData.json`.
2. Move the file to `/web/public/` with a new version name (e.g., `gameData_v1.0-XX.json`).
3. Update `dataVersion` in `/web/src/config/config.ts`.
4. Delete the old version from `/web/public/`.

### 2. Frontend Development
- Navigate to `/web`.
- Use `pnpm dev` for local development.
- Use `pnpm test` to run Vitest suites.
- **Note**: Ensure Pinia stores are properly mocked/tested using `@pinia/testing`.

### 3. Backend Development
- Navigate to `/backend`.
- Use `./start.sh` to spin up the Docker-based environment.
- The entry point is `backend.ts`.

## Guidelines for AI Agents (Claude Sonnet 4.6)
- **Primary Agent**: This project is optimized for work with Claude Sonnet 4.6.
- **Language**: Always use TypeScript.
- **Code Style**: 
    - Follow existing patterns in Vue components (Composition API, `<script setup>`).
    - Use Vuetify components for UI consistency.
    - Ensure all logic related to factory connections maintains data concurrency and highlights flow issues.
- **Testing**: 
    - Write tests for new features in the frontend using Vitest.
    - If modifying Pinia stores, update the corresponding tests.
- **Documentation**: Update `CHANGELOG.md` when making significant changes.

## Environment Requirements
- Node.js > 20.17.0 (Recommended: use `nvm`)
- pnpm > 9.14.4
- Docker (for backend services)
