# Viper Suite

A self-hosted task and budget management suite. Run it with a single `docker compose` command — both web clients are served directly by the backend, no separate frontend server needed.

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

**Crossed Viper**
- User accounts with JWT authentication
- Task lists with per-list tasks, priorities, and due dates
- Finance flags on tasks — mark a task as income or expense with an amount; completing the task automatically creates a budget entry
- Admin panel for user management
- Dark mode support

**Leaf Viper**
- Income and expense tracking with running balance
- Linked with Crossed Viper — completed finance tasks create entries automatically
- Dark mode support

**General**
- Responsive web UI — works on desktop and mobile browsers
- Fully self-hosted with PostgreSQL for persistent storage
- Native desktop wrappers for Linux and Windows
- Android apps built with Capacitor

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy 2, python-jose, passlib |
| Database | PostgreSQL 16 |
| Web Clients | Vanilla HTML / CSS / JavaScript |
| Desktop Clients | PyWebView |
| Android Clients | Capacitor 7 |
| Packaging | Docker, .deb (Linux), PyInstaller + Inno Setup (Windows) |

---

## Quick Start (Docker)

> **Requirements:** [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/) installed on your machine.

```bash
# 1. Clone the repository
git clone https://github.com/serpens-tech/viper-suite.git
cd viper-suite

# 2. Start the application
docker compose up -d

# 3. Open the web UIs
# Crossed Viper: http://localhost:8000/crossed-viper/
# Leaf Viper:    http://localhost:8000/leaf-viper/
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

All data is stored in the `viper_db` Docker volume and persists across restarts. To remove all data as well:

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
| `DATABASE_URL` | `postgresql://vipersuite:vipersuite@db:5432/vipersuite` | PostgreSQL connection string |
| `CROSSED_VIPER_SERVER` | *(empty)* | If set, the web client skips the server setup screen on first load |
| `SHOW_CHANGE_SERVER` | `true` | If `false`, hides the "Change server" button on login/app screens |

Generate a secure key with:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Then update `docker-compose.yml`:

```yaml
environment:
  SECRET_KEY: <your-generated-key>
```

You can also use a `.env` file (auto-loaded by Docker Compose):

```env
SECRET_KEY=replace-with-a-long-random-value
CROSSED_VIPER_SERVER=https://crossedviper.example.com
SHOW_CHANGE_SERVER=false
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
git clone https://github.com/serpens-tech/viper-suite.git
cd viper-suite

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

- Crossed Viper web UI: http://localhost:8000/crossed-viper/
- Leaf Viper web UI:    http://localhost:8000/leaf-viper/

### Project structure

```
viper-suite/
├── app/                          # FastAPI backend (shared)
│   ├── main.py                   # Entry point, static file serving, DB migrations
│   ├── models.py                 # SQLAlchemy models
│   ├── schemas.py                # Pydantic schemas
│   ├── auth.py                   # JWT authentication logic
│   ├── database.py               # Database session and engine
│   └── routers/                  # Route handlers: auth, lists, tasks, users
├── crossed-viper/
│   ├── webclient/                # Crossed Viper web UI (HTML/CSS/JS)
│   ├── desktopclient/            # PyWebView desktop wrapper
│   │   ├── main.py               # Serves webclient on port 5501
│   │   ├── build_linux.sh        # Builds .deb installer
│   │   ├── build_windows.bat     # Builds Windows .exe via PyInstaller
│   │   ├── opentask_windows.spec # PyInstaller spec
│   │   └── installer.iss         # Inno Setup script
│   └── androidclient/            # Capacitor Android wrapper
│       ├── build_android.sh      # Builds debug APK
│       ├── capacitor.config.json
│       └── android/
├── leaf-viper/
│   ├── webclient/                # Leaf Viper web UI (HTML/CSS/JS)
│   ├── desktopclient/            # PyWebView desktop wrapper
│   │   └── main.py               # Serves webclient on port 5502
│   └── androidclient/            # Capacitor Android wrapper
│       ├── build_android_budget.sh
│       ├── capacitor.config.json
│       └── android/
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

---

## Desktop & Mobile Clients

All clients connect to your own running Viper Suite server — they do **not** include a bundled backend. The full source for every client is in this repository.

### Desktop (Linux)

> **Requirements:** `dpkg-dev`, `python3-venv`

```bash
# Run from the project root:
bash crossed-viper/desktopclient/build_linux.sh
```

Produces `dist/deb/crossed-viper_1.0.0_amd64.deb`. Install with:

```bash
sudo dpkg -i dist/deb/crossed-viper_1.0.0_amd64.deb
sudo apt-get install -f    # resolve any missing system deps
crossed-viper
```

### Desktop (Windows)

> **Requirements:** Python 3.10+, [PyInstaller](https://pyinstaller.org), optionally [Inno Setup 6](https://jrsoftware.org/isdl.php)

```bat
REM Run from the project root:
crossed-viper\desktopclient\build_windows.bat
```

Produces `dist\CrossedViper\CrossedViper.exe`. If Inno Setup is installed, also builds `dist\installer\CrossedViper_Setup_1.0.0.exe`.

### Desktop (run from source)

```bash
# Crossed Viper (port 5501)
.venv/bin/python crossed-viper/desktopclient/main.py

# Leaf Viper (port 5502)
.venv/bin/python leaf-viper/desktopclient/main.py
```

### Android

> **Requirements:** Node.js 18+, Android Studio (Android SDK API 22+), Java 17+

```bash
# Crossed Viper APK — run from the project root:
bash crossed-viper/androidclient/build_android.sh

# Leaf Viper APK — run from the project root:
bash leaf-viper/androidclient/build_android_budget.sh
```

Each script installs Node dependencies, syncs web assets into the Android project, and produces a debug APK:

```
crossed-viper/androidclient/android/app/build/outputs/apk/debug/app-debug.apk
leaf-viper/androidclient/android/app/build/outputs/apk/debug/app-debug.apk
```

Install on a connected device:

```bash
adb install crossed-viper/androidclient/android/app/build/outputs/apk/debug/app-debug.apk
adb install leaf-viper/androidclient/android/app/build/outputs/apk/debug/app-debug.apk
```

To open in Android Studio for signing and release builds:

```bash
cd crossed-viper/androidclient && npx cap open android
cd leaf-viper/androidclient && npx cap open android
```

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
