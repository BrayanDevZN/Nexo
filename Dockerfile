FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/src \
    HOST=0.0.0.0 \
    PORT=8000 \
    ENVIRONMENT=production \
    COOKIE_SECURE=true \
    COOKIE_SAMESITE=none \
    DATABASE_URL=sqlite:////data/nexo.db \
    UPLOAD_DIR=/data/uploads

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src/backend ./src/backend
RUN mkdir -p /data/uploads

VOLUME ["/data"]
EXPOSE 8000

CMD ["python", "-m", "backend.main"]
