# Fly.io Deployment Guide

This project is configured for [Fly.io](https://fly.io) using the `fly.toml` in the repo.

## Prerequisites
- Install the [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/)
- Sign in with `flyctl auth login`

## Initial Setup
Run `flyctl launch` the first time to create your app and volume. Answer the prompts or pass flags such as `--name` and `--region`.

## Secrets
Set your environment variables as Fly secrets:
```bash
flyctl secrets set TELE_TOKEN=your_bot_token \
  PUBLIC_URL=https://your-app.fly.dev
```

## Deploy
Use `flyctl deploy` to build and release the application. The bot will be accessible at your Fly domain, for example `https://your-app.fly.dev`.

## Services
The `fly.toml` already exposes ports 80/443 for the web app and 9000 for metrics. A volume named `db` is mounted at `/data` for the SQLite database.
