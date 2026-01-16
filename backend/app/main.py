from fastapi import FastAPI
from . import models, database, routes

# Initialize database
database.init_db()

app = FastAPI(title="AI Calendar Backend")

app.include_router(routes.router, prefix="/api/v1")

@app.get("/")
def read_root():
    return {"message": "Welcome to Momentra AI Calendar API"}
