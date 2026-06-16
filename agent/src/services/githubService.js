import axios from 'axios';
import { Buffer } from 'buffer';

const GITHUB_API = 'https://api.github.com';
const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const TOKEN = process.env.GITHUB_TOKEN;

const client = axios.create({
  baseURL: GITHUB_API,
  headers: {
    'Authorization': `token ${TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  }
});

export async function getRepoContext() {
  try {
    const indexResponse = await client.get(
      `/repos/${OWNER}/${REPO}/contents/index.html`
    );
    const stylesResponse = await client.get(
      `/repos/${OWNER}/${REPO}/contents/estilos.css`
    );

    const indexContent = Buffer.from(indexResponse.data.content, 'base64').toString();
    const stylesContent = Buffer.from(stylesResponse.data.content, 'base64').toString();

    return {
      html: { content: indexContent, sha: indexResponse.data.sha },
      css: { content: stylesContent, sha: stylesResponse.data.sha }
    };
  } catch (err) {
    throw new Error(`GitHub getRepoContext fallo: ${err.message}`);
  }
}

export async function createBranch(branchName) {
  try {
    // Obtener el SHA del branch main
    const mainRef = await client.get(`/repos/${OWNER}/${REPO}/git/refs/heads/main`);
    const mainSha = mainRef.data.object.sha;

    // Crear nueva rama
    await client.post(`/repos/${OWNER}/${REPO}/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha: mainSha
    });

    console.log(`✨ Rama ${branchName} creada`);
    return branchName;
  } catch (err) {
    throw new Error(`GitHub createBranch fallo: ${err.message}`);
  }
}

export async function updateFile(filePath, newContent, branchName, message) {
  try {
    const fileResponse = await client.get(
      `/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${branchName}`
    );

    const sha = fileResponse.data.sha;

    await client.put(`/repos/${OWNER}/${REPO}/contents/${filePath}`, {
      message: message,
      content: Buffer.from(newContent).toString('base64'),
      sha: sha,
      branch: branchName
    });

    console.log(`📝 Archivo ${filePath} actualizado en rama ${branchName}`);
  } catch (err) {
    throw new Error(`GitHub updateFile fallo: ${err.message}`);
  }
}

export async function openPullRequest(branchName, title, description) {
  try {
    const response = await client.post(`/repos/${OWNER}/${REPO}/pulls`, {
      title: title,
      body: description,
      head: branchName,
      base: 'main'
    });

    const prUrl = response.data.html_url;
    const prNumber = response.data.number;
    console.log(`🔗 PR abierto: ${prUrl}`);
    return { prUrl, prNumber };
  } catch (err) {
    throw new Error(`GitHub openPullRequest fallo: ${err.message}`);
  }
}

export async function getVercelPreviewUrl(prNumber, maxWaitMs = 60000) {
  // Vercel crea deployments en el PR como GitHub Deployments
  // Espera hasta maxWaitMs a que aparezca la URL de preview
  const interval = 5000;
  const maxAttempts = Math.floor(maxWaitMs / interval);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await client.get(
        `/repos/${OWNER}/${REPO}/deployments?ref=refs/pull/${prNumber}/head&per_page=5`
      );

      const vercelDeploy = response.data.find(d =>
        d.environment?.toLowerCase().includes('preview') ||
        d.creator?.login === 'vercel[bot]'
      );

      if (vercelDeploy) {
        const statusRes = await client.get(
          `/repos/${OWNER}/${REPO}/deployments/${vercelDeploy.id}/statuses`
        );
        const activeStatus = statusRes.data.find(s => s.state === 'success' && s.environment_url);
        if (activeStatus?.environment_url) {
          console.log(`🔍 Preview URL: ${activeStatus.environment_url}`);
          return activeStatus.environment_url;
        }
      }
    } catch (e) {
      // ignorar errores de polling
    }

    if (i < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, interval));
    }
  }

  return null; // timeout sin URL
}
