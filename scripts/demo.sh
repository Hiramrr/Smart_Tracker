#!/bin/bash
set -e

echo "=========================================="
echo " Smart Tracker - Demo completa"
echo "=========================================="
echo ""

echo "1. Levantando servicios principales..."
docker-compose up -d --build postgres zookeeper kafka kafka-ui app consumer producer

echo ""
echo "2. Esperando a que los servicios estén listos..."
sleep 15

echo ""
echo "3. Insertando datos reproducibles (seed)..."
docker-compose --profile seed run --rm seed-data

echo ""
echo "4. Ejecutando predicción de cosméticos (batch/ML)..."
docker-compose --profile batch run --rm cosmetic-predictor

echo ""
echo "5. Ejecutando clasificación de jugadores LoL (batch/ML)..."
docker-compose --profile batch run --rm lol-classifier

echo ""
echo "6. Reconstruyendo métricas de streaming..."
npm run stream:rebuild

echo ""
echo "7. Exportando datasets generados..."
npm run datasets:export

echo ""
echo "=========================================="
echo " Demo lista"
echo "=========================================="
echo ""
echo " App web:       http://localhost:3000"
echo " Kafka UI:      http://localhost:8080"
echo " PostgreSQL:    localhost:5432"
echo ""
echo " Datasets exportados en: datasets/"
echo " Consultas analíticas:   sql/analytics_queries.sql"
echo ""
echo " Dashboards:"
echo "   /dashboard          - General"
echo "   /dashboard/shop     - Tienda y predicciones"
echo "   /dashboard/datalake - Data Lake"
echo "   /dashboard/warehouse - Warehouse dimensional"
echo "=========================================="
