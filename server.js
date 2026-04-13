const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Utilitário: remove acentos
function semAcento(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Carrega todas as matérias dinamicamente
function carregarMaterias() {
  const dir = path.join(__dirname, 'materias');
  const arquivos = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  return arquivos.map(arquivo => {
    const conteudo = fs.readFileSync(path.join(dir, arquivo), 'utf-8');
    return JSON.parse(conteudo);
  });
}

// Rota principal
app.get('/', (req, res) => {
  res.json({ status: 'API ANAC PPL online! 🛩️' });
});

// Lista todas as matérias (resumo)
app.get('/materias', (req, res) => {
  const materias = carregarMaterias().map(m => ({
    materia: m.materia,
    descricao: m.descricao,
    total_topicos: m.topicos.length,
    total_questoes: m.topicos.reduce((acc, t) => acc + t.questoes.length, 0)
  }));
  res.json({ total: materias.length, materias });
});

// Retorna matéria completa com conteúdo
app.get('/materias/:nome', (req, res) => {
  const nome = semAcento(req.params.nome);
  const materias = carregarMaterias();
  const materia = materias.find(m => semAcento(m.materia).includes(nome));
  if (!materia) return res.status(404).json({ erro: 'Matéria não encontrada' });
  res.json(materia);
});

// Retorna tópico específico de uma matéria
app.get('/materias/:nome/topico/:id', (req, res) => {
  const nome = semAcento(req.params.nome);
  const id = parseInt(req.params.id);
  const materias = carregarMaterias();
  const materia = materias.find(m => semAcento(m.materia).includes(nome));
  if (!materia) return res.status(404).json({ erro: 'Matéria não encontrada' });
  const topico = materia.topicos.find(t => t.id === id);
  if (!topico) return res.status(404).json({ erro: 'Tópico não encontrado' });
  res.json(topico);
});

// Verifica resposta
app.post('/responder', (req, res) => {
  const { materia, topico_id, questao_id, resposta } = req.body;
  if (!materia || !questao_id || !resposta) {
    return res.status(400).json({ erro: 'Informe materia, questao_id e resposta' });
  }
  const materias = carregarMaterias();
  const mat = materias.find(m => semAcento(m.materia).includes(semAcento(materia)));
  if (!mat) return res.status(404).json({ erro: 'Matéria não encontrada' });

  let questao = null;
  for (const topico of mat.topicos) {
    questao = topico.questoes.find(q => q.id === questao_id);
    if (questao) break;
  }

  if (!questao) return res.status(404).json({ erro: 'Questão não encontrada' });

  const correto = resposta.toUpperCase() === questao.resposta_correta;
  res.json({
    correto,
    resposta_enviada: resposta.toUpperCase(),
    resposta_correta: questao.resposta_correta,
    explicacao: questao.explicacao,
    mensagem: correto ? '✅ Resposta correta!' : '❌ Resposta errada!',
    pontos: correto ? 10 : 0
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
