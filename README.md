# AWS EC2 Dashboard

A full-stack dashboard for monitoring EC2 instances across multiple AWS profiles.

Built with **FastAPI** (backend) and **Next.js + Tailwind CSS** (frontend).

---

## Stack

| Layer    | Technology                  |
|----------|-----------------------------|
| Backend  | Python, FastAPI, boto3      |
| Frontend | Next.js 16, Tailwind CSS, TypeScript |
| Auth     | AWS named profiles (`~/.aws/credentials`) |

---

## Project Structure

```
aws-dashboard/
├── api.py            # FastAPI app — exposes /api/instances
├── aws_data.py       # boto3 logic to fetch EC2 instances
├── requirements.txt  # Python dependencies
└── frontend/         # Next.js app
    ├── app/          # App router (layout, page)
    ├── components/   # Dashboard, table, badges, stat cards
    └── lib/          # API client and TypeScript types
```

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- AWS credentials configured at `~/.aws/credentials` with named profiles

---

## Setup

### 1. Configure AWS profiles

Edit `aws_data.py` and update the `PROFILES` list to match your named profiles:

```python
PROFILES = [
    "client1",
    "client2",
    "Org",
]
```

### 2. Backend

```bash
# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the API server
uvicorn api:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.  
Swagger docs at `http://localhost:8000/docs`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

The dashboard will be available at `http://localhost:3000`.

---

## API

| Method | Endpoint         | Description                        |
|--------|------------------|------------------------------------|
| GET    | `/api/instances` | Returns all EC2 instances as JSON  |

---

## Features

- View EC2 instances across multiple AWS profiles in one place
- Filter by profile, state (running / stopped), and instance name
- Sortable table columns
- Copy instance ID and public IP with one click
- Live refresh with last-updated timestamp
- Stat cards showing total, running, and stopped counts
