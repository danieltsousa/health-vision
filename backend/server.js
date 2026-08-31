const express = require("express");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

// Aumentado o limite do JSON para suportar fotos de perfil enviadas em Base64
app.use(express.json({ limit: "15mb" }));
app.use(cors());

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, "../frontend")));

const DB_FILE = path.join(__dirname, "db.json");

// Estrutura padrão inicial do banco de dados
const INITIAL_DB = {
  usuarios: [],
  pacientes: [],
  triagens: [],
  consultas: [],
  chamadasTV: [],
  medicamentos: [
    {
      id: 1,
      nome: "Dipirona",
      vencimento: "2028-12-31",
      alergiasAssociadas: ["dipirona", "metamizol"]
    },
    {
      id: 2,
      nome: "Amoxicilina",
      vencimento: "2027-06-30",
      alergiasAssociadas: ["penicilina", "amoxicilina"]
    }
  ]
};

// Funções Auxiliares Assíncronas para leitura e escrita no db.json
async function readDB() {
  try {
    if (!fsSync.existsSync(DB_FILE)) {
      await writeDB(INITIAL_DB);
      return INITIAL_DB;
    }
    const data = await fs.readFile(DB_FILE, "utf-8");
    const parsed = JSON.parse(data);

    // Garantia de inicialização das arrays principais caso não existam
    if (!parsed.usuarios) parsed.usuarios = [];
    if (!parsed.pacientes) parsed.pacientes = [];
    if (!parsed.triagens) parsed.triagens = [];
    if (!parsed.consultas) parsed.consultas = [];
    if (!parsed.chamadasTV) parsed.chamadasTV = [];
    if (!parsed.medicamentos) parsed.medicamentos = INITIAL_DB.medicamentos;

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

// ===================================================
// 1. ROTAS DE PACIENTES (CADASTRO COMPLETO)
// ===================================================

// Cadastrar Novo Paciente com todas as informações clínicas e pessoais
app.post("/pacientes", async (req, res) => {
  try {
    const { 
      nome, 
      cpf, 
      dataNascimento, 
      genero, 
      nomeMae, 
      tipo, 
      tipoAtendimento, 
      foto, 
      responsavel 
    } = req.body;

    if (!nome || !cpf) {
      return res.status(400).json({ erro: "Nome e CPF são obrigatórios para o cadastro." });
    }

    const db = await readDB();

    // Novo objeto paciente com suporte a todos os campos
    const novoPaciente = {
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
      status: "cadastrado",
      createdAt: new Date().toISOString()
    };

    db.pacientes.push(novoPaciente);
    await writeDB(db);

    res.status(201).json(novoPaciente);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao cadastrar paciente no banco de dados." });
  }
});

// Listar todos os Pacientes
app.get("/pacientes", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.pacientes || []);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar a lista de pacientes." });
  }
});

// Rota de recepção / atendimento inicial (compatibilidade retroativa)
app.post("/atendimento", async (req, res) => {
  try {
    const { nome, cpf, tipo, dataNascimento, genero, nomeMae, foto, responsavel } = req.body;

    if (!nome || !cpf) {
      return res.status(400).json({ erro: "Nome e CPF são obrigatórios." });
    }

    const db = await readDB();

    const paciente = {
      id: Date.now(),
      nome: nome.trim(),
      cpf: cpf.trim(),
      dataNascimento: dataNascimento || "",
      genero: genero || "Não informado",
      nomeMae: nomeMae || "",
      tipoAtendimento: tipo || "Geral",
      foto: foto || null,
      responsavel: responsavel || null,
      status: "triagem",
      createdAt: new Date().toISOString()
    };

    db.pacientes.push(paciente);
    await writeDB(db);

    res.status(201).json(paciente);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao cadastrar atendimento." });
  }
});


// ===================================================
// 2. ROTAS DE TRIAGEM
// ===================================================

app.post("/triagem", async (req, res) => {
  try {
    const { pacienteId, nome, sintoma, temperatura, alergia, observacao } = req.body;
    let risco = req.body.risco;

    const tempNum = Number(temperatura);

    // Regra de Triagem por Risco Térmico
    if (tempNum >= 39) {
      risco = "vermelho";
    } else if (tempNum >= 38) {
      risco = "amarelo";
    } else if (!risco) {
      risco = "verde";
    }

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
    await writeDB(db);

    res.status(201).json(triagem);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao registrar triagem." });
  }
});

app.get("/triagens", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.triagens || []);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar triagens." });
  }
});


// ===================================================
// 3. ROTAS DE MEDICAMENTOS E ESTOQUE
// ===================================================

app.post("/medicamentos", async (req, res) => {
  try {
    const { nome, vencimento, alergiasAssociadas } = req.body;

    if (!nome || !vencimento) {
      return res.status(400).json({ erro: "Nome e data de vencimento são obrigatórios." });
    }

    const db = await readDB();

    const novoMedicamento = {
      id: Date.now(),
      nome: nome.trim(),
      vencimento,
      alergiasAssociadas: Array.isArray(alergiasAssociadas)
        ? alergiasAssociadas.map(a => a.trim().toLowerCase())
        : (alergiasAssociadas || "").split(",").map(a => a.trim().toLowerCase()).filter(Boolean)
    };

    db.medicamentos.push(novoMedicamento);
    await writeDB(db);

    res.status(201).json(novoMedicamento);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao cadastrar medicamento." });
  }
});

app.get("/medicamentos", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.medicamentos || []);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao listar medicamentos." });
  }
});

app.get("/lista-medicacoes", async (req, res) => {
  try {
    const db = await readDB();
    const lista = (db.medicamentos || []).map(m => m.nome);
    res.json(lista);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao carregar lista de medicações." });
  }
});


// ===================================================
// 4. CONSULTA MÉDICA & PRONTUÁRIO
// ===================================================

app.post("/consulta", async (req, res) => {
  try {
    const { pacienteId, paciente, diagnostico, medicacao, obs } = req.body;

    if (!paciente) {
      return res.status(400).json({ erro: "Nome do paciente é obrigatório." });
    }

    const db = await readDB();

    // Validação de Alergia e Validade do Medicamento Prescrito
    if (medicacao && medicacao.trim() !== "") {
      const medNome = medicacao.trim().toLowerCase();
      const medObjeto = db.medicamentos.find(m => m.nome.toLowerCase() === medNome);

      if (medObjeto) {
        // Validação de Vencimento
        const hoje = new Date().toISOString().split("T")[0];
        if (medObjeto.vencimento && medObjeto.vencimento < hoje) {
          return res.status(400).json({
            erro: `PRESCRIÇÃO BLOQUEADA: O medicamento '${medObjeto.nome}' está VENCIDO (Validade: ${medObjeto.vencimento}).`
          });
        }

        // Validação de Alergia
        const triagemPaciente = db.triagens.find(t => 
          (t.pacienteId && t.pacienteId === pacienteId) || 
          t.nome.toLowerCase() === paciente.toLowerCase()
        );

        if (triagemPaciente && triagemPaciente.alergia && triagemPaciente.alergia !== "nenhuma") {
          const alergiaPaciente = triagemPaciente.alergia.toLowerCase();
          const possuiAlergia =
            alergiaPaciente.includes(medNome) ||
            (medObjeto.alergiasAssociadas && medObjeto.alergiasAssociadas.some(c => alergiaPaciente.includes(c)));

          if (possuiAlergia) {
            return res.status(400).json({
              erro: `PRESCRIÇÃO BLOQUEADA: Paciente '${paciente}' possui alergia declarada a '${triagemPaciente.alergia}', incompatível com '${medObjeto.nome}'.`
            });
          }
        }
      }
    }

    // Registra a consulta realizada
    const consulta = {
      id: Date.now(),
      pacienteId: pacienteId || null,
      paciente,
      diagnostico,
      medicacao,
      obs,
      createdAt: new Date().toISOString()
    };

    db.consultas.push(consulta);

    // Remove ou atualiza o status na fila de triagem
    db.triagens = db.triagens.filter(t => t.nome.toLowerCase() !== paciente.toLowerCase());

    await writeDB(db);

    res.status(201).json(consulta);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao salvar consulta médica." });
  }
});

app.get("/medicacoes", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.consultas || []);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar histórico de consultas." });
  }
});


// ===================================================
// 5. ROTAS DA TV E CHAMADA DE PACIENTES
// ===================================================

app.post("/tv/chamar", async (req, res) => {
  try {
    const { localTipo, localNumero, paciente } = req.body;
    const db = await readDB();

    const chamada = {
      id: Date.now(),
      paciente,
      local: `${localTipo || 'CONSULTÓRIO'} ${localNumero || '01'}`,
      timestamp: new Date().toISOString()
    };

    db.chamadasTV.unshift(chamada);
    // Mantém apenas as últimas 10 chamadas no histórico da TV
    db.chamadasTV = db.chamadasTV.slice(0, 10);

    await writeDB(db);
    res.json({ mensagem: "Paciente chamado com sucesso!", chamada });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao processar chamada para TV." });
  }
});

app.get("/tv/ultimas", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.chamadasTV || []);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar chamadas da TV." });
  }
});


// ===================================================
// 6. AUTENTICAÇÃO DE USUÁRIOS (LOGIN)
// ===================================================

app.post("/login", async (req, res) => {
  try {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
      return res.status(400).json({ erro: "Usuário e senha são obrigatórios." });
    }

    const db = await readDB();
    const user = db.usuarios.find(u => u.usuario === usuario && u.senha === senha);

    if (!user) {
      return res.status(401).json({ erro: "Login inválido." });
    }

    const { senha: _, ...userSemSenha } = user;
    res.json(userSemSenha);
  } catch (error) {
    res.status(500).json({ erro: "Erro interno no servidor." });
  }
});


// INICIALIZAÇÃO DO SERVIDOR
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor HealthVision rodando com sucesso na porta ${PORT}`);
  });
}

module.exports = app;
