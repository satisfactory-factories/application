# How do we release updates?

This document will describe how the various components of Satisfactory Factories are released to users.

## Frontend (web)
Frontend is automatically deployed whenever main is merged. This is called [Trunk based development](https://trunkbaseddevelopment.com/#trunk-based-development-for-smaller-teams).

We have a tool called Vercel which manages two things:
1. Builds and releases the frontend application when `main` is merged.
2. Builds and releases previews of the frontend application when a pull request is opened.

E.g. when someone creates a new feature, it follows this flow:

1. A draft PR is opened (to communicate to other collaborators a particular issue / feature is being worked upon actively)
2. The PR work is completed, and the PR is marked as ready for review.
3. Review cycle begins.
4. Once everyone is happy, it is approved and merged into `main`.
5. Upon merging into `main`, Vercel will automatically build and release the frontend application.

## Backend
The backend now follows the same trunk-based flow as the frontend: **merge to `main` and it deploys itself.**

The backend system is hosted on Mael's private NAS server in his home. It is protected by Cloudflare Tunnels so that it is not directly exposed to the internet.

When a PR touching `backend/` (or the workspace files the image is built from) is merged, the `Backend: Deploy` workflow:

1. Runs the backend checks — lint and TypeScript build.
2. Builds the Docker image and pushes it to Docker Hub as `maelstromeous/satisfactory-factories:backend-latest`, plus a `backend-<commit sha>` tag so a bad deploy can be rolled back to an exact commit without a rebuild.
3. Calls a webhook on the webhooks server, which SSHes to the API box and runs `docker compose pull` + `docker compose up -d --wait` there.

This used to be a manual `backend/publish.sh` run from a laptop, which meant only one person could ship the API at all. That script still exists as a break-glass path for when GitHub Actions is unavailable, and says so at the top.

**A green Actions run now means the deploy landed** — since 2026-07-28 the hook waits for the deploy and answers `200` or `500` carrying the script's own output, and the Deploy step fails on the `500`. It used to answer `200` on acceptance alone. `/root/deploy.log` on the box is still where the reason for a failure lives.

Two files on the server — its compose file and its `update.sh` — are mirrored in `backend/` but are *not* synced by any deploy; they have to be copied over by hand when they change.

**→ [deployment.md](./deployment.md) has the full chain, the required secrets, rollback, and a troubleshooting table.**

## Parser
There are no deployments for the parser. It is run alongside a website deployment so that users browsers download the new game data.

Please consult [`parsing/README.md`](../parsing/README.md) for more information on how to run the parser and how it provides data to the web application.