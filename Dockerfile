FROM python:3.13-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY crossed-viper/webclient/ ./crossed-viper/webclient/
COPY leaf-viper/webclient/ ./leaf-viper/webclient/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
