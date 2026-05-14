const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3001;

// Habilitar CORS para permitir peticiones desde el dashboard (ej. localhost:3000)
app.use(cors());

// Servir archivos estáticos de la carpeta actual
app.use(express.static(__dirname));

// Ruta por defecto para cargar el dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'osirion-dashboard.html'));
});

// Proxy para buscar jugador por nombre
app.get('/api/lookup', async (req, res) => {
    try {
        const { displayName } = req.query;
        if (!displayName) {
            return res.status(400).json({ success: false, error: 'displayName es requerido' });
        }
        
        const response = await fetch(`https://fnapi.osirion.gg/v1/accounts/lookup-by-display-name?displayName=${encodeURIComponent(displayName)}`);
        
        if (response.status === 404) {
            return res.status(404).json({ success: false, error: 'Jugador no encontrado' });
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error en /api/lookup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Proxy para obtener estadísticas por Account ID
app.get('/api/stats', async (req, res) => {
    try {
        const { accountId, timeframe } = req.query;
        if (!accountId) {
            return res.status(400).json({ success: false, error: 'accountId es requerido' });
        }
        
        let url = `https://fnapi.osirion.gg/v1/stats/account?accountId=${accountId}`;
        if (timeframe) {
            url += `&timeframe=${timeframe}`;
        }

        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error en /api/stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Proxy para obtener rango ranked de la temporada actual por Account ID
app.get('/api/ranked-current', async (req, res) => {
    try {
        const { accountId } = req.query;
        if (!accountId) {
            return res.status(400).json({ success: false, error: 'accountId es requerido' });
        }

        const response = await fetch(`https://fnapi.osirion.gg/v1/ranked/account-ranks?accountId=${encodeURIComponent(accountId)}&lang=es`);
        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: data?.errorMessage || `error en ranked: ${response.status}`
            });
        }

        const modes = Array.isArray(data?.modes) ? data.modes : [];
        const playedModes = modes.filter(mode => mode?.currentDivision);
        const preferredRankingTypes = [
            'ranked-br-combined',
            'ranked-br',
            'ranked-zb-combined',
            'ranked-zb'
        ];

        let selectedMode = null;
        for (const rankingType of preferredRankingTypes) {
            selectedMode = playedModes.find(mode => mode?.rankingType === rankingType);
            if (selectedMode) break;
        }
        if (!selectedMode) selectedMode = playedModes[0] || modes[0] || null;

        res.json({
            success: true,
            rank: selectedMode
                ? {
                      rankingType: selectedMode.rankingType,
                      rankingTrackId: selectedMode.rankingTrackId,
                      lastUpdatedAt: selectedMode.lastUpdatedAt,
                      currentDivision: selectedMode.currentDivision || null,
                      highestDivision: selectedMode.highestDivision || null,
                      promotionProgress: selectedMode.promotionProgress,
                      currentPlayerRanking: selectedMode.currentPlayerRanking
                  }
                : null
        });
    } catch (error) {
        console.error('Error en /api/ranked-current:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Servidor Proxy de Osirion corriendo en http://localhost:${PORT}`);
    console.log(`👉 Ahora abre tu dashboard en el navegador y busca a un jugador.`);
});
