const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'API ANAC PPL online!' });
});

app.get('/questoes', async (req, res) => {
  try {
    const { data } = await axios.get('https://sistemas.anac.gov.br/bancodequestoes/default.asp');
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
