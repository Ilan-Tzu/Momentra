from sqlalchemy import Column, Integer, String, Text, DateTime, Enum as SqlEnum, ForeignKey, JSON, Float, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import enum

from .schemas import JobStatus

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=True)  # Nullable for Google OAuth users
    email = Column(String, unique=True, index=True, nullable=True)  # Google email
    google_sub = Column(String, unique=True, index=True, nullable=True)  # Google subject ID
    
    jobs = relationship("Job", back_populates="user")
    tasks = relationship("Task", back_populates="user")

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # made nullable for migration ease/backward compat, but logically should be required later
    raw_text = Column(Text, nullable=False)
    user_local_time = Column(String, nullable=True)  # ISO format with timezone for LLM context
    status = Column(SqlEnum(JobStatus), default=JobStatus.CREATED)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="jobs")
    candidates = relationship("JobCandidate", back_populates="job", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="source_job")

class JobCandidate(Base):
    __tablename__ = "job_candidates"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    
    description = Column(String, nullable=False)
    command_type = Column(String, nullable=False)
    parameters = Column(JSON, default={})
    confidence = Column(Float, default=0.0)
    original_text_segment = Column(String, nullable=True)
    
    job = relationship("Job", back_populates="candidates")

class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    source_job_id = Column(Integer, ForeignKey("jobs.id"), nullable=True)
    
    title = Column(String, nullable=False)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    description = Column(Text, nullable=True)
    is_blocking = Column(Boolean, default=True)
    
    user = relationship("User", back_populates="tasks")
    source_job = relationship("Job", back_populates="tasks")
