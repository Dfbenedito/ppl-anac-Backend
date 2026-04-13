const express = require('express');
const cors = require('cors');
const questoes = require('./questoes.json');

const app = express();
app.use(cors());
app.use(express.json());

// Rota principal
app.get('/', (req, res) => {
  res.json({ status: 'API ANAC PPL online!' });
});

// Retorna todas as questões
app.get('/questoes', (req, res) => {
  res.json({ total: questoes.length, questoes });
});

// Retorna questões por matéria
app.get('/questoes/:materia', (req, res) => {
  const materia = req.params.materia
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // remove acentos da busca

  const filtradas = questoes.filter(q => {
    const materiaSemAcento = q.materia
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // remove acentos do JSON
    return materiaSemAcento.includes(materia);
  });

  res.json({ total: filtradas.length, questoes: filtradas });
});

// Retorna questão aleatória
app.get('/aleatoria', (req, res) => {
  const aleatoria = questoes[Math.floor(Math.random() * questoes.length)];
  res.json(aleatoria);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
