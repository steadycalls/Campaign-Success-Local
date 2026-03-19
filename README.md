# Campaign Success Local

A full-stack automation architecture designed to orchestrate and manage local campaign success metrics, tracking, and reporting.

## Overview

This repository contains the local development environment and application infrastructure for the Campaign Success platform. It provides the tooling, backend logic, and frontend components required to build out the full multi-layer automation stack.

## Architecture

The architecture is built on a 4-layer stack:
- **L0: Raw Data / Execution** – Database interactions, external API calls, and foundational data structures.
- **L1: Automation / Workflows** – Event-driven triggers, sequential/parallel processing of domains and campaigns.
- **L2: Monitoring / Reporting** – Aggregation of success metrics, logging, and status dashboards.
- **L3: Strategic Redesign Triggers** – High-level alerts and system modifications based on performance data.

## Tech Stack

- **Runtime:** Node.js (v20+)
- **Language:** TypeScript / JavaScript
- **Database:** PostgreSQL (via Drizzle ORM or Prisma)
- **Scripting:** PowerShell for environment setup and local automation
- **Integration:** APIs (GHL, n8n, DataForSEO)

## Features

- Automated local environment setup via PowerShell (`setup-environment.ps1`).
- Integrated VS Code workspace settings for consistent developer experience.
- Pre-configured linting, debugging, and task execution configurations.
- Modular architecture designed for easy extension and parallel processing.

## Scripts

- `npm run dev` – Starts the local development server.
- `npm run build` – Compiles TypeScript and prepares for production.
- `npm run lint` – Runs ESLint across the codebase.
- `setup-environment.ps1` – Validates and installs required system dependencies (Node, Git, Python, C++ Build Tools).

## Getting Started

Please refer to the [SETUP.md](SETUP.md) file for a complete, step-by-step walkthrough from cloning the repository to running your first `npm run dev`.
