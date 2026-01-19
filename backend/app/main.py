from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from . import models, database, routes
from .logging_config import setup_logging
import logging

# Initialize structured logging
setup_logging()
logger = logging.getLogger(__name__)

# Initialize database - Commented out to use Alembic migrations
# database.init_db()

app = FastAPI(title="AI Calendar Backend")

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc)},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router, prefix="/api/v1")

@app.get("/")
def read_root():
    logger.info("Health check endpoint called")
    return {"message": "Welcome to Momentra AI Calendar API"}
