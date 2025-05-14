# tdei-workspace-proxy


## Environment-Aware Logging Proxy Server

This project is an Express-based reverse proxy server that:
- Routes traffic based on environment path prefixes (`/dev`, `/stage`, `/prod`).
- Logs each request and response (including decoded body)
- Uploads logs to Azure Blob Storage daily, organized by environment

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

#### Log Upload to Azure
- A separate Node.js script runs on a schedule (default: every night 1 AM).
- Uploads log files to Azure Blob Storage container.
- Files are uploaded into folders: dev/, stage/, and prod/ inside Azure Blob Storage container.

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

### Environment Variables
Create a .env file with the following variables:
```bash
AZURE_STORAGE_CONNECTION_STRING=<azure_storage_connection_string>
AZURE_CONTAINER_NAME=<azure_storage_container_name>
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
docker run -p 8000:8000 --env-file .env tdei-workspace-proxy
```

### Logs
- All logs are saved in `./logs/{env}_log_DD_MM_YYYY.txt.`
- Includes timestamps, request paths, status codes, and response bodies (up to 1000 characters).
- Logs are printed to console for live debugging and also saved to file.
  
```bash
dev_log_DD_MM_YYYY.txt
stage_log_DD_MM_YYYY.txt
prod_log_DD_MM_YYYY.txt
```


## Upload Logs to Azure Blob Storage

- If the blob container `tdei-workspace-proxy` doesn’t exist, it's created.
- Files are uploaded to:
    - `dev/dev_log_DD_MM_YYYY.txt` 
    - `stage/stage_log_DD_MM_YYYY.txt` 
    - `prod/prod_log_DD_MM_YYYY.txt` 