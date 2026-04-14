const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const app    = express();
const SECRET = process.env.JWT_SECRET || 'ppl-anac-secret-2025';

app.use(cors());
app.use(express.json());

// ============================================
// BANCO DE DADOS SIMULADO (arquivos JSON)
// ============================================

const DB_DIR      = path.join(__dirname, 'db');
const DB_USUARIOS = path.join(DB_DIR, 'usuarios.json');
const DB_SIMULADOS= path.join(DB_DIR, 'simulados.json');

// Garante que a pasta db existe
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR);

function lerDB(arquivo) {
    if (!fs.existsSync(arquivo)) return [];
    try { return JSON.parse(fs.readFileSync(arquivo, 'utf-8')); }
    catch { return []; }
}

function salvarDB(arquivo, dados) {
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
}

function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ============================================
// MIDDLEWARE: autenticação JWT
// ============================================

function autenticar(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ erro: 'Token não fornecido' });

    const token = header.split(' ')[1];
    try {
        req.usuario = jwt.verify(token, SECRET);
        next();
    } catch {
        res.status(401).json({ erro: 'Token inválido' });
    }
}

// ============================================
// UTILITÁRIOS
// ============================================

function semAcento(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function carregarMaterias() {
    const dir      = path.join(__dirname, 'materias');
    if (!fs.existsSync(dir)) return [];
    const arquivos = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    return arquivos.map(arquivo => {
        const conteudo = fs.readFileSync(path.join(dir, arquivo), 'utf-8');
        return JSON.parse(conteudo);
    });
}

function calcularNivel(xp) {
    return Math.floor(xp / 500) + 1;
}

// ============================================
// HEALTH CHECK
// ============================================

app.get('/', (req, res) => {
    res.json({ status: 'API ANAC PPL online! 🛩️' });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// USUÁRIOS — Registro e Login
// ============================================

app.post('/api/usuarios/registro', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;

        if (!nome || !email || !senha)
            return res.status(400).json({ erro: 'Preencha todos os campos' });

        const usuarios = lerDB(DB_USUARIOS);

        if (usuarios.find(u => u.email === email))
            return res.status(400).json({ erro: 'Email já cadastrado' });

        const hash = await bcrypt.hash(senha, 10);

        const novoUsuario = {
            _id:                  gerarId(),
            nome,
            email,
            senha:                hash,
            xp:                   0,
            nivel:                1,
            questoesRespondidas:  0,
            questoesCorretas:     0,
            simuladosRealizados:  0,
            sequenciaDias:        0,
            ultimoAcesso:         new Date().toISOString(),
            conquistas:           [],
            criadoEm:             new Date().toISOString()
        };

        usuarios.push(novoUsuario);
        salvarDB(DB_USUARIOS, usuarios);

        const { senha: _, ...usuarioPublico } = novoUsuario;
        const token = jwt.sign({ id: novoUsuario._id }, SECRET, { expiresIn: '7d' });

        res.status(201).json({ token, usuario: usuarioPublico });

    } catch (err) {
        console.error('Erro no registro:', err);
        res.status(500).json({ erro: 'Erro interno no servidor' });
    }
});

app.post('/api/usuarios/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha)
            return res.status(400).json({ erro: 'Preencha todos os campos' });

        const usuarios = lerDB(DB_USUARIOS);
        const usuario  = usuarios.find(u => u.email === email);

        if (!usuario)
            return res.status(401).json({ erro: 'Email ou senha incorretos' });

        const senhaOk = await bcrypt.compare(senha, usuario.senha);
        if (!senhaOk)
            return res.status(401).json({ erro: 'Email ou senha incorretos' });

        // Atualiza último acesso
        usuario.ultimoAcesso = new Date().toISOString();
        salvarDB(DB_USUARIOS, usuarios);

        const { senha: _, ...usuarioPublico } = usuario;
        const token = jwt.sign({ id: usuario._id }, SECRET, { expiresIn: '7d' });

        res.json({ token, usuario: usuarioPublico });

    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ erro: 'Erro interno no servidor' });
    }
});

app.get('/api/usuarios/perfil', autenticar, (req, res) => {
    const usuarios = lerDB(DB_USUARIOS);
    const usuario  = usuarios.find(u => u._id === req.usuario.id);
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });

    const { senha: _, ...usuarioPublico } = usuario;
    res.json(usuarioPublico);
});

app.get('/api/usuarios/ranking', (req, res) => {
    const usuarios = lerDB(DB_USUARIOS);
    const ranking  = usuarios
        .map(({ senha, email, ...u }) => u)
        .sort((a, b) => (b.xp || 0) - (a.xp || 0))
        .slice(0, 10);
    res.json({ ranking });
});

// ============================================
// QUESTÕES
// ============================================

app.get('/api/questoes/materias', (req, res) => {
    const materias = carregarMaterias().map(m => m.materia);
    res.json({ materias });
});

app.get('/api/questoes/random', autenticar, (req, res) => {
    const limite  = parseInt(req.query.limite) || 10;
    const materia = req.query.materia;

    const todasMaterias = carregarMaterias();
    let   todasQuestoes = [];

    todasMaterias.forEach(m => {
        if (materia && semAcento(m.materia) !== semAcento(materia)) return;
        m.topicos.forEach(t => {
            t.questoes.forEach(q => {
                todasQuestoes.push({
                    _id:            q.id,
                    pergunta:       q.enunciado || q.pergunta,
                    alternativas:   q.alternativas,
                    resposta_correta: ['A','B','C','D'].indexOf(q.resposta_correta),
                    explicacao:     q.explicacao || '',
                    materia:        m.materia
                });
            });
        });
    });

    // Embaralha e limita
    const embaralhadas = todasQuestoes
        .sort(() => Math.random() - 0.5)
        .slice(0, limite);

    res.json({ questoes: embaralhadas, total: embaralhadas.length });
});

// ============================================
// SIMULADOS
// ============================================

app.post('/api/simulados/salvar', autenticar, (req, res) => {
    try {
        const { questoes, acertos, total, tempo } = req.body;
        const usuarios  = lerDB(DB_USUARIOS);
        const idx       = usuarios.findIndex(u => u._id === req.usuario.id);

        if (idx === -1) return res.status(404).json({ erro: 'Usuário não encontrado' });

        const xpGanho = acertos * 10;

        usuarios[idx].questoesRespondidas  = (usuarios[idx].questoesRespondidas || 0) + total;
        usuarios[idx].questoesCorretas     = (usuarios[idx].questoesCorretas    || 0) + acertos;
        usuarios[idx].simuladosRealizados  = (usuarios[idx].simuladosRealizados || 0) + 1;
        usuarios[idx].xp                   = (usuarios[idx].xp                  || 0) + xpGanho;
        usuarios[idx].nivel                = calcularNivel(usuarios[idx].xp);

        salvarDB(DB_USUARIOS, usuarios);

        // Salva o simulado no histórico
        const simulados = lerDB(DB_SIMULADOS);
        simulados.push({
            _id:        gerarId(),
            usuarioId:  req.usuario.id,
            questoes,
            acertos,
            total,
            tempo,
            xpGanho,
            criadoEm:  new Date().toISOString()
        });
        salvarDB(DB_SIMULADOS, simulados);

        const { senha: _, ...usuarioPublico } = usuarios[idx];
        res.json({ mensagem: 'Simulado salvo!', xpGanho, usuario: usuarioPublico });

    } catch (err) {
        console.error('Erro ao salvar simulado:', err);
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// FLASHCARDS
// ============================================

app.get('/api/flashcards/estudar', autenticar, (req, res) => {
    const todasMaterias = carregarMaterias();
    let flashcards      = [];

    todasMaterias.forEach(m => {
        m.topicos.forEach(t => {
            t.questoes.forEach(q => {
                flashcards.push({
                    _id:      q.id,
                    pergunta: q.enunciado || q.pergunta,
                    resposta: `${q.resposta_correta} — ${q.explicacao || 'Ver explicação no simulado'}`,
                    materia:  m.materia
                });
            });
        });
    });

    // Pega até 20 aleatórios
    const selecionados = flashcards
        .sort(() => Math.random() - 0.5)
        .slice(0, 20);

    res.json({ flashcards: selecionados });
});

app.post('/api/flashcards/avaliar', autenticar, (req, res) => {
    // Registra avaliação (simplificado)
    res.json({ mensagem: 'Avaliação registrada!' });
});

// ============================================
// CONQUISTAS
// ============================================

const CONQUISTAS_DISPONIVEIS = [
    { _id: '1', nome: 'Primeiro Voo',    icone: '✈️',  descricao: 'Complete seu primeiro simulado',          xp: 50,  meta: 1,   campo: 'simuladosRealizados' },
    { _id: '2', nome: 'Decolagem',       icone: '🛫',  descricao: 'Responda 50 questões',                    xp: 100, meta: 50,  campo: 'questoesRespondidas' },
    { _id: '3', nome: 'Em Cruzeiro',     icone: '🛩️',  descricao: 'Responda 200 questões',                   xp: 250, meta: 200, campo: 'questoesRespondidas' },
    { _id: '4', nome: 'Piloto PPL',      icone: '🏆',  descricao: 'Alcance 1000 XP',                        xp: 500, meta: 1000, campo: 'xp'                  },
    { _id: '5', nome: 'Brifagem Diária', icone: '📅',  descricao: 'Acesse 7 dias seguidos',                 xp: 150, meta: 7,   campo: 'sequenciaDias'       },
];

app.get('/api/conquistas', autenticar, (req, res) => {
    const usuarios = lerDB(DB_USUARIOS);
    const usuario  = usuarios.find(u => u._id === req.usuario.id);
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });

    const conquistas = CONQUISTAS_DISPONIVEIS.map(c => ({
        ...c,
        desbloqueada: (usuario[c.campo] || 0) >= c.meta
    }));

    res.json({ conquistas });
});

// ============================================
// START
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
