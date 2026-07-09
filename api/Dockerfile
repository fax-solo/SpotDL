FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN groupadd -r spotdl && useradd -r -g spotdl -d /app -s /sbin/nologin spotdl \
    && chown -R spotdl:spotdl /app

EXPOSE 8000

USER spotdl

CMD ["sh", "-c", "alembic upgrade head && uvicorn index:app --host 0.0.0.0 --port 8000"]
