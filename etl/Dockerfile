FROM python:3.10-slim

WORKDIR /app

# Instalar dependencias de sistema para psycopg2
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias de Python
RUN pip install --no-cache-dir kafka-python psycopg2-binary pandas scikit-learn numpy

COPY . .

CMD ["python", "transform.py"]
