# Python + OR-Tools CP-SAT scheduling service (spec §10).
FROM python:3.12-slim

WORKDIR /app

# Install deps first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# --reload is intentionally omitted; this is the prod-parity image. For solver
# development run uvicorn locally with --reload (see README).
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
