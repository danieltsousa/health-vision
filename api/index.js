const express = require("express");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

app.use(express.json({ limit: "15mb" }));
app.use(cors());
app.use(express.static(path.join(__dirname, "../frontend")));

const DB_FILE = path.join(__dirname, "db.json");

const INITIAL_DB = {
  usuarios: [],
  pacientes: [],
  triagens: [],
  consultas: [],
  chamadasTV: [],
  logs: [], 
  estoqueMedicamentos: [ 
    {
      id: 1,
      nome: "Dipirona",
      principioAtivo: "Metamizol",
      vencimento: "2028-12-31",
      quantidade: 150,
      alergiasAssociadas: ["dipirona", "metamizol"],
      controleEspecial: false
    },
    {
      id: 2,
      nome: "Amoxicilina",
      principioAtivo: "Amoxicilina",
      vencimento: "2027-06-30",
      quantidade: 80,
      alergiasAssociadas: ["penicilina", "amoxicilina"],
      controleEspecial: false
    }
  ],
  leitosUTI: [
    { id: 1, nome: "Leito UTI 01", status: "livre" },
    { id: 2, nome: "Leito UTI 02", status: "livre" }
  ]
};

async function readDB() {
  try {
    if (!fsSync.existsSync(DB_FILE)) {
      await writeDB(INITIAL_DB);
      return INITIAL_DB;
    }
    const data = await fs.readFile(DB_FILE, "utf-8");
    const parsed = JSON.parse(data);

    if (!parsed.usuarios) parsed.usuarios = [];
    if (!parsed.pacientes) parsed.pacientes = [];
    if (!parsed.triagens) parsed.triagens = [];
    if (!parsed.consultas) parsed.consultas = [];
    if (!parsed.chamadasTV) parsed.chamadasTV = [];
    if (!parsed.logs) parsed.logs = [];
    if (!parsed.estoqueMedicamentos) parsed.estoqueMedicamentos = INITIAL_DB.estoqueMedicamentos;
    if (!parsed.leitosUTI) parsed.leitosUTI = INITIAL_DB.leitosUTI;

    return parsed;
  } catch (error) {
    console.error("Erro ao ler o arquivo DB:", error);
    return INITIAL_DB;
  }
}

async function writeDB(data) {
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error("Erro ao escrever no arquivo DB:", error);
    throw new Error("Erro ao salvar dados no banco de dados.");
  }
}

// FUNÇÃO PADRÃO DE AUDITORIA CENTRALIZADA
function registrarLog(db, user, role, message) {
  if (!db.logs) db.logs = [];
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    user: user || "sistema",
    role: role || "usuario",
    message: message
  });
}

// ===================================================
// 1. ROTAS DE PACIENTES & LOGIN
// ===================================================

app.post("/login", async (req, res) => {
  try {
    const { usuario, ...bodyRest } = req.body;
    const senha = bodyRest.senha;
    if (!usuario || !senha) return res.status(400).json({ erro: "Usuário e senha são obrigatórios." });

    const db = await readDB();
    const user = db.usuarios.find(u => u.usuario === usuario && u.senha === senha);

    if (!user) return res.status(401).json({ erro: "Login inválido." });

    registrarLog(db, user.usuario, user.tipo, `Efetuou login no sistema hospitalar`);
    await writeDB(db);

    const { senha: _, ...userSemSenha } = user;
    res.json(userSemSenha);
  } catch (error) {
    res.status(500).json({ erro: "Erro interno no servidor." });
  }
});

app.post("/pacientes", async (req, res) => {
  try {
    const { nome, cpf, dataNascimento, genero, nomeMae, tipo, tipoAtendimento, foto, responsavel } = req.body;
    if (!nome || !cpf) return res.status(400).json({ erro: "Nome e CPF são obrigatórios." });

    const db = await readDB();
    const novoPaciente = {
      id: Date.now(),
      nome: nome.trim(),
      cpf: cpf.trim(),
      dataNascimento: dataNascimento || "",
      genero: genero || "Não informado",
      nomeMae: nomeMae ? nomeMae.trim() : "",
      tipoAtendimento: tipoAtendimento || tipo || "Geral",
      foto: foto || null,
      responsavel: responsavel || null,
      status: "triagem",
      createdAt: new Date().toISOString()
    };

    db.pacientes.push(novoPaciente);
    registrarLog(db, "recepcao", "atendimento", `Cadastrou novo paciente: ${novoPaciente.nome}`);
    await writeDB(db);

    res.status(201).json(novoPaciente);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao cadastrar paciente." });
  }
});

app.get("/pacientes", async (req, res) => {
  const db = await readDB();
  res.json(db.pacientes);
});

app.post("/atendimento", async (req, res) => {
  const db = await readDB();
  const { nome, cpf } = req.body;
  if (!nome || !cpf) return res.status(400).json({ erro: "Nome e CPF são obrigatórios." });
  
  const paciente = {
    id: Date.now(),
    nome: nome.trim(),
    cpf: cpf.trim(),
    status: "triagem",
    createdAt: new Date().toISOString()
  };
  db.pacientes.push(paciente);
  registrarLog(db, "recepcao", "atendimento", `Cadastrou novo atendimento para: ${paciente.nome}`);
  await writeDB(db);
  res.status(201).json(paciente);
});

// ===================================================
// 2. ROTAS DE TRIAGEM
// ===================================================

app.post("/triagem", async (req, res) => {
  try {
    const { pacienteId, nome, sintoma, temperatura,手alergia, observacao } = req.body;
    const alergia =手alergia;
    let risco = req.body.risco;
    const tempNum = Number(temperatura);

    if (tempNum >= 39) risco = "vermelho";
    else if (tempNum >= 38) risco = "amarelo";
    else if (!risco) risco = "verde";

    const triagem = {
      id: Date.now(),
      pacienteId: pacienteId || null,
      nome: nome.trim(),
      sintoma: sintoma || "Não informado",
      temperatura: tempNum,
      alergia: alergia ? alergia.trim().toLowerCase() : "nenhuma",
      observacao: observacao || "",
      risco,
      status: "aguardando_medico",
      createdAt: new Date().toISOString()
    };

    const db = await readDB();
    db.triagens.push(triagem);
    registrarLog(db, "enfermagem", "triagem", `Realizou triagem do paciente: ${triagem.nome} (Risco: ${risco})`);
    await writeDB(db);

    res.status(201).json(triagem);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao registrar triagem." });
  }
});

app.get("/triagens", async (req, res) => {
  const db = await readDB();
  res.json(db.triagens);
});

// ===================================================
// 3. CONSULTA MÉDICA & CONTROLE DE ESTOQUE
// ===================================================

app.post("/consulta", async (req, res) => {
  try {
    const { triagemId, pacienteId, paciente, diagnostico, medicacao, obs } = req.body;
    if (!paciente) return res.status(400).json({ erro: "Nome do paciente é obrigatório." });

    const db = await readDB();

    if (medicacao && medicacao.trim() !== "") {
      const medNome = medicacao.trim().toLowerCase();
      const medObjeto = db.estoqueMedicamentos.find(m => m.nome.toLowerCase() === medNome);

      if (medObjeto) {
        const hoje = new Date().toISOString().split("T")[0];
        if (medObjeto.vencimento && medObjeto.vencimento < hoje) {
          return res.status(400).json({
            erro: `PRESCRIÇÃO BLOQUEADA: O medicamento '${medObjeto.nome}' está VENCIDO (Validade: ${medObjeto.vencimento}).`
          });
        }

        if (medObjeto.quantidade <= 0) {
          return res.status(400).json({ erro: `PRESCRIÇÃO BLOQUEADA: Medicamento '${medObjeto.nome}' está esgotado na farmácia.` });
        }

        const triagemPaciente = db.triagens.find(t => 
          (t.pacienteId && Number(t.pacienteId) === Number(pacienteId)) || 
          t.nome.toLowerCase() === paciente.toLowerCase()
        );

        if (triagemPaciente && triagemPaciente.alergia && triagemPaciente.alergia !== "nenhuma") {
          const alergiaPaciente = triagemPaciente.alergia.toLowerCase();
          const possuiAlergia = alergiaPaciente.includes(medNome) || 
            (medObjeto.alergiasAssociadas && medObjeto.alergiasAssociadas.some(c => alergiaPaciente.includes(c)));

          if (possuiAlergia) {
            return res.status(400).json({
              erro: `PRESCRIÇÃO BLOQUEADA: O paciente possui alergia a '${triagemPaciente.alergia}', incompatível com '${medObjeto.nome}'.`
            });
          }
        }

        // Abate 1 unidade do estoque de medicamentos do hospital
        medObjeto.quantidade -= 1;
      }
    }

    const consulta = {
      id: Date.now(),
      pacienteId: pacienteId || null,
      paciente,
      diagnostico,
      medicacao,
      obs,
      statusMedicacao: medicacao ? "AGUARDANDO DISPENSAÇÃO" : "NÃO SE APLICA",
      createdAt: new Date().toISOString()
    };

    if (!db.consultas) db.consultas = [];
    db.consultas.push(consulta);

    if (triagemId) {
      const idx = db.triagens.findIndex(t => Number(t.id) === Number(triagemId));
      if (idx !== -1) db.triagens[idx].status = "finalizado";
    } else {
      db.triagens = db.triagens.filter(t => t.nome.toLowerCase() !== paciente.toLowerCase());
    }

    registrarLog(db, "Médico", "medico", `Consulta finalizada e medicação registrada para: ${paciente}`);
    await writeDB(db);

    res.status(201).json(consulta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao salvar consulta médica." });
  }
});

app.get("/api/farmacia/estoque", async (req, res) => {
  const db = await readDB();
  res.json(db.estoqueMedicamentos || []);
});

app.get("/medicacoes", async (req, res) => {
  const db = await readDB();
  res.json(db.consultas);
});

app.get("/farmacia/prescricoes", async (req, res) => {
  const db = await readDB();
  res.json(db.consultas.filter(c => c.medicacao && c.medicacao.trim() !== ""));
});

app.post("/farmacia/entregar", async (req, res) => {
  const db = await readDB();
  const { id } = req.body;
  const consulta = db.consultas.find(c => c.id === Number(id));

  if (consulta) {
    consulta.statusMedicacao = "ENTREGUE";
    consulta.entregueEm = new Date().toISOString();

    // 💥 CORREÇÃO: Apenas chamamos a função que já existe, passando os dados!
    registrarLog(db, "farmacia", "farmacia", `Entregou medicação (${consulta.medicacao}) ao paciente ${consulta.paciente}`);
    
    await writeDB(db);
    return res.json({ sucesso: true, consulta });
  }

  res.status(404).json({ erro: "Prescrição não encontrada." });
});


// Repor quantidade em medicamento existente (Almoxarifado -> Farmácia)
app.post("/api/farmacia/estoque/repor/:id", async (req, res) => {
  try {
    const db = await readDB();
    const id = Number(req.params.id);
    const { quantidade } = req.body;

    if (!db.estoqueMedicamentos) db.estoqueMedicamentos = [];
    const med = db.estoqueMedicamentos.find(m => m.id === id);

    if (!med) {
      return res.status(404).json({ erro: "Medicamento não encontrado no estoque." });
    }

    med.quantidade = Number(med.quantidade) + Number(quantidade);

    if (!db.logs) db.logs = [];
    db.logs.unshift({
      timestamp: new Date().toISOString(),
      user: "Almoxarifado",
      role: "almoxarifado",
      message: `Repôs +${quantidade} un. de ${med.nome} (Lote: ${med.lote}). Novo saldo: ${med.quantidade}`
    });

    await writeDB(db);
    res.json({ message: "Estoque atualizado!", medicamento: med });
  } catch (err) {
    res.status(500).json({ erro: "Erro ao repor estoque." });
  }
});

// ===================================================
// 1. ROTAS DE PACIENTES & LOGIN
// ===================================================

app.post("/login", async (req, res) => {
  try {
    const { usuario, ...bodyRest } = req.body;
    const senha = bodyRest.senha;
    if (!usuario || !senha) return res.status(400).json({ erro: "Usuário e senha são obrigatórios." });

    const db = await readDB();
    const user = db.usuarios.find(u => u.usuario === usuario && u.senha === senha);

    if (!user) return res.status(401).json({ erro: "Login inválido." });

    registrarLog(db, user.usuario, user.tipo, `Efetuou login no sistema hospitalar`);
    await writeDB(db);

    const { senha: _, ...userSemSenha } = user;
    res.json(userSemSenha);
  } catch (error) {
    res.status(500).json({ erro: "Erro interno no servidor." });
  }
});

app.post("/pacientes", async (req, res) => {
  try {
    const { nome, cpf, dataNascimento, genero, nomeMae, tipo, tipoAtendimento, foto, responsavel } = req.body;
    if (!nome || !cpf) return res.status(400).json({ erro: "Nome e CPF são obrigatórios." });

    const db = await readDB();
    const novoPaciente = {
      id: Date.now(),
      nome: nome.trim(),
      cpf: cpf.trim(),
      dataNascimento: dataNascimento || "",
      genero: genero || "Não informado",
      nomeMae: nomeMae ? nomeMae.trim() : "",
      tipoAtendimento: tipoAtendimento || tipo || "Geral",
      foto: foto || null,
      responsavel: responsavel || null,
      status: "triagem",
      createdAt: new Date().toISOString()
    };

    db.pacientes.push(novoPaciente);
    registrarLog(db, "recepcao", "atendimento", `Cadastrou novo paciente: ${novoPaciente.nome}`);
    await writeDB(db);

    res.status(201).json(novoPaciente);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao cadastrar paciente." });
  }
});

app.get("/pacientes", async (req, res) => {
  const db = await readDB();
  res.json(db.pacientes);
});

app.post("/atendimento", async (req, res) => {
  const db = await readDB();
  const { nome, cpf } = req.body;
  if (!nome || !cpf) return res.status(400).json({ erro: "Nome e CPF são obrigatórios." });
  
  const paciente = {
    id: Date.now(),
    nome: nome.trim(),
    cpf: cpf.trim(),
    status: "triagem",
    createdAt: new Date().toISOString()
  };
  db.pacientes.push(paciente);
  registrarLog(db, "recepcao", "atendimento", `Cadastrou novo atendimento para: ${paciente.nome}`);
  await writeDB(db);
  res.status(201).json(paciente);
});

// ===================================================
// 2. ROTAS DE TRIAGEM
// ===================================================

app.post("/triagem", async (req, res) => {
  try {
    const { pacienteId, nome, sintoma, temperatura, alergia, observacao } = req.body;
    let risco = req.body.risco;
    const tempNum = Number(temperatura);

    if (tempNum >= 39) risco = "vermelho";
    else if (tempNum >= 38) risco = "amarelo";
    else if (!risco) risco = "verde";

    const triagem = {
      id: Date.now(),
      pacienteId: pacienteId || null,
      nome: nome.trim(),
      sintoma: sintoma || "Não informado",
      temperatura: tempNum,
      alergia: alergia ? alergia.trim().toLowerCase() : "nenhuma",
      observacao: observacao || "",
      risco,
      status: "aguardando_medico",
      createdAt: new Date().toISOString()
    };

    const db = await readDB();
    db.triagens.push(triagem);
    registrarLog(db, "enfermagem", "triagem", `Realizou triagem do paciente: ${triagem.nome} (Risco: ${risco})`);
    await writeDB(db);

    res.status(201).json(triagem);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao registrar triagem." });
  }
});

app.get("/triagens", async (req, res) => {
  const db = await readDB();
  res.json(db.triagens);
});

// ===================================================
// 3. CONSULTA MÉDICA & CONTROLE DE ESTOQUE
// ===================================================

app.post("/consulta", async (req, res) => {
  try {
    const { triagemId, pacienteId, paciente, diagnostico, medicacao, obs } = req.body;
    if (!paciente) return res.status(400).json({ erro: "Nome do paciente é obrigatório." });

    const db = await readDB();

    if (medicacao && medicacao.trim() !== "") {
      const medNome = medicacao.trim().toLowerCase();
      const medObjeto = db.estoqueMedicamentos.find(m => m.nome.toLowerCase() === medNome);

      if (medObjeto) {
        const hoje = new Date().toISOString().split("T")[0];
        if (medObjeto.vencimento && medObjeto.vencimento < hoje) {
          return res.status(400).json({
            erro: `PRESCRIÇÃO BLOQUEADA: O medicamento '${medObjeto.nome}' está VENCIDO (Validade: ${medObjeto.vencimento}).`
          });
        }

        if (medObjeto.quantidade <= 0) {
          return res.status(400).json({ erro: `PRESCRIÇÃO BLOQUEADA: Medicamento '${medObjeto.nome}' está esgotado na farmácia.` });
        }

        const triagemPaciente = db.triagens.find(t => 
          (t.pacienteId && Number(t.pacienteId) === Number(pacienteId)) || 
          t.nome.toLowerCase() === paciente.toLowerCase()
        );

        if (triagemPaciente && triagemPaciente.alergia && triagemPaciente.alergia !== "nenhuma") {
          const alergiaPaciente = triagemPaciente.alergia.toLowerCase();
          const possuiAlergia = alergiaPaciente.includes(medNome) || 
            (medObjeto.alergiasAssociadas && medObjeto.alergiasAssociadas.some(c => alergiaPaciente.includes(c)));

          if (possuiAlergia) {
            return res.status(400).json({
              erro: `PRESCRIÇÃO BLOQUEADA: O paciente possui alergia a '${triagemPaciente.alergia}', incompatível com '${medObjeto.nome}'.`
            });
          }
        }

        // Abate 1 unidade do estoque de medicamentos do hospital
        medObjeto.quantidade -= 1;
      }
    }

    const consulta = {
      id: Date.now(),
      pacienteId: pacienteId || null,
      paciente,
      diagnostico,
      medicacao,
      obs,
      statusMedicacao: medicacao ? "AGUARDANDO DISPENSAÇÃO" : "NÃO SE APLICA",
      createdAt: new Date().toISOString()
    };

    if (!db.consultas) db.consultas = [];
    db.consultas.push(consulta);

    if (triagemId) {
      const idx = db.triagens.findIndex(t => Number(t.id) === Number(triagemId));
      if (idx !== -1) db.triagens[idx].status = "finalizado";
    } else {
      db.triagens = db.triagens.filter(t => t.nome.toLowerCase() !== paciente.toLowerCase());
    }

    registrarLog(db, "Médico", "medico", `Consulta finalizada e medicação registrada para: ${paciente}`);
    await writeDB(db);

    res.status(201).json(consulta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao salvar consulta médica." });
  }
});

app.get("/api/farmacia/estoque", async (req, res) => {
  const db = await readDB();
  res.json(db.estoqueMedicamentos || []);
});

app.get("/medicacoes", async (req, res) => {
  const db = await readDB();
  res.json(db.consultas);
});

app.get("/farmacia/prescricoes", async (req, res) => {
  const db = await readDB();
  res.json(db.consultas.filter(c => c.medicacao && c.medicacao.trim() !== ""));
});

app.post("/farmacia/entregar", async (req, res) => {
  const db = await readDB();
  const { id } = req.body;
  const consulta = db.consultas.find(c => c.id === Number(id));

  if (consulta) {
    consulta.statusMedicacao = "ENTREGUE";
    consulta.entregueEm = new Date().toISOString();
    registrarLog(db, "farmacia", "farmacia", `Entregou medicação (${consulta.medicacao}) ao paciente ${consulta.paciente}`);
    await writeDB(db);
    return res.json({ sucesso: true, consulta });
  }
  res.status(404).json({ erro: "Prescrição não encontrada." });
});

// ===================================================
// 4. ROTAS DA UTI (COMPLETAMENTE AUDITÁVEIS)
// ===================================================

app.get("/api/uti/leitos", async (req, res) => {
  const db = await readDB();
  res.json(db.leitosUTI || []);
});

app.post("/api/uti/internar", async (req, res) => {
  try {
    const db = await readDB();
    const { leitoId, pacienteId, paciente, diagnostico } = req.body;

    const leito = db.leitosUTI.find(l => l.id === Number(leitoId));
    if (!leito) return res.status(404).json({ erro: "Leito não encontrado." });

    if (leito.status === "ocupado") {
      return res.status(400).json({ erro: "Este leito já está ocupado por outro paciente." });
    }

    leito.status = "ocupado";
    leito.pacienteId = pacienteId;
    leito.paciente = paciente;
    leito.diagnostico = diagnostico;
    leito.dataEntrada = new Date().toISOString();

    if (pacienteId && db.triagens) {
      const idx = db.triagens.findIndex(t => Number(t.pacienteId) === Number(pacienteId));
      if (idx !== -1) db.triagens[idx].status = "internado_uti";
    }

    registrarLog(
      db, 
      "Médico", 
      "medico", 
      `🚨 INTERNAÇÃO: Paciente ${paciente} (ID: ${pacienteId}) alocado no ${leito.nome}. Diagnóstico: ${diagnostico || 'Não informado'}.`
    );

    await writeDB(db);
    res.json({ success: true, message: "Internação realizada com sucesso!" });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao processar internação na UTI." });
  }
});

app.post("/api/uti/liberar/:id", async (req, res) => {
  try {
    const db = await readDB();
    const leitoId = Number(req.params.id);
    const leito = db.leitosUTI.find(l => l.id === leitoId);

    if (leito) {
      const pacienteAnterior = leito.paciente;
      leito.status = "livre";
      delete leito.pacienteId;
      delete leito.paciente;
      delete leito.diagnostico;
      delete leito.dataEntrada;

      registrarLog(db, "UTI_CORE", "medico", `🟢 ALTA UTI: Liberou o ${leito.nome} (Paciente anterior: ${pacienteAnterior}).`);
      await writeDB(db);
      return res.json({ message: "Leito de UTI liberado com sucesso." });
    }
    res.status(404).json({ erro: "Leito de UTI não encontrado." });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao liberar leito." });
  }
});

// ===================================================
// 5. ROTAS DA TV & ADMIN
// ===================================================

app.post("/tv/chamar", async (req, res) => {
  const { localTipo, localNumero, paciente } = req.body;
  const db = await readDB();
  
  const chamada = {
    id: Date.now(),
    paciente,
    local: `${localTipo || 'CONSULTÓRIO'} ${localNumero || '01'}`,
    timestamp: new Date().toISOString()
  };

  if (!db.chamadasTV) db.chamadasTV = [];
  db.chamadasTV.unshift(chamada);
  db.chamadasTV = db.chamadasTV.slice(0, 10);

  await writeDB(db);
  res.json({ mensagem: "Chamada registrada.", chamada });
});

app.get("/tv/ultimas", async (req, res) => {
  const db = await readDB();
  res.json(db.chamadasTV || []);
});

const adminRoutes = require("./routes/admin");
app.use("/api", adminRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🏥 Servidor  HealthVision rodando com sucesso na porta ${PORT}`);
});

module.exports = app;
