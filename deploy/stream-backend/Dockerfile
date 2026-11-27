FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    nodejs \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt \
    && pip install --no-cache-dir "uvicorn[standard]>=0.30.0" "bgutil-ytdlp-pot-provider>=1.0.0"

COPY api /app/api

EXPOSE 8000

CMD ["sh", "-c", "uvicorn api.v2:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
