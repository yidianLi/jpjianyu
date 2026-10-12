# WMS 后端常用本地命令
PY ?= python

.PHONY: install test lint cov serve

install:
	$(PY) -m pip install -r requirements.txt -r requirements-dev.txt

test:
	$(PY) -m pytest -q

lint:
	ruff check app tests
	$(PY) -m compileall -q app

cov:
	$(PY) -m pytest -q --cov=app --cov-report=term-missing

serve:
	uvicorn app.main:app --host 0.0.0.0 --port 8080
