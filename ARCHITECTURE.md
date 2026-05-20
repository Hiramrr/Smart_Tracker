# Arquitectura de Miyu Tracker (Smart Tracker)

Este documento detalla los componentes del sistema, el flujo de datos y las tecnologías utilizadas.

## 1. Arquitectura de Datos (Patrón Kappa & Outbox)

El proyecto utiliza una arquitectura orientada a eventos para el procesamiento de estadísticas en tiempo real y diferido.

### Flujo de Datos:
1.  **Ingesta (API Next.js)**: Las peticiones a APIs externas (Osirion, Fortnite Tracker) se capturan en el endpoint `/api/osirion`. Cada respuesta exitosa se guarda en la tabla `api_calls`.
2.  **Patrón Outbox**: Un disparador (Trigger) en PostgreSQL inserta automáticamente un resumen del evento en la tabla `api_outbox`.
3.  **Productor (Node.js)**: El servicio `producer` monitorea la tabla `api_outbox` y publica los eventos en un tópico de **Kafka** (`api-calls`).
4.  **Transformación ETL (Python + ML)**: El servicio `etl` consume los mensajes de Kafka y realiza:
    *   **Cálculo de Progresión**: Compara métricas actuales con el histórico del jugador (Delta).
    *   **Machine Learning (KMeans)**: Analiza el historial de temporadas pasadas (`lifetime` data) para clasificar al jugador en categorías de nivel (Casual vs Competitivo).
5.  **Persistencia**: Los resultados transformados se guardan en la tabla `player_progress` para ser mostrados en la UI.

## 2. Componentes del Proyecto

### App (Frontend/Backend Next.js)
*   **Tecnologías**: React, Tailwind CSS, Recharts (Gráficos), Lucide (Iconos).
*   **Dashboard Osirion**: Interfaz premium para visualizar estadísticas, rangos y el análisis de mejora generado por el ETL.
*   **Data Lake Dashboard**: Panel de monitoreo de ingeniería para ver el flujo de eventos, latencia y salud de los servicios.

### Producer (Node.js/TypeScript)
*   Encargado de mover datos desde PostgreSQL (Outbox) hacia Kafka de forma confiable.

### Consumer (Node.js/TypeScript)
*   Procesa eventos específicos como el historial de la tienda de Fortnite para mantener un registro histórico persistente.

### ETL (Python)
*   Implementa la lógica de análisis avanzado usando `pandas` y `scikit-learn`.
*   Aprovecha los datos históricos de todas las temporadas para predecir tendencias y clasificar el rendimiento.

## 3. Base de Datos (PostgreSQL)
*   **Tablas Principales**:
    *   `api_calls`: Log crudo de peticiones.
    *   `player_snapshots`: Capturas de estado de jugadores.
    *   `shop_history`: Historial de ítems de la tienda.
    *   `player_progress`: Resultados del análisis ETL (Métricas + ML).

## 4. Despliegue (Docker)
El proyecto está completamente orquestado con `docker-compose`, incluyendo los servicios de la app, bases de datos, brokers de mensajería y trabajadores de fondo.
