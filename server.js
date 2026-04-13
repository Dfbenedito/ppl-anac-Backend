const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

// Agente HTTPS que ignora erros de certificado (comum em sites gov.br)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Headers simulando um navegador real
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Connection': 'keep-alive',
};

app.get('/', (req, res) => {
  res.json({ status: 'API ANAC PPL online!' });
});

app.get('/questoes', async (req, res) => {
  try {
    const { data } = await axios.get('https://sistemas.anac.gov.br/bancodequestoes/default.asp', {
      httpsAgent,
      headers,
      timeout: 20000, // 20 segundos
    });

    const $ = cheerio.load(data);
    const questoes = [];

    $('table tr').each((i, row) => {
      const cols = $(row).find('td');
      if (cols.length > 0) {
        questoes.push({
          id: i,
          texto: $(cols[0]).text().trim(),
        });
      }
    });

    res.json({ total: questoes.length, questoes });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao buscar questões', detalhe: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
