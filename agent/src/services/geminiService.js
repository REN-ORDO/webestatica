import axios from 'axios';
import fs from 'fs';
import path from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Leer el contexto del proyecto (index.html y estilos.css)
function getProjectContext() {
  const projectRoot = path.join(process.cwd(), '..'); // Ir un nivel arriba de agent/
  const htmlPath = path.join(projectRoot, 'index.html');
  const cssPath = path.join(projectRoot, 'estilos.css');

  let html = '';
  let css = '';

  try {
    html = fs.readFileSync(htmlPath, 'utf8');
  } catch (e) {
    console.warn(`No se encontró index.html en ${htmlPath}`);
  }

  try {
    css = fs.readFileSync(cssPath, 'utf8');
  } catch (e) {
    console.warn(`No se encontró estilos.css en ${cssPath}`);
  }

  return { html, css };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGemini(prompt, maxRetries = 4) {
  let lastErr;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(
        `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
        {
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ]
        }
      );
      return response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;

      // Reintentar solo en errores transitorios (503 sobrecarga, 429 rate limit, 500)
      if ([429, 500, 503].includes(status) && attempt < maxRetries) {
        // 429 rate limit necesita esperar más (60s base)
        const base = status === 429 ? 15000 : 2000;
        const delay = Math.min(base * 2 ** (attempt - 1), 60000); // 429: 15s, 30s, 60s | 503: 2s, 4s, 8s
        console.log(`   ⏳ Gemini ${status}, reintento ${attempt}/${maxRetries - 1} en ${delay / 1000}s...`);
        await sleep(delay);
        continue;
      }
      break;
    }
  }

  throw new Error(`Gemini API error: ${lastErr.message}`);
}

export async function generatePlan(taskTitle, taskDescription) {
  const { html, css } = getProjectContext();

  const prompt = `
Eres un asistente de desarrollo web. Analiza esta solicitud de cambio en un sitio web y genera dos secciones separadas.

SOLICITUD:
Título: ${taskTitle}
Descripción: ${taskDescription}

SITIO ACTUAL (fragmento):
\`\`\`html
${html.substring(0, 1000)}
\`\`\`

\`\`\`css
${css.substring(0, 500)}
\`\`\`

Responde EXACTAMENTE en este formato (dos secciones):

---RESUMEN---
(Escribe aquí en lenguaje simple, sin términos técnicos, como si se lo explicaras al dueño del negocio. Cubre:
- QUÉ cambia visualmente (lo que el usuario ve en pantalla)
- QUÉ cambia funcionalmente (cómo se comporta el sitio, flujos, interacciones)
- QUÉ NO cambia y permanece igual (tanto visual como funcional)
Máximo 5 oraciones en total. Sin jerga técnica.)

---TECNICO---
(Escribe aquí el plan técnico detallado con los cambios específicos de HTML y CSS.)
  `;

  const raw = await callGemini(prompt);

  const resumenMatch = raw.match(/---RESUMEN---([\s\S]*?)---TECNICO---/);
  const tecnicoMatch = raw.match(/---TECNICO---([\s\S]*?)$/);

  return {
    resumen: resumenMatch?.[1]?.trim() || raw,
    tecnico: tecnicoMatch?.[1]?.trim() || raw
  };
}

export async function generateCode(taskTitle, taskDescription, feedback = '') {
  const { html, css } = getProjectContext();

  let prompt = `
Eres un desarrollador front-end experto. Modifica el sitio web KagsBeer para implementar la siguiente solicitud.

SOLICITUD:
Título: ${taskTitle}
Descripción: ${taskDescription}

PROYECTO ACTUAL:
\`\`\`html
${html}
\`\`\`

\`\`\`css
${css}
\`\`\`

RESTRICCIONES CRÍTICAS — NO CAMBIAR BAJO NINGUNA CIRCUNSTANCIA:
- Fondo: background-color #302e2e (gris oscuro) — NUNCA fondo blanco o claro
- Color de acento: #e5cc2b (dorado) — usar en hover, bordes decorativos, highlights
- Color de texto: #fff (blanco) sobre fondo oscuro
- Estructura de secciones: mantener IDs #inicio, #nosotros, #servicios, footer
- Font Awesome CDN para íconos — no reemplazar
- Sin frameworks externos (sin Bootstrap, sin Tailwind, sin jQuery)
- Todo el contenido en español

INSTRUCCIONES:
1. Reescribe index.html COMPLETO con los cambios integrados
2. Reescribe estilos.css COMPLETO con los estilos nuevos integrados
3. Los archivos deben ser funcionales y completos, no fragmentos

Responde EXACTAMENTE en este formato:

---HTML---
(index.html completo con los cambios)
---CSS---
(estilos.css completo con los cambios)
`;

  if (feedback) {
    prompt += `\n\nFEEDBACK DE ITERACIÓN ANTERIOR:\n${feedback}\n\nCorrige los problemas manteniendo siempre el diseño oscuro con fondo #302e2e.`;
  }

  return await callGemini(prompt);
}

export async function evaluateCode(generatedHtml, generatedCss, taskDescription, criteria) {
  const prompt = `
Eres un QA experto en front-end. Evalúa si el siguiente código cumple con los requisitos.

REQUISITOS ESPERADOS:
${criteria}

CÓDIGO GENERADO:
HTML:
\`\`\`html
${generatedHtml}
\`\`\`

CSS:
\`\`\`css
${generatedCss}
\`\`\`

Evalúa:
1. ¿Tiene todos los elementos necesarios mencionados en los requisitos?
2. ¿El CSS está aplicado correctamente?
3. ¿Hay errores de sintaxis?

Responde en JSON con este formato exacto:
{
  "cumple": true/false,
  "score": 0-100,
  "pasó": true/false,
  "problemas": ["problema 1", "problema 2"],
  "feedback": "Detalles de qué falta o está mal"
}

Responde SOLO con el JSON, sin explicaciones adicionales.
  `;

  const raw = await callGemini(prompt);
  // Strip markdown code fences si Gemini los incluye
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('No se pudo parsear respuesta de evaluación:', text);
    return {
      cumple: false,
      score: 0,
      pasó: false,
      problemas: ['Error parsing evaluation'],
      feedback: text
    };
  }
}
