# sample-mail

Cloudflare Email Worker + D1 + GitHub Pages frontend.

![Sample Mail UI](docs/screenshot.svg)

## Features

- Generate random inbox addresses via `/email/create`
- Receive emails through Cloudflare Email Routing and store them in D1
- Read inbox messages via `/email/:address?limit=10`
- Serve frontend from `GHPAGE` URL directly through Worker (`/` and `/ui`)
- Auto refresh inbox in frontend every 3 seconds

## Quick Start

1) Install dependencies

```bash
npm install
```

2) Create D1 and initialize schema

```bash
wrangler d1 create <db_name>
wrangler d1 execute <db_name> --file ./sql/schema.sql
```

3) Configure `wrangler.toml`

```toml
name = "sample-mail"
main = "src/index.ts"
compatibility_date = "2024-06-06"

[[d1_databases]]
binding = "DB"
database_name = "<db_name>"
database_id = "<your_database_id>"

[vars]
EMAIL_DOMAIN = "example.com"
forward_address = "a@example.com;b@example.com"
GHPAGE = "https://<your-github-username>.github.io/sample-mail/"
```

4) Deploy worker

```bash
npm run deploy
```

## Email Routing

Set a catch-all rule in Cloudflare Email Routing to this Worker, for example:

- `*@EMAIL_DOMAIN -> sample-mail`

Without this rule, emails will not be delivered to the Worker.

## API

Create inbox:

```http
GET /email/create
```

Response example:

```json
{
  "success": true,
  "data": {
    "fetch_endpoint": "/email/abc123@example.com",
    "address": "abc123@example.com",
    "mode": "catch_all_worker_rule"
  }
}
```

Get messages:

```http
GET /email/{address}?limit=10
```

## Frontend (GitHub Pages)

- Frontend source is `docs/index.html`
- Workflow deploys `docs/` to `gh-pages` automatically
- Worker reads `GHPAGE` and returns that UI from `/` and `/ui`

## Notes

- If `EMAIL_DOMAIN` is missing, `/email/create` returns a config error
- `forward_address` can be empty; use `;` to separate multiple emails
