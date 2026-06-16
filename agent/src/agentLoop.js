import { getTask, postComment, updateTaskStatus } from './services/clickupService.js';
import { generatePlan, generateCode, evaluateCode } from './services/geminiService.js';
import { getRepoContext, createBranch, updateFile, openPullRequest } from './services/githubService.js';

const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS) || 3;

export async function agentLoop(taskId, taskTitle, taskDescription) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 INICIANDO LOOP PARA TAREA: ${taskTitle}`);
  console.log(`${'='.repeat(60)}\n`);

  let iteration = 0;
  let cumple = false;
  let prUrl = null;

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
      `🤖 **Plan de Implementación**\n\n${plan}`
    );

    // Paso 3-5: Loop de codificación y evaluación
    while (iteration < MAX_ITERATIONS && !cumple) {
      iteration++;
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`🔁 ITERACIÓN ${iteration}/${MAX_ITERATIONS}`);
      console.log(`${'─'.repeat(60)}\n`);

      // Generar código
      console.log('💻 Generando código...');
      const codeResponse = await generateCode(
        task.name,
        task.description,
        iteration > 1 ? 'Por favor, intenta corregir los problemas identificados.' : ''
      );

      const [htmlPart, cssPart] = codeResponse.split('---CSS---');
      const generatedHtml = htmlPart.replace('---HTML---', '').trim();
      const generatedCss = cssPart.trim();

      console.log('   ✓ Código generado\n');

      // Evaluar código
      console.log('🧪 Evaluando código generado...');
      const evaluation = await evaluateCode(
        generatedHtml,
        generatedCss,
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

        // Crear rama y abrir PR
        console.log('🌳 Paso 6: Creando rama en GitHub...');
        const timestamp = Date.now();
        const branchName = `feature/clickup-${taskId}-${timestamp}`;
        await createBranch(branchName);

        console.log('📝 Paso 7: Actualizando archivos...');
        await updateFile('index.html', generatedHtml, branchName, `Feature: ${task.name}`);
        await updateFile('estilos.css', generatedCss, branchName, `Estilos para: ${task.name}`);

        console.log('🔗 Paso 8: Abriendo Pull Request...');
        prUrl = await openPullRequest(
          branchName,
          `✨ ${task.name}`,
          `Implementación automática desde ClickUp.\n\nTarea: ${taskId}\n\n${plan}`
        );

        console.log('\n✨ ÉXITO - PR abierto\n');
      } else {
        if (iteration < MAX_ITERATIONS) {
          console.log(`⚠️  No cumple. Iterando (${iteration}/${MAX_ITERATIONS})...\n`);
          await postComment(
            taskId,
            `⚠️ **Iteración ${iteration}**: El código no cumple todos los requisitos.\n\nProblemas:\n${evaluation.problemas.map(p => `- ${p}`).join('\n')}\n\nIntentando de nuevo...`
          );
        }
      }
    }

    // Paso final: Notificar resultado
    if (cumple && prUrl) {
      await postComment(
        taskId,
        `✅ **IMPLEMENTACIÓN COMPLETADA**\n\n🔗 Pull Request: ${prUrl}\n\nRevisa y mergea el PR cuando esté listo. La tarjeta se cerrará automáticamente.`
      );

      await updateTaskStatus(taskId, 'Completado');
      console.log('\n🎉 TAREA COMPLETADA Y CERRADA EN CLICKUP\n');
    } else {
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
