#!/usr/bin/env node
'use strict';

function fail(msg) {
  console.error('ERROR: ' + msg);
  process.exit(1);
}

const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  fail('Usage: node ua-arch-analyze.js <input.json> <output.json>');
}

let raw;
try {
  raw = fs.readFileSync(inputPath, 'utf8');
} catch (e) {
  fail('Could not read input file: ' + e.message);
}

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  fail('Invalid JSON input: ' + e.message);
}

const fileNodes = Array.isArray(data.fileNodes) ? data.fileNodes : [];
const importEdges = Array.isArray(data.importEdges) ? data.importEdges : [];
const allEdges = Array.isArray(data.allEdges) ? data.allEdges : [];

// ---------- A. Directory Grouping ----------

function normalizePath(p) {
  return (p || '').replace(/\\/g, '/');
}

const nodeById = new Map();
for (const n of fileNodes) {
  nodeById.set(n.id, n);
}

const filePaths = fileNodes.map(n => normalizePath(n.filePath || n.name || ''));

function commonPrefix(paths) {
  if (paths.length === 0) return '';
  const splitPaths = paths.map(p => p.split('/').slice(0, -1)); // dir segments only
  let prefix = splitPaths[0];
  for (let i = 1; i < splitPaths.length; i++) {
    const cur = splitPaths[i];
    let j = 0;
    while (j < prefix.length && j < cur.length && prefix[j] === cur[j]) j++;
    prefix = prefix.slice(0, j);
    if (prefix.length === 0) break;
  }
  return prefix.length ? prefix.join('/') + '/' : '';
}

const prefix = commonPrefix(filePaths);

function firstSegmentAfterPrefix(fp, prefix) {
  let rest = fp;
  if (prefix && rest.startsWith(prefix)) {
    rest = rest.slice(prefix.length);
  }
  const parts = rest.split('/').filter(Boolean);
  if (parts.length <= 1) {
    // file directly in this dir (no subdirectory) -- flat structure marker
    return null;
  }
  return parts[0];
}

let isFlat = true;
const directoryGroups = {};

for (const n of fileNodes) {
  const fp = normalizePath(n.filePath || n.name || '');
  let seg = firstSegmentAfterPrefix(fp, prefix);
  if (seg !== null) isFlat = false;
}

if (isFlat) {
  // group by file type/extension pattern
  for (const n of fileNodes) {
    const fp = normalizePath(n.filePath || n.name || '');
    const base = path.basename(fp);
    let group;
    if (/\.test\.|\.spec\.|^test_|_test\.|Test\.|_spec\./.test(base)) {
      group = 'test';
    } else if (/\.config\.|^config\.|\.conf\./.test(base)) {
      group = 'config';
    } else {
      const ext = path.extname(base).replace('.', '') || 'other';
      group = ext;
    }
    if (!directoryGroups[group]) directoryGroups[group] = [];
    directoryGroups[group].push(n.id);
  }
} else {
  for (const n of fileNodes) {
    const fp = normalizePath(n.filePath || n.name || '');
    let seg = firstSegmentAfterPrefix(fp, prefix);
    if (seg === null) {
      // file sits directly at the common prefix root -- use 'root'
      seg = 'root';
    }
    if (!directoryGroups[seg]) directoryGroups[seg] = [];
    directoryGroups[seg].push(n.id);
  }
}

// ---------- B. Node Type Grouping ----------

const nodeTypeGroups = {};
for (const n of fileNodes) {
  const t = n.type || 'file';
  if (!nodeTypeGroups[t]) nodeTypeGroups[t] = [];
  nodeTypeGroups[t].push(n.id);
}

// ---------- C. Import Adjacency Matrix ----------

const fileFanOut = {};
const fileFanIn = {};
const importAdj = new Map(); // id -> Set of targets

for (const e of importEdges) {
  if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
  fileFanOut[e.source] = (fileFanOut[e.source] || 0) + 1;
  fileFanIn[e.target] = (fileFanIn[e.target] || 0) + 1;
  if (!importAdj.has(e.source)) importAdj.set(e.source, new Set());
  importAdj.get(e.source).add(e.target);
}

function groupOf(id) {
  for (const [g, ids] of Object.entries(directoryGroups)) {
    if (ids.includes(id)) return g;
  }
  return null;
}

const groupImportsFrom = {}; // group -> Set(groups it imports from)
const groupImportedBy = {}; // group -> Set(groups that import it)

for (const g of Object.keys(directoryGroups)) {
  groupImportsFrom[g] = new Set();
  groupImportedBy[g] = new Set();
}

for (const e of importEdges) {
  if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
  const sg = groupOf(e.source);
  const tg = groupOf(e.target);
  if (sg && tg && sg !== tg) {
    groupImportsFrom[sg].add(tg);
    groupImportedBy[tg].add(sg);
  }
}

// ---------- D. Cross-Category Dependency Analysis ----------

const crossCategoryMap = new Map(); // key: fromType|toType|edgeType -> count

function typeOf(id) {
  const n = nodeById.get(id);
  return n ? n.type : null;
}

for (const e of allEdges) {
  const ft = typeOf(e.source);
  const tt = typeOf(e.target);
  if (!ft || !tt) continue;
  if (ft === tt) continue; // cross-category only
  const key = ft + '|' + tt + '|' + e.type;
  crossCategoryMap.set(key, (crossCategoryMap.get(key) || 0) + 1);
}

const crossCategoryEdges = [];
for (const [key, count] of crossCategoryMap.entries()) {
  const [fromType, toType, edgeType] = key.split('|');
  crossCategoryEdges.push({ fromType, toType, edgeType, count });
}

// ---------- E. Inter-Group Import Frequency ----------

const interGroupMap = new Map(); // "from|to" -> count
for (const e of importEdges) {
  if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
  const sg = groupOf(e.source);
  const tg = groupOf(e.target);
  if (!sg || !tg || sg === tg) continue;
  const key = sg + '|' + tg;
  interGroupMap.set(key, (interGroupMap.get(key) || 0) + 1);
}

const interGroupImports = [];
for (const [key, count] of interGroupMap.entries()) {
  const [from, to] = key.split('|');
  interGroupImports.push({ from, to, count });
}

// ---------- F. Intra-Group Import Density ----------

const intraGroupDensity = {};
for (const g of Object.keys(directoryGroups)) {
  let internalEdges = 0;
  let totalEdges = 0;
  for (const e of importEdges) {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
    const sg = groupOf(e.source);
    const tg = groupOf(e.target);
    if (sg === g || tg === g) {
      totalEdges++;
      if (sg === g && tg === g) internalEdges++;
    }
  }
  intraGroupDensity[g] = {
    internalEdges,
    totalEdges,
    density: totalEdges > 0 ? internalEdges / totalEdges : 0
  };
}

// ---------- G. Directory Pattern Matching ----------

const dirPatternMap = {
  routes: 'api', api: 'api', controllers: 'api', endpoints: 'api', handlers: 'api',
  services: 'service', core: 'service', lib: 'service', domain: 'service', logic: 'service',
  models: 'data', db: 'data', data: 'data', persistence: 'data', repository: 'data', entities: 'data',
  components: 'ui', views: 'ui', pages: 'ui', ui: 'ui', layouts: 'ui', screens: 'ui',
  middleware: 'middleware', plugins: 'middleware', interceptors: 'middleware', guards: 'middleware',
  utils: 'utility', helpers: 'utility', common: 'utility', shared: 'utility', tools: 'utility',
  config: 'config', constants: 'config', env: 'config', settings: 'config',
  __tests__: 'test', test: 'test', tests: 'test', spec: 'test', specs: 'test',
  types: 'types', interfaces: 'types', schemas: 'types', contracts: 'types', dtos: 'types',
  hooks: 'hooks',
  store: 'state', state: 'state', reducers: 'state', actions: 'state', slices: 'state',
  assets: 'assets', static: 'assets', public: 'assets',
  migrations: 'data',
  management: 'config', commands: 'config',
  templatetags: 'utility',
  signals: 'service',
  serializers: 'api',
  cmd: 'entry',
  internal: 'service',
  pkg: 'utility',
  'src/main/java': 'service',
  'src/test/java': 'test',
  dto: 'types', request: 'types', response: 'types',
  entity: 'data',
  controller: 'api',
  routers: 'api',
  composables: 'service',
  blueprints: 'api',
  mailers: 'service', jobs: 'service', channels: 'service',
  bin: 'entry',
  docs: 'documentation', documentation: 'documentation', wiki: 'documentation',
  deploy: 'infrastructure', deployment: 'infrastructure', infra: 'infrastructure', infrastructure: 'infrastructure',
  '.github': 'ci-cd', '.gitlab': 'ci-cd', '.circleci': 'ci-cd',
  k8s: 'infrastructure', kubernetes: 'infrastructure', helm: 'infrastructure', charts: 'infrastructure',
  terraform: 'infrastructure', tf: 'infrastructure',
  docker: 'infrastructure',
  sql: 'data', database: 'data', schema: 'data'
};

const patternMatches = {};
for (const g of Object.keys(directoryGroups)) {
  const lower = g.toLowerCase();
  if (dirPatternMap[lower]) {
    patternMatches[g] = dirPatternMap[lower];
  }
}

// ---------- H. Deployment Topology Detection ----------

const infraFiles = [];
let hasDockerfile = false, hasCompose = false, hasK8s = false, hasTerraform = false, hasCI = false;

for (const n of fileNodes) {
  const fp = normalizePath(n.filePath || n.name || '');
  const base = path.basename(fp);
  if (/^Dockerfile/i.test(base)) { hasDockerfile = true; infraFiles.push(fp); }
  if (/docker-compose/i.test(base)) { hasCompose = true; infraFiles.push(fp); }
  if (/\.ya?ml$/.test(base) && /k8s|kubernetes/i.test(fp)) { hasK8s = true; infraFiles.push(fp); }
  if (/\.tf$|\.tfvars$/.test(base)) { hasTerraform = true; infraFiles.push(fp); }
  if (/^\.github\/workflows\//.test(fp) || /\.gitlab-ci\.yml$/i.test(base) || /^Jenkinsfile$/i.test(base)) {
    hasCI = true; infraFiles.push(fp);
  }
  if (/^Makefile$/i.test(base)) { infraFiles.push(fp); }
}

const deploymentTopology = {
  hasDockerfile, hasCompose, hasK8s, hasTerraform, hasCI,
  infraFiles: Array.from(new Set(infraFiles))
};

// ---------- I. Data Pipeline Detection ----------

const schemaFiles = [];
const migrationFiles = [];
const dataModelFiles = [];
const apiHandlerFiles = [];

for (const n of fileNodes) {
  const fp = normalizePath(n.filePath || n.name || '');
  const base = path.basename(fp);
  if (/\.sql$/i.test(base) || /\.graphql$|\.gql$|\.proto$|\.prisma$/i.test(base)) schemaFiles.push(fp);
  if (/migrations?\//i.test(fp)) migrationFiles.push(fp);
  const g = groupOf(n.id);
  if (g && patternMatches[g] === 'data') dataModelFiles.push(fp);
  if (g && patternMatches[g] === 'api') apiHandlerFiles.push(fp);
}

const dataPipeline = { schemaFiles, migrationFiles, dataModelFiles, apiHandlerFiles };

// ---------- J. Documentation Coverage ----------

const docFilePaths = fileNodes.filter(n => n.type === 'document').map(n => normalizePath(n.filePath || ''));
let groupsWithDocs = 0;
const undocumentedGroups = [];

for (const g of Object.keys(directoryGroups)) {
  const hasReadme = docFilePaths.some(dp => {
    const dir = path.dirname(dp);
    return dir === g || dp.toLowerCase().includes('/' + g.toLowerCase() + '/') || dp.toLowerCase().startsWith(g.toLowerCase() + '/');
  });
  if (hasReadme) {
    groupsWithDocs++;
  } else {
    undocumentedGroups.push(g);
  }
}

const totalGroups = Object.keys(directoryGroups).length;
const docCoverage = {
  groupsWithDocs,
  totalGroups,
  coverageRatio: totalGroups > 0 ? groupsWithDocs / totalGroups : 0,
  undocumentedGroups
};

// ---------- K. Dependency Direction ----------

const dependencyDirection = [];
for (const { from, to, count } of interGroupImports) {
  const reverseKey = to + '|' + from;
  const reverseCount = interGroupMap.get(reverseKey) || 0;
  if (count > reverseCount) {
    dependencyDirection.push({ dependent: from, dependsOn: to });
  }
}

// ---------- fileStats ----------

const filesPerGroup = {};
for (const [g, ids] of Object.entries(directoryGroups)) {
  filesPerGroup[g] = ids.length;
}

const nodeTypeCounts = {};
for (const [t, ids] of Object.entries(nodeTypeGroups)) {
  nodeTypeCounts[t] = ids.length;
}

const fileStats = {
  totalFileNodes: fileNodes.length,
  filesPerGroup,
  nodeTypeCounts
};

// ---------- Output ----------

const output = {
  scriptCompleted: true,
  directoryGroups,
  nodeTypeGroups,
  crossCategoryEdges,
  interGroupImports,
  intraGroupDensity,
  patternMatches,
  deploymentTopology,
  dataPipeline,
  docCoverage,
  dependencyDirection,
  fileStats,
  fileFanIn,
  fileFanOut
};

try {
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
} catch (e) {
  fail('Could not write output file: ' + e.message);
}

process.exit(0);
