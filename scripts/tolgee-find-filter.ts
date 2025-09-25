// ... new script to query Tolgee API for 'Filter' key ...

const API_KEY = process.env.TOLGEE_API_KEY;
const BASE_URL = (process.env.TOLGEE_API_URL || 'https://app.tolgee.io').replace(/\/$/, '');
const PROJECT_ID_ENV = process.env.TOLGEE_PROJECT_ID;
const PROJECT_NAME_HINT = 'immodossier';
const SEARCH_TERM = 'Filter';

if (!API_KEY) {
  console.error('Missing TOLGEE_API_KEY. Please ensure Infisical is logged in and secrets are loaded.');
  process.exit(1);
}

async function getJson(url: string) {
  const res = await fetch(url, {
    headers: {
      'X-API-Key': API_KEY,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) return { ok: false, status: res.status, url } as const;
  try {
    const data = await res.json();
    return { ok: true, data, url } as const;
  } catch (e) {
    return { ok: false, status: 0, url } as const;
  }
}

function extractProjects(json: any): { id: string; name?: string }[] | null {
  if (!json) return null;
  if (Array.isArray(json)) return json as any[];
  if (json._embedded?.projects) return json._embedded.projects;
  if (json.projects) return json.projects;
  return null;
}

function extractKeyNames(json: any): string[] {
  if (!json) return [];
  const items = Array.isArray(json) ? json : (json._embedded?.keys || json.keys || json.content || []);
  return (items as any[]).map((it) => it?.name ?? it?.key?.name ?? it?.keyName ?? it?.key).filter(Boolean);
}

function extractTranslations(json: any): { key: string; language?: string; text?: string }[] {
  const results: { key: string; language?: string; text?: string }[] = [];
  if (!json) return results;
  // Try common shapes: array, paged content, or translation search results
  const items = Array.isArray(json) ? json : (json.content || json.translations || json._embedded?.translations || []);
  for (const item of items) {
    // Common possible shapes
    const key = item?.keyName || item?.key?.name || item?.key || item?.name;
    const lang = item?.languageTag || item?.language || item?.lang;
    const text = item?.text || item?.value || item?.translation;
    if (key) results.push({ key, language: lang, text });
  }
  return results;
}

async function tryEndpoints(paths: string[]) {
  for (const p of paths) {
    const url = `${BASE_URL}${p}`;
    const r = await getJson(url);
    if (r.ok) return r;
  }
  return null;
}

async function main() {
  // 1) Determine project id
  let projectId = PROJECT_ID_ENV || '';
  let projectName: string | undefined;
  let projectsSourceUrl: string | undefined;

  if (!projectId) {
    const listCandidates = ['/v2/projects', '/api/projects', '/projects'];
    const listRes = await tryEndpoints(listCandidates);
    if (!listRes) {
      console.error('Unable to list projects from Tolgee (tried /v2/projects, /api/projects, /projects)');
      process.exit(2);
    }
    projectsSourceUrl = listRes.url;
    const projects = extractProjects(listRes.data) || [];
    const found = projects.find((p: any) => (p.name || '').toLowerCase().includes(PROJECT_NAME_HINT));
    const pick = found || projects[0];
    if (!pick) {
      console.error('No projects found in Tolgee account.');
      process.exit(3);
    }
    projectId = String(pick.id);
    projectName = pick.name;
  }

  // 2) Search keys by name ("Filter")
  const keyPaths = [
    `/v2/projects/${projectId}/keys?search=${encodeURIComponent(SEARCH_TERM)}`,
    `/api/projects/${projectId}/keys?search=${encodeURIComponent(SEARCH_TERM)}`,
  ];
  const keysRes = await tryEndpoints(keyPaths);
  const keys = keysRes ? extractKeyNames(keysRes.data) : [];

  // 3) Search translations containing text "Filter"
  const transPaths = [
    // Some deployments use a dedicated translations search endpoint; try both styles
    `/v2/projects/${projectId}/translations?search=${encodeURIComponent(SEARCH_TERM)}`,
    `/v2/projects/${projectId}/translations/search?search=${encodeURIComponent(SEARCH_TERM)}`,
    `/api/projects/${projectId}/translations?search=${encodeURIComponent(SEARCH_TERM)}`,
  ];
  const transRes = await tryEndpoints(transPaths);
  const translations = transRes ? extractTranslations(transRes.data) : [];

  const summary = {
    baseUrlUsed: BASE_URL,
    projectsEndpointUsed: projectsSourceUrl,
    project: { id: projectId, name: projectName },
    searchTerm: SEARCH_TERM,
    keySearchEndpointUsed: keysRes?.url,
    translationSearchEndpointUsed: transRes?.url,
    keysFound: keys,
    translationsFoundSample: translations.slice(0, 10),
  };

  console.log('\n=== Tolgee Search Summary ===');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error('Tolgee search failed:', e);
  process.exit(1);
});
