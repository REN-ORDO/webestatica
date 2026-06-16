import axios from 'axios';

const CLICKUP_API = 'https://api.clickup.com/api/v2';
const TOKEN = process.env.CLICKUP_API_TOKEN;
const SPACE_ID = process.env.CLICKUP_SPACE_ID;

const client = axios.create({
  baseURL: CLICKUP_API,
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  }
});

export async function getTask(taskId) {
  try {
    const { data } = await client.get(`/task/${taskId}`);

    // Validar que la tarea pertenece al space correcto
    if (SPACE_ID && data.space?.id !== SPACE_ID) {
      throw new Error(`Tarea ${taskId} no pertenece al space ${SPACE_ID}. Space actual: ${data.space?.id}`);
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      status: data.status?.status || 'unknown',
      spaceId: data.space?.id,
      customFields: data.custom_fields || []
    };
  } catch (err) {
    throw new Error(`ClickUp getTask fallo: ${err.message}`);
  }
}

export async function postComment(taskId, text) {
  try {
    await client.post(`/task/${taskId}/comment`, {
      comment_text: text
    });
    console.log(`✅ Comentario agregado a tarea ${taskId}`);
  } catch (err) {
    throw new Error(`ClickUp postComment fallo: ${err.message}`);
  }
}

export async function updateTaskStatus(taskId, newStatus) {
  try {
    await client.put(`/task/${taskId}`, {
      status: newStatus
    });
    console.log(`📌 Tarea ${taskId} cambiada a: ${newStatus}`);
  } catch (err) {
    throw new Error(`ClickUp updateTaskStatus fallo: ${err.message}`);
  }
}
