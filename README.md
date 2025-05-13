# tdei-workspace-proxy


## Environment-Aware Logging Proxy Server

This Node.js application acts as a reverse proxy that routes API requests to different environments (`dev`, `stage`, `prod`) based on the path prefix and logs all request and response details to environment-specific log files.

### Features

- Reverse Proxy to route requests based on `/dev`, `/stage`, or `/prod` path prefixes.
- **Smart Logging** of all requests and responses to daily log files per environment.
- Supports logging of JSON, XML, and text responses (with decoding for `gzip`, `br`, and `deflate`).
- Automatically handles Brotli decoding failures and falls back to raw buffers.
- Log files are rotated daily and stored in the `/logs` directory.

## Route Example
| Request URL                            | Targeted Host                                                   |
| -------------------------------------- | --------------------------------------------------------------- |
| `http://localhost:8000/dev/api/foo`    | `https://osm.workspaces-dev.sidewalks.washington.edu/api/foo`   |
| `http://localhost:8000/stage/api/bar`  | `https://osm.workspaces-stage.sidewalks.washington.edu/api/bar` |
| `http://localhost:8000/prod/api/thing` | `https://osm.workspaces.sidewalks.washington.edu/api/thing`     |


## Getting Started

### Prerequisites
- Node.js (v16 or later)
- npm

### Installation

```bash
git clone https://github.com/your-org/env-proxy-server.git
cd env-proxy-server
npm install
```

### Run the Proxy Server
```bash
npm start
```
Your proxy will be live at: `http://localhost:8000`


## Run with Docker
### Build the Docker Image
```bash
docker build -t env-proxy-server .
```

### Run the Docker Container
```bash
docker run -p 8000:8000 -v "$(pwd)/logs:/app/logs" env-proxy-server
```
This will persist logs to your local `./logs` directory.

### Logs
- All logs are saved in `./logs/{env}_log_DD_MM_YYYY.txt.`
- Includes timestamps, request paths, status codes, and response bodies (up to 1000 characters).
- Logs are printed to console for live debugging and also saved to file.
