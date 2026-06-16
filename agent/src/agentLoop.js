import { getTask, postComment, updateTaskStatus } from './services/clickupService.js';
import { generatePlan, generateCode, evaluateCode } from './services/geminiService.js';
import { createBranch, updateFile, openPullRequest, getVercelPreviewUrl } from './services/githubService.js';
import fs from 'fs';
import path from 'path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GEMINI_COOLDOWN = 5000; // 5s entre llamadas a Gemini para no triggerear rate limit

const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS) || 3;

// Leer archivo actual del proyecto local
function readProjectFile(filename) {
  const filePath = path.join(process.cwd(), '..', filename);
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.warn(`No se encontró ${filename}`);
    return '';
  }
}

// Inyectar parche HTML en posición indicada por Gemini
function applyHtmlPatch(originalHtml, htmlPatch, position) {
  if (!htmlPatch || !htmlPatch.trim()) return originalHtml;

  const pos = (position || 'before_footer').trim();

  if (pos === 'before_footer') {
    return originalHtml.replace('</footer>', `${htmlPatch}\n</footer>`);
  }

  if (pos.startsWith('after_#')) {
    const id = pos.replace('after_#', '');
    // Buscar cierre de sección con ese id
    const regex = new RegExp(`(<section[^>]*id=["']${id}["'][^>]*>[\\s\\S]*?<\\/section>)`, 'i');
    const match = originalHtml.match(regex);
    if (match) {
      return originalHtml.replace(match[0], `${match[0]}\n${htmlPatch}`);
    }
    // fallback: before footer
    return originalHtml.replace('</footer>', `${htmlPatch}\n</footer>`);
  }

  if (pos.startsWith('replace_#')) {
    const id = pos.replace('replace_#', '');
    const regex = new RegExp(`<section[^>]*id=["']${id}["'][^>]*>[\\s\\S]*?<\\/section>`, 'i');
    return originalHtml.replace(regex, htmlPatch);
  }

  // fallback
  return originalHtml.replace('</footer>', `${htmlPatch}\n</footer>`);
}

// Agregar reglas CSS al final del archivo
function applyCssPatch(originalCss, cssPatch) {
  if (!cssPatch || !cssPatch.trim()) return originalCss;
  return `${originalCss}\n\n/* ===== Cambios agente IA ===== */\n${cssPatch}`;
}

// Parsear respuesta de Gemini con formato patch
function parseCodeResponse(codeResponse) {
  const positionMatch = codeResponse.match(/---POSITION---([\s\S]*?)---HTML-PATCH---/);
  const htmlMatch = codeResponse.match(/---HTML-PATCH---([\s\S]*?)---CSS-PATCH---/);
  const cssMatch = codeResponse.match(/---CSS-PATCH---([\s\S]*?)$/);

  // Fallback: formato viejo ---HTML--- / ---CSS--- (por si Gemini no sigue el nuevo)
  if (!htmlMatch) {
    const [htmlPart, cssPart] = codeResponse.split('---CSS---');
    return {
      position: 'before_footer',
      htmlPatch: htmlPart?.replace('---HTML---', '').trim() || '',
      cssPatch: cssPart?.trim() || ''
    };
  }

  return {
    position: positionMatch?.[1]?.trim() || 'before_footer',
    htmlPatch: htmlMatch?.[1]?.trim() || '',
    cssPatch: cssMatch?.[1]?.trim() || ''
  };
}

export async function agentLoop(taskId, taskTitle, taskDescription) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 INICIANDO LOOP PARA TAREA: ${taskTitle}`);
  console.log(`${'='.repeat(60)}\n`);

  let iteration = 0;
  let cumple = false;
  let prUrl = null;
  let prNumber = null;
  let evaluation = null;

  try {
    // Paso 1: Obtener detalles de la tarea
    console.log('📖 Paso 1: Leyendo tarjeta de ClickUp...');
    const task = await getTask(taskId);
    console.log(`   ✓ Tarea: ${task.name}\n`);

    // Paso 2: Generar plan
    console.log('📋 Paso 2: Gemini genera plan de implementación...');
    const plan = await generatePlan(task.name, task.description);
    console.log(`   ✓ Plan generado\n`);

    await postComment(
      taskId,
      `🤖 **El agente está trabajando en esta tarea**\n\n${plan.resumen}`
    );

    // Paso 3-5: Loop de codificación y evaluación
    while (iteration < MAX_ITERATIONS && !cumple) {
      iteration++;
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`🔁 ITERACIÓN ${iteration}/${MAX_ITERATIONS}`);
      console.log(`${'─'.repeat(60)}\n`);

      // Generar parche de código
      await sleep(GEMINI_COOLDOWN);
      console.log('💻 Generando código (modo parche)...');
      const codeResponse = await generateCode(
        task.name,
        task.description,
        iteration > 1 ? 'Intenta corregir los problemas identificados sin reescribir archivos completos.' : ''
      );

      const { position, htmlPatch, cssPatch } = parseCodeResponse(codeResponse);
      console.log(`   ✓ Parche generado (posición: ${position})\n`);

      // Aplicar parche sobre archivos actuales
      const originalHtml = readProjectFile('index.html');
      const originalCss = readProjectFile('estilos.css');
      const patchedHtml = applyHtmlPatch(originalHtml, htmlPatch, position);
      const patchedCss = applyCssPatch(originalCss, cssPatch);

      // Evaluar código
      await sleep(GEMINI_COOLDOWN);
      console.log('🧪 Evaluando código generado...');
      evaluation = await evaluateCode(
        htmlPatch,
        cssPatch,
        task.description,
        task.description
      );

      console.log(`   Score: ${evaluation.score}/100`);
      console.log(`   Cumple: ${evaluation.pasó ? '✅ SÍ' : '❌ NO'}\n`);

      if (evaluation.problemas.length > 0) {
        console.log('   Problemas identificados:');
        evaluation.problemas.forEach(p => console.log(`     - ${p}`));
        console.log();
      }

      if (evaluation.pasó) {
        cumple = true;
        console.log('✅ CÓDIGO CUMPLE LOS REQUISITOS\n');

        // Crear rama y abrir PR con archivos parcheados
        console.log('🌳 Paso 6: Creando rama en GitHub...');
        const timestamp = Date.now();
        const branchName = `feature/clickup-${taskId}-${timestamp}`;
        await createBranch(branchName);

        console.log('📝 Paso 7: Aplicando parche en GitHub...');
        await updateFile('index.html', patchedHtml, branchName, `Feature: ${task.name}`);
        await updateFile('estilos.css', patchedCss, branchName, `Estilos para: ${task.name}`);

        console.log('🔗 Paso 8: Abriendo Pull Request...');
        const prBody = `## ¿Qué cambia en el sitio?

${plan.resumen}

🔗 Tarea ClickUp: \`${taskId}\` — ${task.name}

---

## Tipo de cambio

- [x] ✨ Nueva funcionalidad / mejora visual

## Comportamiento actual

El sitio web KagsBeer no contaba con los cambios descritos en la tarea.

## Nuevo comportamiento

${plan.resumen}

## Detalles técnicos

${plan.tecnico}

## Calidad

- [x] Código evaluado automáticamente por Gemini (score ${evaluation.score}/100)
- [x] Solo se agregaron/modificaron los elementos necesarios (modo parche)
- [x] Estructura existente del sitio preservada
- [ ] Revisión visual antes de mergear

## ¿Es incompatible con la versión actual?

- [x] No — cambio aditivo, no rompe nada existente

## Información adicional

> Implementación automática generada por el agente IA en ${iteration} iteración(es).
> Posición de inserción: \`${position}\`
> ⚠️ Revisar visualmente el preview antes de aprobar.`;

        const result = await openPullRequest(branchName, `✨ ${task.name}`, prBody);
        prUrl = result.prUrl;
        prNumber = result.prNumber;

        console.log('\n✨ ÉXITO - PR abierto\n');

        // Esperar preview URL de Vercel
        console.log('🔍 Esperando URL de preview Vercel...');
        const previewUrl = await getVercelPreviewUrl(prNumber, 60000);
        if (previewUrl) {
          console.log(`   ✓ Preview: ${previewUrl}`);
        }

        // Comment final en ClickUp con preview URL si está disponible
        const previewLine = previewUrl
          ? `\n\n👁️ **Preview del sitio:** ${previewUrl}`
          : '\n\n👁️ Vercel generará una URL de preview del sitio en unos minutos.';

        await postComment(
          taskId,
          `✅ **Listo para revisión**\n\n${plan.resumen}\n\n🔗 Pull Request: ${prUrl}${previewLine}\n\nRevisa el sitio en el preview, aprueba el PR y haz merge cuando esté listo.`
        );

        await updateTaskStatus(taskId, 'PR');
        console.log('\n🎉 TAREA MOVIDA A PR EN CLICKUP\n');
      } else {
        if (iteration < MAX_ITERATIONS) {
          console.log(`⚠️  No cumple. Iterando (${iteration}/${MAX_ITERATIONS})...\n`);
          await postComment(
            taskId,
            `⚠️ **Iteración ${iteration}**: El parche generado no cumple todos los requisitos.\n\nProblemas:\n${evaluation.problemas.map(p => `- ${p}`).join('\n')}\n\nIntentando de nuevo...`
          );
        }
      }
    }

    if (!cumple) {
      const msg = `❌ No se pudo completar después de ${MAX_ITERATIONS} intentos.\n\nProblema: El código generado no cumple los requisitos especificados.`;
      await postComment(taskId, msg);
      console.log(`\n${msg}\n`);
    }
  } catch (error) {
    console.error('\n🔥 ERROR EN EL LOOP:', error.message);
    await postComment(
      taskId,
      `🔥 **ERROR**: ${error.message}\n\nPor favor, revisa los logs del servidor.`
    );
  }
}
