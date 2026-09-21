const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const path = require("path");

const DB_FILE = path.join(__dirname, "../db.json");

async function readDB() {
  const data = await fs.readFile(DB_FILE, "utf-8");
  return JSON.parse(data);
}

async function writeDB(data) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function registrarLog(db, user, role, message) {
  if (!db.logs) db.logs = [];
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    user: user || "admin",
    role: role || "admin",
    message
  });
}

// 1. Listar Pacientes para o Admin
router.get("/admin/pacientes", async (req, res) => {
  const db = await readDB();
  res.json(db.pacientes || []);
});

// 2. Deletar Paciente
router.delete("/admin/paciente/:id", async (req, res) => {
  const db = await readDB();
  const id = Number(req.params.id);
  const index = db.pacientes.findIndex(p => p.id === id);

  if (index !== -1) {
    const removido = db.pacientes.splice(index, 1)[0];
    registrarLog(db, "admin", "admin", `Excluiu o paciente ${removido.nome} (ID: ${id})`);
    await writeDB(db);
    return res.json({ message: "Paciente excluído com sucesso." });
  }
  res.status(404).json({ erro: "Paciente não encontrado." });
});

// 3. Obter Logs
router.get("/logs", async (req, res) => {
  const db = await readDB();
  res.json(db.logs || []);
});

// 4. Limpar Logs
router.delete("/logs", async (req, res) => {
  const db = await readDB();
  db.logs = [];
  await writeDB(db);
  res.json({ message: "Logs limpos com sucesso." });
});

// 5. Otimizar Banco
router.post("/admin/otimizar", async (req, res) => {
  const db = await readDB();
  const idsPacientes = db.pacientes.map(p => p.id);
  const triagensIniciais = db.triagens.length;

  db.triagens = db.triagens.filter(t => !t.pacienteId || idsPacientes.includes(t.pacienteId));
  const removidas = triagensIniciais - db.triagens.length;

  registrarLog(db, "admin", "admin", `Otimização executada. Registros limpos: ${removidas}`);
  await writeDB(db);
  res.json({ message: `Otimização concluída! (${removidas} registros limpos)` });
});

// 6. Resetar Filas
router.post("/admin/resetar-filas", async (req, res) => {
  const db = await readDB();
  db.triagens = [];
  db.chamadasTV = [];
  registrarLog(db, "admin", "admin", "Resetou todas as filas e chamadas da TV.");
  await writeDB(db);
  res.json({ message: "Filas de espera e painel de TV resetados com sucesso." });
});

module.exports = router;
