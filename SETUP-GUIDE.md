# Agent Studio - Setup Guide

## What's Included

This repository contains the full Agent Studio application along with pre-loaded data:

- **seed-data.json** contains everything tied to the `kengqui.chia@ukg.com` account:
  - 8 agents
  - 24 components
  - 131 chat sessions
  - 936 messages
  - 6 traces
  - 2 coach history entries

## How It Works on a New Replit

The app is designed to be fully portable. On first startup with a fresh database, the app will automatically:

1. Create all the database tables (schema push)
2. Import the `kengqui.chia@ukg.com` user account
3. Import all 8 agents with their full configurations
4. Import all chat sessions, messages, components, and history

No manual database setup or data import is needed beyond provisioning the database itself.

## Setup Instructions (New Replit Account)

1. **Import this repo from GitHub** — Use "Import from GitHub" when creating a new Repl, and paste the URL: `https://github.com/KengQui/agentprompttesting`
2. **Provision a PostgreSQL database** — In the Replit tools panel, add a PostgreSQL database. This gives the app a `DATABASE_URL` automatically.
3. **Add your `GEMINI_API_KEY` secret** — Go to the Secrets/Environment Variables tab and add a secret named `GEMINI_API_KEY` with your Google Gemini API key (get one from https://aistudio.google.com/apikey).
4. **Click Run** — The app starts, creates all tables, imports all data, and is ready to use.

## Login Credentials

The login for the pre-loaded account is:

- **Username:** `kengqui.chia@ukg.com`
- **Password:** `welcome123`

You can change the password after logging in.

## What Each Step Does Automatically on Startup

| Step | What Happens |
|------|-------------|
| Schema sync | Creates all database tables if they don't exist |
| Seed import | Detects empty database and loads `seed-data.json` |
| User creation | Creates the `kengqui.chia@ukg.com` account with a hashed password |
| Agent import | Loads all 8 agents with their business cases, prompts, guardrails, etc. |
| Chat import | Restores all 131 chat sessions and 936 messages |
| Component import | Loads all 24 agent components (TurnManager, FlowController, etc.) |
