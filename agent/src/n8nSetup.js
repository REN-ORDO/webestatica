import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const N8N_BASE_URL = process.env.N8N_BASE_URL || 'https://n8n-production-f5967.up.railway.app/api/v1';
const N8N_API_KEY = process.env.N8N_API_KEY;
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:3000/webhook/clickup';

const client = axios.create({
  baseURL: N8N_BASE_URL,
  headers: {
    'X-N8N-API-KEY': N8N_API_KEY,
    'Content-Type': 'application/json'
  }
});

async function createN8NWorkflow() {
  try {
    console.log('🔧 Creando workflow N8N...\n');

    const workflow = {
      name: 'ClickUp → Claude Agent',
      nodes: [
        {
          name: 'ClickUp Trigger',
          type: 'n8n-nodes-base.clickup',
          typeVersion: 1,
          position: [250, 300],
          parameters: {
            event: 'taskUpdated',
            resource: 'task'
          },
          credentials: {
            clickUpApi: 'ClickUp API Token'
          }
        },
        {
          name: 'HTTP Request to Claude Agent',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 4,
          position: [600, 300],
          parameters: {
            method: 'POST',
            url: WEBHOOK_URL,
            sendBody: true,
            bodyParameters: {
              parameters: [
                {
                  name: 'taskId',
                  value: '={{ $node["ClickUp Trigger"].json.id }}'
                },
                {
                  name: 'taskTitle',
                  value: '={{ $node["ClickUp Trigger"].json.name }}'
                },
                {
                  name: 'taskDescription',
                  value: '={{ $node["ClickUp Trigger"].json.description }}'
                }
              ]
            }
          }
        }
      ],
      connections: {
        'ClickUp Trigger': {
          main: [
            [
              {
                node: 'HTTP Request to Claude Agent',
                type: 'main',
                index: 0
              }
            ]
          ]
        }
      },
      settings: {}
    };

    const response = await client.post('/workflows', workflow);
    const workflowId = response.data.id;

    console.log(`✅ Workflow creado: ${response.data.name} (ID: ${workflowId})\n`);

    // Activar workflow
    try {
      await client.post(`/workflows/${workflowId}/activate`);
      console.log(`🚀 Workflow activado\n`);
    } catch (e) {
      console.log(`⚠️  Workflow creado pero no pudo activarse automáticamente\n`);
      console.log(`🔗 Actívalo manualmente en N8N UI: ${N8N_BASE_URL.replace('/api/v1', '')}/workflows/${workflowId}\n`);
    }

    return workflowId;
  } catch (error) {
    console.error('❌ Error creando workflow:', error.response?.data || error.message);
    process.exit(1);
  }
}

async function listWorkflows() {
  try {
    const response = await client.get('/workflows');
    console.log('\n📋 Workflows existentes:');
    response.data.data.forEach(wf => {
      console.log(`  - ${wf.name} (ID: ${wf.id}, Active: ${wf.active})`);
    });
  } catch (error) {
    console.error('Error listando workflows:', error.message);
  }
}

// Main
console.log(`\n${'='.repeat(60)}`);
console.log('N8N Workflow Setup');
console.log(`${'='.repeat(60)}\n`);

console.log(`API Base: ${N8N_BASE_URL}`);
console.log(`Webhook URL: ${WEBHOOK_URL}\n`);

if (!N8N_API_KEY) {
  console.error('❌ N8N_API_KEY no definida en .env');
  process.exit(1);
}

// Mostrar workflows existentes
await listWorkflows();

// Crear nuevo workflow
console.log('\n¿Crear nuevo workflow? (requiere que N8N tenga ClickUp credential configurada)');
console.log('Ejecuta: node src/n8nSetup.js --create\n');

if (process.argv.includes('--create')) {
  await createN8NWorkflow();
}
