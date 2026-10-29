FROM python:3.12-slim
WORKDIR /app
COPY release/mobile-web/backend/requirements.lock backend/requirements.lock
RUN pip install --no-cache-dir -r backend/requirements.lock \
    && useradd --uid 10001 --create-home meal \
    && mkdir -p /data/photos /app/.data \
    && chown -R meal:meal /data /app/.data
COPY release/mobile-web/backend backend
COPY release/mobile-web/dist dist
USER meal
ENV DATABASE_URL=sqlite:////data/meals.sqlite3 MEDIA_ROOT=/data/photos
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "backend.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
