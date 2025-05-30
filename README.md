# tdei-workspace-proxy


## Environment-Aware Logging Proxy Server

This project is an Express-based reverse proxy server that:
- Routes traffic based on environment path prefixes (`/dev`, `/stage`, `/prod`).
- Logs each request and response (including decoded body)

### Features

#### Proxy

- Reverse Proxy to route requests based on `/dev`, `/stage`, or `/prod` path prefixes.
- **Smart Logging** of all requests and responses to daily log files per environment.
- Supports logging of JSON, XML, and text responses (with decoding for `gzip`, `br`, and `deflate`).
- Automatically handles Brotli decoding failures and falls back to raw buffers.
- Log files are rotated daily and stored in the `/logs` directory.

##### Route Example
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
git clone git@github.com:TaskarCenterAtUW/tdei-workspace-proxy.git
cd tdei-workspace-proxy
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
docker build -t tdei-workspace-proxy .
```

### Run the Docker Container
```bash
docker run -p 8000:8000 tdei-workspace-proxy
```

### Logs
- All logs are saved in `./logs/{env}/log_DD_MM_YYYY.txt.`
- Includes timestamps, request paths, status codes, and response bodies (up to 1000 characters).
- Logs are printed to console for live debugging and also saved to file.
  
```bash
dev/log_DD_MM_YYYY.txt
stage/log_DD_MM_YYYY.txt
prod/log_DD_MM_YYYY.txt
```
