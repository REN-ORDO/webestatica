import 'dotenv/config';
import express from 'express';
import { agentLoop } from './agentLoop.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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

  // Responder inmediatamente a N8N
  res.json({
    success: true,
    message: 'Loop iniciado',
    taskId
  });

  // Ejecutar el loop en background
  agentLoop(taskId, taskTitle, taskDescription).catch((err) => {
    console.error(`[ERROR] Loop falló para tarea ${taskId}:`, err.message);
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📍 Webhook en POST /webhook/clickup`);
  console.log(`💚 Health check en GET /health\n`);
});
