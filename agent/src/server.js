import 'dotenv/config';
import express from 'express';
import { agentLoop } from './agentLoop.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Guard anti-duplicados: evita loop infinito cuando el agente
// comenta/actualiza la tarea (lo que retriggerea el webhook de ClickUp)
const processing = new Set();
const recentlyDone = new Map(); // taskId -> timestamp
const COOLDOWN_MS = 5 * 60 * 1000; // 5 min

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook de N8N
app.post('/webhook/clickup', async (req, res) => {
  const { taskId, taskTitle, taskDescription } = req.body;

  console.log(`[WEBHOOK] Tarea recibida: ${taskTitle} (ID: ${taskId})`);

  if (!taskId) {
    return res.status(400).json({ error: 'taskId requerido' });
  }

  // Ya hay un loop corriendo para esta tarea
  if (processing.has(taskId)) {
    console.log(`[SKIP] Tarea ${taskId} ya está en proceso`);
    return res.json({ success: true, message: 'Ya en proceso', taskId });
  }

  // Procesada hace poco (cooldown) — ignora retriggers del propio agente
  const lastDone = recentlyDone.get(taskId);
  if (lastDone && Date.now() - lastDone < COOLDOWN_MS) {
    console.log(`[SKIP] Tarea ${taskId} procesada hace <5min (cooldown)`);
    return res.json({ success: true, message: 'En cooldown', taskId });
  }

  // Responder inmediatamente a N8N
  res.json({
    success: true,
    message: 'Loop iniciado',
    taskId
  });

  // Marcar como en proceso y ejecutar el loop en background
  processing.add(taskId);
  agentLoop(taskId, taskTitle, taskDescription)
    .catch((err) => {
      console.error(`[ERROR] Loop falló para tarea ${taskId}:`, err.message);
    })
    .finally(() => {
      processing.delete(taskId);
      recentlyDone.set(taskId, Date.now());
    });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📍 Webhook en POST /webhook/clickup`);
  console.log(`💚 Health check en GET /health\n`);
});
