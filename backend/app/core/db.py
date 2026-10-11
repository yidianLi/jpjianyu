"""DB 连接:MySQL5.6方言,只用交集类型,建表以 wms.sql 为准."""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DB_URL = os.getenv("DB_URL", "mysql+pymysql://wms:wms@10.8.0.10:3306/wms?charset=utf8mb4")
engine = create_engine(DB_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
