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
      altas: [],
      logs: [],
      tv_chamada: null,
      tv_historico: []
    };
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  if (!db.usuarios) db.usuarios = [];
  if (!db.pacientes) db.pacientes = [];
  if (!db.triagens) db.triagens = [];
  if (!db.consultas) db.consultas = [];
  if (!db.altas) db.altas = [];
  if (!db.logs) db.logs = [];
  if (!db.tv_chamada) db.tv_chamada = null;
  if (!db.tv_historico) db.tv_historico = [];
  return db;
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// Helper para registro de auditoria no sistema
function registrarLog(db, user, role, message) {
  if (!db.logs) db.logs = [];
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    user: user || "sistema",
    role: role || "admin",
    message
  });
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

  registrarLog(db, user.usuario, user.tipo, `Efetuou login no sistema`);
  writeDB(db);

  res.json(user);
});

// ATENDIMENTO / RECEPTOR - cadastrar paciente
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
  registrarLog(db, "recepcao", "atendimento", `Cadastrou novo paciente: ${paciente.nome}`);
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
  registrarLog(db, "enfermagem", "triagem", `Realizou triagem do paciente: ${triagem.nome} (Risco: ${risco})`);
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
  registrarLog(db, "medico", "medico", `Finalizou consulta do paciente: ${consulta.paciente}`);
  writeDB(db);

  res.status(201).json(consulta);
});

// REGISTRO DE ALTA MÉDICA
app.post("/alta", (req, res) => {
  const db = readDB();

  const termoAlta = {
    id: Date.now(),
    triagemId: req.body.triagemId || null,
    paciente: req.body.paciente,
    diagnostico: req.body.diagnostico,
    orientacoes: req.body.orientacoes,
    medico: req.body.medico,
    createdAt: new Date().toISOString()
  };

  db.altas.push(termoAlta);

  // Atualiza o status do paciente na fila de triagem para finalizado
  if (req.body.triagemId) {
    const triagemIndex = db.triagens.findIndex(t => t.id === Number(req.body.triagemId));
    if (triagemIndex !== -1) {
      db.triagens[triagemIndex].status = "alta_concluida";
    }
  }

  registrarLog(db, req.body.medico || "medico", "medico", `Emitiu alta médica para: ${termoAlta.paciente}`);
  writeDB(db);

  res.status(201).json({ sucesso: true, termoAlta });
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
    registrarLog(db, "farmacia", "farmacia", `Entregou medicação (${consulta.medicacao}) ao paciente ${consulta.paciente}`);
    writeDB(db);
    return res.json({ sucesso: true, consulta });
  }

  res.status(404).json({ erro: "Prescrição não encontrada." });
});

// -------------------------------------------------------------
// ROTAS EXCLUSIVAS DO PAINEL DE ADMINISTRAÇÃO E AUDITORIA
// -------------------------------------------------------------

// Listar Pacientes no Admin
app.get("/api/admin/pacientes", (req, res) => {
  const db = readDB();
  res.json(db.pacientes);
});

// Deletar Paciente
app.delete("/api/admin/paciente/:id", (req, res) => {
  const db = readDB();
  const id = Number(req.params.id);

  const index = db.pacientes.findIndex(p => p.id === id);
  if (index !== -1) {
    const removido = db.pacientes.splice(index, 1)[0];
    registrarLog(db, "admin", "admin", `Excluiu o paciente ${removido.nome} (ID: ${id})`);
    writeDB(db);
    return res.json({ message: "Paciente excluído com sucesso." });
  }

  res.status(404).json({ erro: "Paciente não encontrado." });
});

// Obter Logs de Auditoria
app.get("/api/logs", (req, res) => {
  const db = readDB();
  res.json(db.logs);
});

// Limpar Logs de Auditoria
app.delete("/api/logs", (req, res) => {
  const db = readDB();
  db.logs = [];
  writeDB(db);
  res.json({ message: "Logs limpos com sucesso." });
});

// Otimizar Banco de Dados
app.post("/api/admin/otimizar", (req, res) => {
  const db = readDB();

  const idsPacientes = db.pacientes.map(p => p.id);
  const triagensIniciais = db.triagens.length;
  db.triagens = db.triagens.filter(t => !t.pacienteId || idsPacientes.includes(t.pacienteId));

  const removidas = triagensIniciais - db.triagens.length;
  registrarLog(db, "admin", "admin", `Otimização executada. Registros órfãos limpos: ${removidas}`);
  writeDB(db);

  res.json({ message: `Otimização concluída com sucesso! (${removidas} registros limpos)` });
});

// Resetar Filas de Espera
app.post("/api/admin/resetar-filas", (req, res) => {
  const db = readDB();

  db.triagens = [];
  db.tv_chamada = null;
  db.tv_historico = [];

  registrarLog(db, "admin", "admin", "Resetou todas as filas de espera e chamadas da TV.");
  writeDB(db);

  res.json({ message: "Filas de espera e painel de TV resetados com sucesso." });
});

// START
app.listen(3000, () => {
  console.log("🏥 Hospital Pro rodando em http://localhost:3000");
});
