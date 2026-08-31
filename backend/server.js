const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

// Aumentado o limite do JSON para suportar fotos de perfil enviadas em Base64
app.use(express.json({ limit: "15mb" }));
app.use(cors());

app.use(express.static(path.join(__dirname, "../frontend")));

const DB_FILE = path.join(__dirname, "db.json");

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    return {
      usuarios: [],
      pacientes: [],
      triagens: [],
      consultas: [],
      tv_chamada: null,
      tv_historico: []
    };
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  if (!db.pacientes) db.pacientes = [];
  if (!db.triagens) db.triagens = [];
  if (!db.consultas) db.consultas = [];
  if (!db.tv_chamada) db.tv_chamada = null;
  if (!db.tv_historico) db.tv_historico = [];
  return db;
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// LOGIN
app.post("/login", (req, res) => {
  const db = readDB();

  const user = db.usuarios.find(u =>
    u.usuario === req.body.usuario &&
    u.senha === req.body.senha
  );

  if (!user) {
    return res.status(401).json({ erro: "Login inválido" });
  }

  res.json(user);
});

// ATENDIMENTO / RECEPTOR - cadastrar paciente com NOVOS DADOS
app.post("/atendimento", (req, res) => {
  const db = readDB();

  const {
    nome,
    cpf,
    tipo,
    tipoAtendimento,
    dataNascimento,
    genero,
    nomeMae,
    foto,
    responsavel
  } = req.body;

  if (!nome || !cpf) {
    return res.status(400).json({ erro: "Nome e CPF são obrigatórios." });
  }

  // Objeto estruturado salvando todas as informações novas
  const paciente = {
    id: Date.now(),
    nome: nome.trim(),
    cpf: cpf.trim(),
    dataNascimento: dataNascimento || "",
    genero: genero || "Não informado",
    nomeMae: nomeMae ? nomeMae.trim() : "",
    tipoAtendimento: tipoAtendimento || tipo || "Geral",
    foto: foto || null,
    responsavel: responsavel ? {
      nome: responsavel.nome ? responsavel.nome.trim() : "",
      cpf: responsavel.cpf ? responsavel.cpf.trim() : "",
      parentesco: responsavel.parentesco || ""
    } : null,
    status: "triagem",
    createdAt: new Date().toISOString()
  };

  db.pacientes.push(paciente);
  writeDB(db);

  res.status(201).json(paciente);
});

// LISTAR PACIENTES
app.get("/pacientes", (req, res) => {
  const db = readDB();
  res.json(db.pacientes);
});

// TRIAGEM - Atualizada com vínculo de pacienteId
app.post("/triagem", (req, res) => {
  const db = readDB();

  let risco = req.body.risco;

  if (req.body.temperatura >= 39) {
    risco = "vermelho";
  } else if (req.body.temperatura >= 38) {
    risco = "amarelo";
  } else if (!risco) {
    risco = "verde";
  }

  const triagem = {
    id: Date.now(),
    pacienteId: req.body.pacienteId || null,
    nome: req.body.nome,
    sintoma: req.body.sintoma,
    temperatura: req.body.temperatura,
    alergia: req.body.alergia ? req.body.alergia.trim().toLowerCase() : "nenhuma",
    observacao: req.body.observacao,
    risco,
    status: "aguardando_medico",
    createdAt: new Date().toISOString()
  };

  db.triagens.push(triagem);
  writeDB(db);

  res.status(201).json(triagem);
});

// LISTAR TRIAGENS
app.get("/triagens", (req, res) => {
  const db = readDB();
  res.json(db.triagens);
});

// MÍDIA INDOOR - TV
app.post("/tv/chamar", (req, res) => {
  const db = readDB();

  const chamada = {
    id: Date.now().toString(),
    localTipo: req.body.localTipo,
    localNumero: req.body.localNumero,
    paciente: req.body.paciente,
    hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  };

  db.tv_chamada = chamada;
  db.tv_historico.unshift(chamada);
  if (db.tv_historico.length > 5) db.tv_historico.pop();

  writeDB(db);
  res.json(chamada);
});

app.get("/tv/chamada", (req, res) => {
  const db = readDB();
  res.json({
    chamada: db.tv_chamada,
    historico: db.tv_historico
  });
});

// LISTA DE MEDICAÇÕES
app.get("/lista-medicacoes", (req, res) => {
  res.json([
    "Dipirona",
    "Paracetamol",
    "Ibuprofeno",
    "Amoxicilina",
    "Azitromicina",
    "Loratadina",
    "Omeprazol",
    "Buscopan",
    "Dramin",
    "Soro fisiológico"
  ]);
});

// CONSULTA
app.post("/consulta", (req, res) => {
  const db = readDB();

  const consulta = {
    id: Date.now(),
    pacienteId: req.body.pacienteId || null,
    paciente: req.body.paciente,
    diagnostico: req.body.diagnostico,
    medicacao: req.body.medicacao,
    obs: req.body.obs,
    createdAt: new Date().toISOString()
  };

  db.consultas.push(consulta);
  writeDB(db);

  res.status(201).json(consulta);
});

// MEDICAÇÕES / CONSULTAS
app.get("/medicacoes", (req, res) => {
  const db = readDB();
  res.json(db.consultas);
});

// MÓDULO FARMÁCIA
app.get("/farmacia/prescricoes", (req, res) => {
  const db = readDB();
  const prescricoes = db.consultas.filter(c => c.medicacao && c.medicacao.trim() !== "");
  res.json(prescricoes);
});

app.post("/farmacia/entregar", (req, res) => {
  const db = readDB();
  const consultaId = req.body.id;

  const consulta = db.consultas.find(c => c.id === Number(consultaId));
  if (consulta) {
    consulta.statusMedicacao = "ENTREGUE";
    consulta.entregueEm = new Date().toISOString();
    writeDB(db);
    return res.json({ sucesso: true, consulta });
  }

  res.status(404).json({ erro: "Prescrição não encontrada." });
});

// START
app.listen(3000, () => {
  console.log("🏥 Hospital Pro rodando em http://localhost:3000");
});
