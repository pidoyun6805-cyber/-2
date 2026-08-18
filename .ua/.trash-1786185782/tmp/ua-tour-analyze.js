#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.error('ERROR: ' + msg);
  process.exit(1);
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  fail('Usage: node ua-tour-analyze.js <input.json> <output.json>');
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
  fail('Invalid JSON in input file: ' + e.message);
}

const nodes = Array.isArray(data.nodes) ? data.nodes : [];
const edges = Array.isArray(data.edges) ? data.edges : [];
const layers = Array.isArray(data.layers) ? data.layers : [];

if (nodes.length === 0) {
  fail('No nodes found in input.');
}

const nodeById = new Map();
for (const n of nodes) {
  nodeById.set(n.id, n);
}

// ---- Fan-in / Fan-out ----
const fanIn = new Map();
const fanOut = new Map();
for (const n of nodes) {
  fanIn.set(n.id, 0);
  fanOut.set(n.id, 0);
}
for (const e of edges) {
  if (fanOut.has(e.source)) fanOut.set(e.source, fanOut.get(e.source) + 1);
  if (fanIn.has(e.target)) fanIn.set(e.target, fanIn.get(e.target) + 1);
}

const fanInRanking = [...fanIn.entries()]
  .map(([id, count]) => ({ id, fanIn: count, name: nodeById.get(id) ? nodeById.get(id).name : id }))
  .sort((a, b) => b.fanIn - a.fanIn)
  .slice(0, 20);

const fanOutRanking = [...fanOut.entries()]
  .map(([id, count]) => ({ id, fanOut: count, name: nodeById.get(id) ? nodeById.get(id).name : id }))
  .sort((a, b) => b.fanOut - a.fanOut)
  .slice(0, 20);

// ---- Entry point candidates ----
const entryFilenames = new Set([
  'index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js', 'server.ts', 'server.js',
  'mod.rs', 'main.go', 'main.py', 'main.rs', 'manage.py', 'app.py', 'wsgi.py', 'asgi.py',
  'run.py', '__main__.py', 'Application.java', 'Main.java', 'Program.cs', 'config.ru',
  'index.php', 'App.swift', 'Application.kt', 'main.cpp', 'main.c'
]);

const fanOutValues = [...fanOut.values()].sort((a, b) => a - b);
const fanInValues = [...fanIn.values()].sort((a, b) => a - b);

function percentileThreshold(sortedArr, percentile) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.floor(sortedArr.length * percentile);
  return sortedArr[Math.min(idx, sortedArr.length - 1)];
}

const fanOutTop10Threshold = percentileThreshold(fanOutValues, 0.9);
const fanInBottom25Threshold = percentileThreshold(fanInValues, 0.25);

const entryScores = [];
for (const n of nodes) {
  let score = 0;
  const filePath = n.filePath || '';
  const name = n.name || '';
  const depth = filePath.split('/').filter(Boolean).length;

  if (n.type === 'document') {
    const base = path.basename(filePath).toLowerCase();
    const isRoot = depth <= 1;
    if (isRoot && base === 'readme.md') {
      score += 5;
    } else if (isRoot && base.endsWith('.md')) {
      score += 2;
    }
  } else if (n.type === 'file') {
    if (entryFilenames.has(name)) score += 3;
    if (depth <= 2) score += 1;
    if (fanOut.get(n.id) >= fanOutTop10Threshold && fanOut.get(n.id) > 0) score += 1;
    if (fanIn.get(n.id) <= fanInBottom25Threshold) score += 1;
  }

  if (score > 0) {
    entryScores.push({ id: n.id, score, name: n.name, summary: n.summary || '' });
  }
}

entryScores.sort((a, b) => b.score - a.score);
const entryPointCandidates = entryScores.slice(0, 5);

// ---- BFS from top code entry point (skip documents) ----
const codeEntryCandidates = entryScores.filter(c => {
  const node = nodeById.get(c.id);
  return node && node.type !== 'document';
});

const adjacency = new Map();
for (const n of nodes) adjacency.set(n.id, []);
for (const e of edges) {
  if ((e.type === 'imports' || e.type === 'calls') && adjacency.has(e.source)) {
    adjacency.get(e.source).push(e.target);
  }
}

let bfsTraversal = { startNode: null, order: [], depthMap: {}, byDepth: {} };
if (codeEntryCandidates.length > 0) {
  const startNode = codeEntryCandidates[0].id;
  const visited = new Set([startNode]);
  const order = [startNode];
  const depthMap = { [startNode]: 0 };
  const queue = [startNode];
  while (queue.length > 0) {
    const current = queue.shift();
    const currentDepth = depthMap[current];
    const neighbors = adjacency.get(current) || [];
    for (const nb of neighbors) {
      if (!visited.has(nb)) {
        visited.add(nb);
        depthMap[nb] = currentDepth + 1;
        order.push(nb);
        queue.push(nb);
      }
    }
  }
  const byDepth = {};
  for (const [id, d] of Object.entries(depthMap)) {
    if (!byDepth[d]) byDepth[d] = [];
    byDepth[d].push(id);
  }
  bfsTraversal = { startNode, order, depthMap, byDepth };
}

// ---- Non-code file inventory ----
const nonCodeFiles = {
  documentation: [],
  infrastructure: [],
  data: [],
  config: []
};
for (const n of nodes) {
  const entry = { id: n.id, name: n.name, summary: n.summary || '' };
  if (n.type === 'document') nonCodeFiles.documentation.push(entry);
  else if (n.type === 'service' || n.type === 'pipeline' || n.type === 'resource') nonCodeFiles.infrastructure.push(entry);
  else if (n.type === 'table' || n.type === 'schema' || n.type === 'endpoint') nonCodeFiles.data.push(entry);
  else if (n.type === 'config') nonCodeFiles.config.push(entry);
}

// ---- Tightly coupled clusters ----
const edgeSet = new Set(edges.map(e => `${e.source}|||${e.target}`));
const bidirectionalPairs = [];
for (const e of edges) {
  if (e.type !== 'imports' && e.type !== 'calls') continue;
  const reverseKey = `${e.target}|||${e.source}`;
  if (edgeSet.has(reverseKey) && e.source < e.target) {
    bidirectionalPairs.push([e.source, e.target]);
  }
}

const clusterMap = new Map(); // node -> cluster index
const clusters = [];
for (const [a, b] of bidirectionalPairs) {
  const idxA = clusterMap.has(a) ? clusterMap.get(a) : -1;
  const idxB = clusterMap.has(b) ? clusterMap.get(b) : -1;
  if (idxA === -1 && idxB === -1) {
    const idx = clusters.length;
    clusters.push(new Set([a, b]));
    clusterMap.set(a, idx);
    clusterMap.set(b, idx);
  } else if (idxA !== -1 && idxB === -1) {
    clusters[idxA].add(b);
    clusterMap.set(b, idxA);
  } else if (idxA === -1 && idxB !== -1) {
    clusters[idxB].add(a);
    clusterMap.set(a, idxB);
  } else if (idxA !== idxB) {
    for (const node of clusters[idxB]) {
      clusters[idxA].add(node);
      clusterMap.set(node, idxA);
    }
    clusters[idxB] = new Set();
  }
}

// Expand clusters: add nodes connecting to 2+ existing members
const allEdgePairs = edges.filter(e => e.type === 'imports' || e.type === 'calls');
for (const cluster of clusters) {
  if (cluster.size === 0) continue;
  let changed = true;
  while (changed && cluster.size < 5) {
    changed = false;
    const connectionCount = new Map();
    for (const e of allEdgePairs) {
      const inCluster = cluster.has(e.source);
      const inClusterT = cluster.has(e.target);
      if (inCluster && !inClusterT) {
        connectionCount.set(e.target, (connectionCount.get(e.target) || 0) + 1);
      } else if (inClusterT && !inCluster) {
        connectionCount.set(e.source, (connectionCount.get(e.source) || 0) + 1);
      }
    }
    for (const [node, count] of connectionCount.entries()) {
      if (count >= 2 && cluster.size < 5) {
        cluster.add(node);
        changed = true;
      }
    }
  }
}

function countEdgesWithin(nodeSet) {
  let count = 0;
  for (const e of edges) {
    if (nodeSet.has(e.source) && nodeSet.has(e.target)) count++;
  }
  return count;
}

const finalClusters = clusters
  .filter(c => c.size >= 2 && c.size <= 5)
  .map(c => ({ nodes: [...c], edgeCount: countEdgesWithin(c) }))
  .sort((a, b) => b.edgeCount - a.edgeCount)
  .slice(0, 10);

// ---- Layers ----
const layersOutput = {
  count: layers.length,
  list: layers.map(l => ({ id: l.id, name: l.name, description: l.description }))
};

// ---- Node summary index ----
const nodeSummaryIndex = {};
for (const n of nodes) {
  nodeSummaryIndex[n.id] = { name: n.name, type: n.type, summary: n.summary || '' };
}

const result = {
  scriptCompleted: true,
  entryPointCandidates,
  fanInRanking,
  fanOutRanking,
  bfsTraversal,
  nonCodeFiles,
  clusters: finalClusters,
  layers: layersOutput,
  nodeSummaryIndex,
  totalNodes: nodes.length,
  totalEdges: edges.length
};

try {
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
} catch (e) {
  fail('Could not write output file: ' + e.message);
}

console.log('Analysis complete. Wrote results to ' + outputPath);
process.exit(0);
