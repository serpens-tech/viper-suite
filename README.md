# OpenTask

A self-hosted task management application. Run it with a single `docker compose` command — the web client is served directly by the backend, so no separate frontend server is needed.

![OpenTask screenshot](docs/screenshot.png)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start (Docker)](#quick-start-docker)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Development Setup](#development-setup)
- [Desktop & Mobile Clients](#desktop--mobile-clients)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- User accounts with JWT authentication
- Task lists and per-list tasks with priorities and due dates
- Admin panel for user management
- Responsive web UI — works on desktop and mobile browsers
- Fully self-hosted with PostgreSQL for persistent storage
- Native desktop wrapper for Linux and Windows (optional)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy 2, python-jose, passlib |
| Database | PostgreSQL 16 |
| Web Client | Vanilla HTML / CSS / JavaScript |
| Desktop Client | PyWebView, Capacitor |
| Packaging | Docker, .deb (Linux), Inno Setup installer (Windows) |

---

## Quick Start (Docker)

> **Requirements:** [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/) installed on your machine.

```bash
# 1. Clone the repository
git clone https://github.com/your-username/opentask.git
cd opentask

# 2. Start the application
docker compose up -d

# 3. Open the web UI
# http://localhost:8000
```

A default admin account is created automatically on first run:

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin123` |

> **Change the default password immediately** after your first login.

To stop the application:

```bash
docker compose down
```

All task data is stored in the `opentask_db` Docker volume and persists across restarts. To remove all data as well:

```bash
docker compose down -v
```

### Rebuild after updates

```bash
docker compose up -d --build
```

---

## Configuration

Environment variables are set in `docker-compose.yml`. The most important ones:

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | `change-me-in-production-...` | Secret used to sign JWT tokens. **Must be changed in production.** |
| `DATABASE_URL` | `postgresql://opentask:opentask@db:5432/opentask` | PostgreSQL connection string |

Generate a secure key with:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Then update `docker-compose.yml`:

```yaml
environment:
  SECRET_KEY: <your-generated-key>
```

---

## API Documentation

The interactive API docs are available while the server is running:

- **Swagger UI** — http://localhost:8000/docs
- **ReDoc** — http://localhost:8000/redoc

---

## Development Setup

> **Requirements:** Python 3.10+, PostgreSQL (or use Docker just for the database)

```bash
# Clone and enter the project
git clone https://github.com/your-username/opentask.git
cd opentask

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start only the database with Docker
docker compose up -d db

# Run the backend (hot-reload)
uvicorn app.main:app --reload
```

The web client is served automatically from `webclient/` at http://localhost:8000.

### Project structure

```
opentask/
├── app/                  # FastAPI backend
│   ├── main.py           # Application entry point, static file serving
│   ├── models.py         # SQLAlchemy models
│   ├── schemas.py        # Pydantic schemas
│   ├── auth.py           # JWT authentication logic
│   ├── database.py       # Database session and engine
│   └── routers/          # API route handlers (auth, lists, tasks, users)
├── webclient/            # Web UI (static HTML/CSS/JS)
├── desktopclient/        # PyWebView desktop wrapper (source available)
├── androidclient/        # Capacitor Android wrapper (source available)
├── Dockerfile
└── docker-compose.yml
```

---

## Desktop & Mobile Clients

A native desktop wrapper is available for **Linux** and **Windows**, and an Android app is in active development. All clients connect to your own running OpenTask server — they do **not** include a bundled server.

The source code for the desktop wrapper (`desktopclient/`) and Android wrapper (`androidclient/`) is available in this repository. Pre-built installers and app binaries are a **paid product** and are distributed separately.

### Building the Android app from source

> **Requirements:** Node.js 18+, Android Studio (with Android SDK API 22+), Java 17+

```bash
# Run from the project root
bash build/build_android.sh
```

The script installs dependencies, syncs the web assets from `webclient/` into the Android project, and produces a debug APK at:

```
androidclient/android/app/build/outputs/apk/debug/app-debug.apk
```

To open the project in Android Studio for signing and release builds:

```bash
cd androidclient
npx cap open android
```

| Platform | Status | Pricing |
|---|---|---|
| Web (self-hosted) | Available | Free |
| Linux (`.deb`) | Available | Paid |
| Windows (`.exe`) | Available | Paid |
| macOS | Coming soon | Paid |
| Android | Coming soon | Paid |
| iOS | Coming soon | Paid |

---

## Contributing

Contributions are welcome! Please open an issue first if you want to discuss a larger change.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push and open a Pull Request

---

## License

This project is licensed under the [MIT License](LICENSE).
