#!/bin/bash
# Roda o backend FastAPI localmente para desenvolvimento
# Pré-requisito: pip install -r api/requirements.txt

cd "$(dirname "$0")"
uvicorn api.index:app --reload --port 8000
