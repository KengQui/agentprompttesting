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

## Auto-Import System

When you import this repo into a new Replit and start the app with a fresh empty database, the `seed-data.json` file is automatically loaded. The user account, all agents, chat history, and everything else gets created — no manual steps needed.

## Setup Instructions

For someone using this on another Replit, you'll need to:

1. **Provision a PostgreSQL database** — Use Replit's built-in database integration to create a PostgreSQL database for the project.
2. **Add your own `GEMINI_API_KEY` secret** — Go to the Secrets tab in Replit and add your Google Gemini API key with the key name `GEMINI_API_KEY`.
3. **Start the app** — Everything else loads automatically from the seed data.

## Login Credentials

The login for the pre-loaded account is:

- **Username:** `kengqui.chia@ukg.com`
- **Password:** `welcome123`

You can change the password after logging in.
