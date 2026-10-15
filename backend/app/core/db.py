"""DB 连接:方言由 DB_URL 决定,一套代码支持 MySQL 与国产库.

- MySQL:   mysql+pymysql://user:pass@host:3306/wms
- 达梦 DM:  dm+dmPython://user:pass@host:5236/wms
- 金仓KB:   kingbase+ksycopg2://user:pass@host:54321/wms
- 瀚高/PG:  postgresql+psycopg2://user:pass@host:5432/wms
SQL 里的 MySQL 专有写法已由 app/core/dialect.py 抹平(分页/upsert/insert ignore).
正式版要求:DB_URL 必须经环境变量注入,源码内不留任何账号密码默认值."""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DB_URL = os.getenv("DB_URL")
if not DB_URL:
    raise RuntimeError("DB_URL 未配置:请经环境变量或 backend/config/.env 注入,"
                       "格式 mysql+pymysql://user:pass@host:3306/wms")
engine = create_engine(DB_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
