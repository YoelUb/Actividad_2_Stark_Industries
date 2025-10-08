from fastapi import FastAPI
from sqlmodel import Session
from backend.db.database import engine
from sqlalchemy import text

app = FastAPI()

@app.get("/")
def root():
    return {"message": "Hello World"}

