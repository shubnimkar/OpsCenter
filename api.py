from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from aws_data import get_instances

app = FastAPI(title="AWS EC2 Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/instances")
def instances():
    return get_instances()
