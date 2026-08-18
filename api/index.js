const express = require("express");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cors());

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, "../frontend")));

const DB_FILE = path.join(__dirname, "db.json");

// Estrutura padrão inicial atualizada com medicamentos
const INITIAL_DB = {
  usuarios: [],
  pacientes: [],
  triagens: [],
  consultas: [],
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

// Funções Auxiliares Assíncronas
async function readDB() {
  try {
    if (!fsSync.existsSync(DB_FILE)) {
      await writeDB(INITIAL_DB);
      return INITIAL_DB;
    }
    const data = await fs.readFile(DB_FILE, "utf-8");
    const parsed = JSON.parse(data);
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

// ================= ROTAS DE MEDICAMENTOS =================

// Cadastrar novo medicamento com data de vencimento e alergias
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
      vencimento, // Formato YYYY-MM-DD
      // Converte para array de strings em minúsculo para facilitar a busca
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

// Listar todos os medicamentos cadastrados no estoque
app.get("/medicamentos", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.medicamentos || []);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao listar medicamentos." });
  }
});

// Substituição da rota fixa por consulta ao banco
app.get("/lista-medicacoes", async (req, res) => {
  try {
    const db = await readDB();
    const lista = (db.medicamentos || []).map(m => m.nome);
    res.json(lista);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao carregar lista de medicações." });
  }
});

// ================= ROTAS EXISTENTES =================

// LOGIN
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

// ATENDIMENTO
app.post("/atendimento", async (req, res) => {
  try {
    const { nome, cpf, tipo } = req.body;

    if (!nome || !cpf) {
      return res.status(400).json({ erro: "Nome e CPF são obrigatórios." });
    }

    const db = await readDB();

    const paciente = {
      id: Date.now(),
      nome,
      cpf,
      tipo: tipo || "Geral",
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

// TRIAGEM
app.post("/triagem", async (req, res) => {
  try {
    const { nome, sintoma, temperatura, alergia, observacao } = req.body;
    let risco = req.body.risco;

    const tempNum = Number(temperatura);

    if (tempNum >= 39) {
      risco = "vermelho";
    } else if (tempNum >= 38) {
      risco = "amarelo";
    } else if (!risco) {
      risco = "verde";
    }

    const triagem = {
      id: Date.now(),
      nome,
      sintoma,
      temperatura: tempNum,
      alergia: alergia ? alergia.trim().toLowerCase() : "nenhuma",
      observacao,
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

// LISTAR TRIAGENS
app.get("/triagens", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.triagens);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar triagens." });
  }
});

// CONSULTA MÉDICA (Com bloqueio por alergia e vencimento)
app.post("/consulta", async (req, res) => {
  try {
    const { paciente, diagnostico, medicacao, obs } = req.body;

    if (!paciente) {
      return res.status(400).json({ erro: "Nome do paciente é obrigatório." });
    }

    const db = await readDB();

    // 1. Validação de Alergia e Vencimento se houver medicação informada
    if (medicacao && medicacao.trim() !== "") {
      const medNome = medicacao.trim().toLowerCase();

      // Procura o medicamento no cadastro
      const medObjeto = db.medicamentos.find(m => m.nome.toLowerCase() === medNome);

      if (medObjeto) {
        // Validação de Data de Vencimento
        const hoje = new Date().toISOString().split("T")[0];
        if (medObjeto.vencimento && medObjeto.vencimento < hoje) {
          return res.status(400).json({
            erro: `PRESCRIÇÃO BLOQUEADA: O medicamento '${medObjeto.nome}' está VENCIDO (Validade: ${medObjeto.vencimento}).`
          });
        }

        // Validação de Alergia cruzando dados da Triagem do Paciente
        const triagemPaciente = db.triagens.find(t => t.nome.toLowerCase() === paciente.toLowerCase());

        if (triagemPaciente && triagemPaciente.alergia && triagemPaciente.alergia !== "nenhuma") {
          const alergiaPaciente = triagemPaciente.alergia.toLowerCase();

          // Verifica se a alergia do paciente corresponde ao remedio ou aos componentes
          const possuiAlergia =
            alergiaPaciente.includes(medNome) ||
            medObjeto.alergiasAssociadas.some(componente => alergiaPaciente.includes(componente));

          if (possuiAlergia) {
            return res.status(400).json({
              erro: `PRESCRIÇÃO BLOQUEADA: Paciente '${paciente}' possui alergia declarada a '${triagemPaciente.alergia}', incompatível com '${medObjeto.nome}'.`
            });
          }
        }
      }
    }

    // 2. Registra a consulta caso passe nas validações
    const consulta = {
      id: Date.now(),
      paciente,
      diagnostico,
      medicacao,
      obs,
      createdAt: new Date().toISOString()
    };

    db.consultas.push(consulta);

    // Atualiza status na triagem para encerrado
    db.triagens = db.triagens.filter(t => t.nome.toLowerCase() !== paciente.toLowerCase());

    await writeDB(db);

    res.status(201).json(consulta);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao salvar consulta." });
  }
});

// HISTÓRICO DE CONSULTAS
app.get("/medicacoes", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.consultas);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar histórico de consultas." });
  }
});

// INICIALIZAÇÃO DO SERVIDOR
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
  });
}

module.exports = app;