# Deploy Evertrust Books on Railway

This repository now has a standalone Node.js 24 HTTP server. Railway builds the root Dockerfile and starts `node server/index.mjs`. The existing accounting Worker remains usable on its original host.

## Create the service

1. In Railway, create a service from `Qifei-L/managerio-mcp`, branch `main`.
2. Attach a persistent volume to this service at `/data`. Keep one replica. The SQLite adapter stores encrypted connections, drafts, cache snapshots and ETag-protected execution leases on that volume. Railway startup deliberately fails if the volume is missing or `DATA_DIR` is outside it.
3. Generate a public HTTPS domain in Networking. Set `PUBLIC_URL` to its origin, for example `https://your-service.up.railway.app`. When `PUBLIC_URL` is unset, the server can use Railway's `RAILWAY_PUBLIC_DOMAIN`. Do not leave the local `.env.example` URL in production.
4. Set the variables below in Railway, then deploy. Never commit their values.

| Variable | Required value |
| --- | --- |
| `APP_AUTH_TOKEN` | A random secret of at least 32 characters, with no whitespace or colons. Used to authenticate this MCP service, separate from Manager tokens. |
| `MANAGER_TOKEN_ENCRYPTION_KEY` | A different random 32-byte value encoded as 64 lowercase hexadecimal characters. Keep it stable across deployments and backed up securely. |
| `MANAGER_API_BASE` | Your Manager Cloud HTTPS API origin ending in `/api2`, e.g. `https://your-company.manager.cloud/api2`. No credentials or query string in the URL. |
| `PUBLIC_URL` | Your Railway/custom HTTPS origin, unless relying on `RAILWAY_PUBLIC_DOMAIN`. |
| `DATA_DIR` | `/data` (Docker default), inside the mounted volume. |
| `APP_USER_ID` | Optional stable namespace, default `railway-owner`. Do not change after adding connections. |
| `PORT` | Railway supplies it. The server binds to `0.0.0.0`. |

Generate each secret separately on a trusted local machine:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The database records an encryption-key fingerprint. A changed encryption key blocks startup instead of silently losing access to old records. `APP_AUTH_TOKEN` can be rotated without changing the namespace or encryption key.

## Connect

- Open `/` in a browser. The dedicated `/login` page asks for the existing `APP_AUTH_TOKEN` as its password. Login creates an eight-hour HttpOnly, SameSite=Strict cookie (Secure on HTTPS). Sign out revokes the session. Server restarts require signing in again; company connections stay in the volume. The simple white and dark-green workspace manages connections only; COA tools remain available through MCP.
- MCP endpoint: `https://your-service.up.railway.app/mcp`. In a client supporting authenticated remote Streamable HTTP, configure the header `Authorization: Bearer YOUR_APP_AUTH_TOKEN`. Do not put secrets in query strings.
- The MCP endpoint is stateless: POST JSON-RPC with JSON responses and 202 notifications. GET returns 405; no SSE subscription or session ID is required. OAuth login and automatic client registration are not implemented. A client must support explicitly configured authentication headers.
- `/healthz` returns only service readiness, without authentication. All connection, accounting and MCP routes require authentication. Caller-supplied `oai-authenticated-user-id` is discarded.

This Railway version is a **single-owner service**: everyone holding the service secret can access all connections saved under `APP_USER_ID`. It does not replace the original host's per-user authentication. Run separate services/volumes/secrets for separate owners. Tokens still use Manager's own permissions and the existing accounting approval/read-back logic.

## Continuous delivery

GitHub Actions runs all regression suites, Railway adapter tests, artifact validation and a Docker build on pushes to `main` and pull requests. Connect Railway to this repository's `main` branch and enable GitHub autodeploys plus **Wait for CI** in service settings. After that, a successful push can deploy automatically; no Railway token belongs in GitHub Actions.

Adding `railway.json` does not create a Railway project, mount its volume, configure secrets or enable Wait for CI. Those are service settings. This source migration does not deploy over the original Evertrust Books service. Source pushes after Railway autodeploy is enabled are deployment actions and should follow your release policy.

Official references: [GitHub autodeploys](https://docs.railway.com/deployments/github-autodeploys), [config as code](https://docs.railway.com/config-as-code/reference), [volumes](https://docs.railway.com/volumes), [healthchecks](https://docs.railway.com/deployments/healthchecks).

## Local verification and operations

```sh
# Node.js 24; Python with openpyxl and lxml is required only for regression tests.
cp .env.example .env
# Fill in the two secrets and MANAGER_API_BASE; leave PUBLIC_URL at localhost.
npm run dev
npm test
npm run build
npm run validate
docker build -t managerio-mcp .
```

`npm start` reads process environment; `npm run dev` additionally reads `.env`. If Python isn't named `python`, set `PYTHON` to its executable path for the tests. There are no production npm dependencies.

Do not store live tokens, database files or `.env` in GitHub. Back up the volume and encryption key together using a secure mechanism. SQLite must run on one mounted volume and one replica; it is not shared storage for a horizontally scaled service. A volume-backed redeploy can briefly interrupt availability. Graceful termination drains requests for up to 110 seconds; the host's termination grace also matters. Interrupted writes must be reconciled using the saved task, never automatically replayed.

Existing cloud connections and task data are not in the exported source ZIP and are not migrated automatically. Add the required Manager tokens to the new service after deployment. Local mock tests do not prove live Manager writes or a successful Railway deployment; verify the deployed health endpoint, authentication and MCP initialize/list before using real accounts.
