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
    GOOGLE_REDIRECT_URI=https://www.nexoaicompany.com/api/auth/google/callback \
    FRONTEND_URL=https://www.nexoaicompany.com \
    CORS_ORIGINS='["https://nexoaicompany.com","https://www.nexoaicompany.com"]' \
    DATABASE_URL=sqlite:////data/nexo.db \
    UPLOAD_DIR=/data/uploads

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src/backend ./src/backend
RUN mkdir -p /data/uploads

EXPOSE 8000

CMD ["python", "-m", "backend.main"]
