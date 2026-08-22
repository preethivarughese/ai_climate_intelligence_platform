from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.endpoints import router
from .core.config import settings

app = FastAPI(title="AI Climate Intelligence Platform", version="2.0.0")

# Set CORS_ALLOW_ORIGINS to a comma-separated allowlist before exposing this publicly.
allowed_origins = [origin.strip() for origin in settings.CORS_ALLOW_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials="*" not in allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router, prefix="/api")

@app.get("/")
def root(): return {"status": "Operational", "docs": "/docs"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
