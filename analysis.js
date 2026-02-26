// ============================================================
// Graph Analysis Engine
// BFS-based path counting, bisection bandwidth
// ============================================================

function buildAdjacency(graph) {
  var adj = {};
  for (var i = 0; i < graph.nodes.length; i++) {
    adj[graph.nodes[i].id] = [];
  }
  for (var i = 0; i < graph.edges.length; i++) {
    var e = graph.edges[i];
    if (!adj[e.from]) adj[e.from] = [];
    if (!adj[e.to]) adj[e.to] = [];
    adj[e.from].push(e.to);
    adj[e.to].push(e.from);
  }
  return adj;
}

// Count the number of shortest (minimal length) paths from src to dst
// Returns { count: number, dist: number }
function countShortestPaths(adj, src, dst) {
  var dist = {};
  var count = {};
  var queue = [src];
  dist[src] = 0;
  count[src] = 1;

  while (queue.length > 0) {
    var node = queue.shift();
    var neighbors = adj[node] || [];
    for (var i = 0; i < neighbors.length; i++) {
      var nb = neighbors[i];
      if (dist[nb] === undefined) {
        dist[nb] = dist[node] + 1;
        count[nb] = count[node];
        queue.push(nb);
      } else if (dist[nb] === dist[node] + 1) {
        count[nb] += count[node];
      }
    }
  }

  return { count: count[dst] || 0, dist: dist[dst] || -1 };
}

// Count shortest paths from src to dst that pass through 'via'
// Only counts paths where dist(src,via) + dist(via,dst) == dist(src,dst)
function countPathsThroughNode(adj, src, dst, via) {
  var srcToDst = countShortestPaths(adj, src, dst);
  var srcToVia = countShortestPaths(adj, src, via);
  var viaToDst = countShortestPaths(adj, via, dst);

  if (srcToDst.dist < 0 || srcToVia.dist < 0 || viaToDst.dist < 0) {
    return 0;
  }

  if (srcToVia.dist + viaToDst.dist === srcToDst.dist) {
    return srcToVia.count * viaToDst.count;
  }
  return 0;
}

// Compute bisection bandwidth for a fat-tree
function computeBisectionBW(graph) {
  if (graph.metadata.type === "fattree") {
    var k = graph.metadata.k;
    var depth = graph.metadata.depth;
    return Math.pow(k, depth);
  }
  return computeGeneralBisection(graph);
}

// General bisection: find minimum cut that splits hosts into two equal halves.
// Groups hosts by their parent switch (ToR/leaf), enumerates balanced partitions
// of those groups, assigns each non-host node to minimize crossing links,
// and returns the minimum crossing link count across all balanced partitions.
function computeGeneralBisection(graph) {
  var adj = buildAdjacency(graph);

  // Group hosts by their parent switch (first neighbor that is a switch)
  var hostGroupMap = {}; // groupKey -> [hostId, ...]
  var hostToGroup = {};
  var switchSet = {};
  for (var i = 0; i < graph.switches.length; i++) {
    switchSet[graph.switches[i].id] = true;
  }
  for (var i = 0; i < graph.hosts.length; i++) {
    var hid = graph.hosts[i].id;
    var neighbors = adj[hid] || [];
    var parent = null;
    for (var j = 0; j < neighbors.length; j++) {
      if (switchSet[neighbors[j]]) { parent = neighbors[j]; break; }
    }
    var key = parent || hid;
    if (!hostGroupMap[key]) hostGroupMap[key] = [];
    hostGroupMap[key].push(hid);
    hostToGroup[hid] = key;
  }

  var groups = [];
  var groupSizes = [];
  for (var key in hostGroupMap) {
    groups.push(key);
    groupSizes.push(hostGroupMap[key].length);
  }

  var totalHosts = graph.hosts.length;
  var halfHosts = Math.floor(totalHosts / 2);

  // Enumerate all subsets of groups whose total host count = halfHosts
  // For small group counts (≤20) this is feasible via bitmask
  var nGroups = groups.length;
  if (nGroups > 20) {
    // Too many groups for exact enumeration; fall back to spatial heuristic
    return computeSpatialBisection(graph);
  }
  var bestCut = Infinity;

  for (var mask = 1; mask < (1 << nGroups) - 1; mask++) {
    // Count hosts in this subset
    var leftCount = 0;
    for (var g = 0; g < nGroups; g++) {
      if (mask & (1 << g)) leftCount += groupSizes[g];
    }
    if (leftCount !== halfHosts) continue;

    // Build left set of hosts
    var leftHosts = {};
    for (var g = 0; g < nGroups; g++) {
      if (mask & (1 << g)) {
        var hlist = hostGroupMap[groups[g]];
        for (var h = 0; h < hlist.length; h++) leftHosts[hlist[h]] = true;
      }
    }

    // Assign each switch to the side that minimizes crossing links.
    // Count how many edges connect it to left-hosts vs right-hosts (BFS 1-hop).
    // Then greedily assign switches: for each switch, count edges to already-
    // assigned left vs right nodes; assign to the side with more connections.
    // We do multiple passes until stable.
    var side = {}; // nodeId -> true (left) or false (right)
    for (var h in leftHosts) side[h] = true;
    for (var i = 0; i < graph.hosts.length; i++) {
      if (!leftHosts[graph.hosts[i].id]) side[graph.hosts[i].id] = false;
    }

    // Iteratively assign switches
    var changed = true;
    var maxIter = 10;
    while (changed && maxIter-- > 0) {
      changed = false;
      for (var s = 0; s < graph.switches.length; s++) {
        var sid = graph.switches[s].id;
        var neighbors = adj[sid] || [];
        var leftN = 0, rightN = 0;
        for (var n = 0; n < neighbors.length; n++) {
          if (side[neighbors[n]] === true) leftN++;
          else if (side[neighbors[n]] === false) rightN++;
        }
        var newSide = leftN >= rightN;
        if (side[sid] !== newSide) {
          side[sid] = newSide;
          changed = true;
        }
      }
    }

    // Count crossing links
    var crossLinks = 0;
    for (var i = 0; i < graph.edges.length; i++) {
      var e = graph.edges[i];
      if (side[e.from] !== side[e.to]) crossLinks++;
    }
    if (crossLinks < bestCut) bestCut = crossLinks;
  }

  return bestCut === Infinity ? 0 : bestCut;
}

// Spatial bisection fallback for topologies with too many host groups
function computeSpatialBisection(graph) {
  var allNodes = graph.nodes.slice().sort(function (a, b) {
    return a.x - b.x;
  });
  var mid = Math.floor(allNodes.length / 2);
  var leftSet = {};
  for (var i = 0; i < mid; i++) leftSet[allNodes[i].id] = true;
  var crossLinks = 0;
  for (var i = 0; i < graph.edges.length; i++) {
    var e = graph.edges[i];
    if (!!leftSet[e.from] !== !!leftSet[e.to]) crossLinks++;
  }
  return crossLinks;
}

// Find the first host in a different pod/block/leaf group from srcId.
// "Group" = hosts sharing the same parent ToR switch.
// For multi-level topologies (Jupiter, Meta), also checks the block/pod level:
// find first host whose parent ToR is in a different block/pod.
function findInterGroupHost(graph, adj, srcId) {
  var switchSet = {};
  for (var i = 0; i < graph.switches.length; i++) {
    switchSet[graph.switches[i].id] = graph.switches[i];
  }

  // Find the parent ToR of a host
  function parentTor(hostId) {
    var neighbors = adj[hostId] || [];
    for (var j = 0; j < neighbors.length; j++) {
      if (switchSet[neighbors[j]]) return switchSet[neighbors[j]];
    }
    return null;
  }

  var srcTor = parentTor(srcId);
  if (!srcTor) return null;

  // For topologies with block/pod attributes, find host in different block/pod
  var srcGroup = srcTor.block !== undefined ? srcTor.block : (srcTor.pod !== undefined ? srcTor.pod : null);

  for (var i = 0; i < graph.hosts.length; i++) {
    var hid = graph.hosts[i].id;
    if (hid === srcId) continue;
    var hTor = parentTor(hid);
    if (!hTor) continue;

    if (srcGroup !== null) {
      var hGroup = hTor.block !== undefined ? hTor.block : (hTor.pod !== undefined ? hTor.pod : null);
      if (hGroup !== null && hGroup !== srcGroup) return hid;
    } else {
      // No block/pod metadata (e.g., leaf-spine): find host under a different ToR
      if (hTor.id !== srcTor.id) return hid;
    }
  }
  return null;
}

// Find root/top-level switches for a given topology
function findRootSwitches(graph) {
  var type = graph.metadata.type;
  var roots = [];
  for (var i = 0; i < graph.switches.length; i++) {
    var sw = graph.switches[i];
    if (type === "fattree" && sw.level === 0) roots.push(sw);
    else if (type === "jupiter" && sw.subtype === "ocs") roots.push(sw);
    else if (type === "amazon" && sw.subtype === "spine") roots.push(sw);
    else if (type === "meta" && sw.subtype === "spine") roots.push(sw);
  }
  return roots;
}

function topoName(type) {
  var names = {
    fattree: "Fat Tree",
    jupiter: "Google Jupiter",
    amazon: "Amazon Leaf-Spine",
    meta: "Meta 3-Level Clos",
  };
  return names[type] || type;
}

// Main analysis runner — answers (a), (b), (c) for ALL topologies
function runAnalysis(graph) {
  var panel = d3.select("#analysisContent");
  panel.html("");

  if (!graph || graph.nodes.length === 0) {
    panel.html("<p>No topology loaded.</p>");
    return;
  }

  var adj = buildAdjacency(graph);
  var type = graph.metadata.type;
  var html = "";

  html += "<p><em>" + topoName(type) + "</em> &mdash; ";
  html +=
    graph.hosts.length +
    " hosts, " +
    graph.switches.length +
    " switches, " +
    graph.edges.length +
    " links</p>";

  // ---- (a) Paths from arbitrary server to arbitrary root switch ----
  html += "<h4>(a) Paths: Server &rarr; Root Switch</h4>";
  var rootSwitches = findRootSwitches(graph);
  if (graph.hosts.length > 0 && rootSwitches.length > 0) {
    var exHost = graph.hosts[0].id;
    var exRoot = rootSwitches[0].id;
    var result = countShortestPaths(adj, exHost, exRoot);
    html +=
      "<p>Example: " +
      exHost +
      " &rarr; " +
      exRoot +
      ": <strong>" +
      result.count +
      " minimal-length path(s)</strong> (length " +
      result.dist +
      ")</p>";

    if (rootSwitches.length > 1) {
      var exRoot2 = rootSwitches[1].id;
      var result2 = countShortestPaths(adj, exHost, exRoot2);
      html +=
        "<p>Example: " +
        exHost +
        " &rarr; " +
        exRoot2 +
        ": <strong>" +
        result2.count +
        " minimal-length path(s)</strong> (length " +
        result2.dist +
        ")</p>";
    }

    if (type === "fattree") {
      var k = graph.metadata.k;
      var depth = graph.metadata.depth;
      html +=
        "<p>Formula: k<sup>d-1</sup> = " +
        k +
        "<sup>" +
        (depth - 1) +
        "</sup> = <strong>" +
        Math.pow(k, depth - 1) +
        "</strong></p>";
    }
  } else {
    html += "<p>No root switches or hosts found.</p>";
  }

  // ---- (b) Paths between specific hosts ----
  html += "<h4>(b) Paths Between Hosts</h4>";
  if (graph.hosts.length >= 5) {
    var m1m3 = countShortestPaths(adj, "M1", "M3");
    html +=
      "<p>M1 &rarr; M3: <strong>" +
      m1m3.count +
      " path(s)</strong> (length " +
      m1m3.dist +
      ")</p>";

    var m1m5 = countShortestPaths(adj, "M1", "M5");
    html +=
      "<p>M1 &rarr; M5: <strong>" +
      m1m5.count +
      " path(s)</strong> (length " +
      m1m5.dist +
      ")</p>";

    if (adj["S2"]) {
      var throughS2 = countPathsThroughNode(adj, "M1", "M5", "S2");
      html +=
        "<p>M1 &rarr; M5 through S2: <strong>" +
        throughS2 +
        " path(s)</strong></p>";
    }

    // For topologies with pods/blocks, also show an inter-group pair
    // to demonstrate cross-pod/block path diversity through spine/OCS
    var interPairDst = findInterGroupHost(graph, adj, "M1");
    if (interPairDst) {
      var interResult = countShortestPaths(adj, "M1", interPairDst);
      html +=
        "<p><em>Inter-group example:</em> M1 &rarr; " + interPairDst +
        ": <strong>" + interResult.count +
        " path(s)</strong> (length " + interResult.dist + ")</p>";

      // Show paths through S2 for the inter-group pair
      if (adj["S2"]) {
        var interThroughS2 = countPathsThroughNode(adj, "M1", interPairDst, "S2");
        html +=
          "<p><em>Inter-group:</em> M1 &rarr; " + interPairDst +
          " through S2: <strong>" + interThroughS2 +
          " path(s)</strong></p>";
      }
    }
  } else if (graph.hosts.length >= 3) {
    var m1m3 = countShortestPaths(adj, "M1", "M3");
    html +=
      "<p>M1 &rarr; M3: <strong>" +
      m1m3.count +
      " path(s)</strong> (length " +
      m1m3.dist +
      ")</p>";
    html += "<p>Need at least 5 hosts for M1&rarr;M5 analysis.</p>";
  } else {
    html += "<p>Need at least 5 hosts. Try adjusting parameters.</p>";
  }

  // ---- (c) Bisection Bandwidth ----
  html += "<h4>(c) Bisection Bandwidth</h4>";
  if (type === "fattree") {
    var k = graph.metadata.k;
    var depth = graph.metadata.depth;
    var bw = Math.pow(k, depth);
    html +=
      "<p>Bisection BW = k<sup>d</sup> = " +
      k +
      "<sup>" +
      depth +
      "</sup> = <strong>" +
      bw +
      " link-units</strong></p>";
    html +=
      "<p><em>The minimum cut divides the tree at the root level. Each of the " +
      Math.pow(k, depth - 1) +
      " root switches has k=" +
      k +
      " links to each side.</em></p>";
  } else {
    var bw = computeGeneralBisection(graph);
    html +=
      "<p>Bisection BW = <strong>" + bw + " link-units</strong></p>";
    html +=
      "<p><em>Minimum cut that splits hosts into two equal halves, computed by enumerating balanced partitions of host groups.</em></p>";
  }

  // ---- (d) Fault Tolerance (single failure) ----
  html += "<h4>(d) Fault Tolerance</h4>";
  var ftResult = analyzeFaultTolerance(graph, adj);
  if (ftResult) {
    html += "<p>Removing switch " + ftResult.switchId +
      " (" + ftResult.switchType + "):</p>";
    html += "<p>Host pairs losing all shortest paths: <strong>" +
      ftResult.disconnectedPairs + "</strong> of " + ftResult.totalPairs + "</p>";
    html += "<p>Avg path count change: <strong>" +
      ftResult.avgPathReduction.toFixed(1) + "%</strong> reduction</p>";
    html += "<p>Oversubscription ratio: <strong>" +
      ftResult.oversubscription + "</strong></p>";
  }

  // Skip expensive all-pairs experiments for large topologies (>100 hosts)
  var maxHostsForFullAnalysis = 100;

  // ---- (e) Multi-Failure Cascade ----
  html += "<h4>(e) Multi-Failure Cascade</h4>";
  if (graph.hosts.length <= maxHostsForFullAnalysis) {
    var cascade = multiFailureCascade(graph, adj);
    if (cascade.length > 0) {
      html += '<table class="analysis-table"><tr><th>Roots removed</th><th>Path survival</th><th>Disconnected pairs</th></tr>';
      for (var ci = 0; ci < cascade.length; ci++) {
        var c = cascade[ci];
        html += "<tr><td>" + c.removed + " of " + c.totalRoots +
          "</td><td>" + c.avgPathSurvival.toFixed(1) +
          "%</td><td>" + c.disconnectedPairs + " / " + c.totalPairs + "</td></tr>";
      }
      html += "</table>";
    }
  } else {
    html += "<p><em>Skipped (>" + maxHostsForFullAnalysis + " hosts). Use k&le;4 for full analysis.</em></p>";
  }

  // ---- (f) Network Statistics ----
  html += "<h4>(f) Network Statistics</h4>";
  if (graph.hosts.length <= maxHostsForFullAnalysis) {
    var stats = allPairsStats(graph, adj);
    html += "<p>Diameter (max shortest path): <strong>" + stats.diameter + "</strong></p>";
    html += "<p>Min host-to-host distance: <strong>" + stats.minDist + "</strong></p>";
    html += "<p>Avg host-to-host distance: <strong>" + stats.avgDist + "</strong></p>";
    html += "<p>Avg paths per host pair: <strong>" + stats.avgPaths + "</strong></p>";
  } else {
    html += "<p><em>Skipped (>" + maxHostsForFullAnalysis + " hosts). Use k&le;4 for full analysis.</em></p>";
  }

  // ---- (g) Cost Efficiency ----
  html += "<h4>(g) Cost Efficiency</h4>";
  if (graph.hosts.length <= maxHostsForFullAnalysis) {
    var ce = costEfficiency(graph, adj);
    html += "<p>Avg paths per switch: <strong>" + ce.pathsPerSwitch + "</strong></p>";
    html += "<p>Bisection BW per link: <strong>" + ce.bwPerLink + "</strong></p>";
  } else {
    html += "<p><em>Skipped (>" + maxHostsForFullAnalysis + " hosts). Use k&le;4 for full analysis.</em></p>";
  }

  // ---- Sources ----
  var sources = topoSources(type);
  if (sources) {
    html += "<h4>Sources</h4>" + sources;
  }

  panel.html(html);
}

// Fault tolerance: remove the most critical switch and measure impact
function analyzeFaultTolerance(graph, adj) {
  if (graph.hosts.length < 2 || graph.switches.length < 1) return null;

  var oversubscription = computeOversubscription(graph, adj);
  var roots = findRootSwitches(graph);
  var testSwitch = roots.length > 0 ? roots[0] : graph.switches[0];

  var adjReduced = {};
  for (var id in adj) {
    if (id === testSwitch.id) continue;
    adjReduced[id] = [];
    for (var i = 0; i < adj[id].length; i++) {
      if (adj[id][i] !== testSwitch.id) adjReduced[id].push(adj[id][i]);
    }
  }

  var totalPairs = 0, disconnectedPairs = 0, totalReduction = 0;
  var sampledHosts = sampleHostsAcrossGroups(graph, adj, 3);

  for (var i = 0; i < sampledHosts.length; i++) {
    for (var j = i + 1; j < sampledHosts.length; j++) {
      var h1 = sampledHosts[i].id, h2 = sampledHosts[j].id;
      var orig = countShortestPaths(adj, h1, h2);
      var reduced = countShortestPaths(adjReduced, h1, h2);
      totalPairs++;
      if (reduced.count === 0 && orig.count > 0) {
        disconnectedPairs++;
      } else if (orig.count > 0) {
        totalReduction += (1 - reduced.count / orig.count) * 100;
      }
    }
  }

  var avgReduction = totalPairs > 0 ? totalReduction / totalPairs : 0;

  return {
    switchId: testSwitch.id,
    switchType: testSwitch.subtype || "level-" + (testSwitch.level || 0),
    disconnectedPairs: disconnectedPairs,
    totalPairs: totalPairs,
    avgPathReduction: avgReduction,
    oversubscription: oversubscription
  };
}

// ============================================================
// Sample hosts evenly across pods/blocks/groups so that
// inter-group pairs are always represented.
// Returns an array of host objects.
// ============================================================
function sampleHostsAcrossGroups(graph, adj, maxPerGroup) {
  if (!maxPerGroup) maxPerGroup = 3;
  var switchSet = {};
  for (var i = 0; i < graph.switches.length; i++)
    switchSet[graph.switches[i].id] = graph.switches[i];

  // Group hosts by their parent ToR's pod/block attribute
  var groups = {};  // groupKey -> [hostObj, ...]
  for (var i = 0; i < graph.hosts.length; i++) {
    var h = graph.hosts[i];
    var neighbors = adj[h.id] || [];
    var parentSw = null;
    for (var j = 0; j < neighbors.length; j++) {
      if (switchSet[neighbors[j]]) { parentSw = switchSet[neighbors[j]]; break; }
    }
    var groupKey = "default";
    if (parentSw) {
      if (parentSw.block !== undefined) groupKey = "b" + parentSw.block;
      else if (parentSw.pod !== undefined) groupKey = "p" + parentSw.pod;
      else groupKey = "tor_" + parentSw.id;
    }
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(h);
  }

  // For fat tree: hosts grouped by ToR, but we want pod-level grouping.
  // Re-group by pod: in fat tree k=4,d=3, edge switches are at level 2.
  // Pod = floor(edgeSwitchIndex / k). Each edge switch has k hosts.
  if (graph.metadata.type === "fattree") {
    groups = {};
    var k = graph.metadata.k;
    for (var i = 0; i < graph.hosts.length; i++) {
      // Pod index: each pod has k edge switches, each with k hosts = k^2 hosts per pod
      var podIdx = Math.floor(i / (k * k));
      var key = "pod" + podIdx;
      if (!groups[key]) groups[key] = [];
      groups[key].push(graph.hosts[i]);
    }
  }

  // Pick up to maxPerGroup hosts from each group
  var sampled = [];
  for (var key in groups) {
    var g = groups[key];
    var n = Math.min(g.length, maxPerGroup);
    for (var i = 0; i < n; i++) sampled.push(g[i]);
  }
  return sampled;
}

// ============================================================
// Multi-failure cascade: progressively remove 1..N root switches
// Returns array of { removed, avgPathSurvival%, disconnectedPairs }
// ============================================================
function multiFailureCascade(graph, adj) {
  var roots = findRootSwitches(graph);
  if (roots.length === 0) return [];
  var sampledHosts = sampleHostsAcrossGroups(graph, adj, 3);
  var results = [];

  // Compute baseline total paths using cross-group sampled hosts
  var baselinePaths = [];
  for (var i = 0; i < sampledHosts.length; i++) {
    for (var j = i + 1; j < sampledHosts.length; j++) {
      baselinePaths.push(countShortestPaths(adj, sampledHosts[i].id, sampledHosts[j].id));
    }
  }

  for (var nFail = 1; nFail <= roots.length; nFail++) {
    // Remove first nFail root switches
    var removedSet = {};
    for (var r = 0; r < nFail; r++) removedSet[roots[r].id] = true;

    var adjR = {};
    for (var id in adj) {
      if (removedSet[id]) continue;
      adjR[id] = [];
      for (var ki = 0; ki < adj[id].length; ki++) {
        if (!removedSet[adj[id][ki]]) adjR[id].push(adj[id][ki]);
      }
    }

    var totalSurvival = 0, disconnected = 0, pairIdx = 0;
    for (var i = 0; i < sampledHosts.length; i++) {
      for (var j = i + 1; j < sampledHosts.length; j++) {
        var orig = baselinePaths[pairIdx++];
        var reduced = countShortestPaths(adjR, sampledHosts[i].id, sampledHosts[j].id);
        if (reduced.count === 0 && orig.count > 0) {
          disconnected++;
        } else if (orig.count > 0) {
          totalSurvival += (reduced.count / orig.count) * 100;
        }
      }
    }
    var totalPairs = pairIdx;
    var connectedPairs = totalPairs - disconnected;
    var avgSurvival = connectedPairs > 0 ? totalSurvival / totalPairs : 0;

    results.push({
      removed: nFail,
      totalRoots: roots.length,
      avgPathSurvival: avgSurvival,
      disconnectedPairs: disconnected,
      totalPairs: totalPairs
    });
  }
  return results;
}

// ============================================================
// All-pairs shortest path statistics: diameter, avg path length
// ============================================================
function allPairsStats(graph, adj) {
  var hosts = graph.hosts;
  var totalDist = 0, totalPaths = 0, maxDist = 0, minDist = Infinity;
  var pairCount = 0;
  var totalPathCount = 0;

  for (var i = 0; i < hosts.length; i++) {
    for (var j = i + 1; j < hosts.length; j++) {
      var r = countShortestPaths(adj, hosts[i].id, hosts[j].id);
      if (r.dist > 0) {
        totalDist += r.dist;
        totalPathCount += r.count;
        if (r.dist > maxDist) maxDist = r.dist;
        if (r.dist < minDist) minDist = r.dist;
        pairCount++;
      }
    }
  }

  return {
    diameter: maxDist,
    minDist: minDist === Infinity ? 0 : minDist,
    avgDist: pairCount > 0 ? (totalDist / pairCount).toFixed(2) : 0,
    avgPaths: pairCount > 0 ? (totalPathCount / pairCount).toFixed(2) : 0,
    totalPairs: pairCount
  };
}

// ============================================================
// Cost-efficiency: paths-per-switch, bisection-BW-per-link
// ============================================================
function costEfficiency(graph, adj) {
  var hosts = graph.hosts;
  var totalPathCount = 0, pairCount = 0;
  for (var i = 0; i < hosts.length; i++) {
    for (var j = i + 1; j < hosts.length; j++) {
      var r = countShortestPaths(adj, hosts[i].id, hosts[j].id);
      if (r.count > 0) { totalPathCount += r.count; pairCount++; }
    }
  }
  var avgPaths = pairCount > 0 ? totalPathCount / pairCount : 0;
  var bw = computeBisectionBW(graph);

  return {
    pathsPerSwitch: (avgPaths / graph.switches.length).toFixed(3),
    bwPerLink: (bw / graph.edges.length).toFixed(3),
    totalSwitches: graph.switches.length,
    totalLinks: graph.edges.length,
    bisectionBW: bw,
    avgPaths: avgPaths.toFixed(2)
  };
}

// Compute oversubscription ratio at the edge layer
function computeOversubscription(graph, adj) {
  var switchSet = {};
  for (var i = 0; i < graph.switches.length; i++)
    switchSet[graph.switches[i].id] = true;
  var hostSet = {};
  for (var i = 0; i < graph.hosts.length; i++)
    hostSet[graph.hosts[i].id] = true;

  // Find edge switches (switches connected to at least one host)
  var totalDown = 0, totalUp = 0;
  for (var i = 0; i < graph.switches.length; i++) {
    var sid = graph.switches[i].id;
    var neighbors = adj[sid] || [];
    var down = 0, up = 0;
    for (var j = 0; j < neighbors.length; j++) {
      if (hostSet[neighbors[j]]) down++;
      else if (switchSet[neighbors[j]]) up++;
    }
    if (down > 0) { totalDown += down; totalUp += up; }
  }
  if (totalUp === 0) return "N/A";
  var ratio = totalDown / totalUp;
  return ratio === 1 ? "1:1 (non-oversubscribed)" :
    ratio.toFixed(2) + ":1";
}

function topoSources(type) {
  var s = {
    fattree:
      '<ul class="sources">' +
      '<li>C. Clos, "A Study of Non-Blocking Switching Networks," Bell System Technical Journal, 1953.</li>' +
      '<li>M. Al-Fares et al., "A Scalable, Commodity Data Center Network Architecture," ACM SIGCOMM 2008.</li>' +
      "</ul>",
    jupiter:
      '<ul class="sources">' +
      '<li>A. Singh et al., "Jupiter Rising: A Decade of Clos Topologies and Centralized Control in Google\'s Datacenter Network," ACM SIGCOMM 2015. ' +
      '<a href="https://dl.acm.org/doi/10.1145/2785956.2787508" target="_blank">Paper</a></li>' +
      '<li>S. Poutievski et al., "Jupiter Evolving: Transforming Google\'s Datacenter Network via Optical Circuit Switches and Software-Defined Networking," ACM SIGCOMM 2022. ' +
      '<a href="https://research.google/pubs/jupiter-evolving-transforming-googles-datacenter-network-via-optical-circuit-switches-and-software-defined-networking/" target="_blank">Paper</a></li>' +
      "</ul>",
    amazon:
      '<ul class="sources">' +
      '<li>JR Rivers &amp; S. Callaghan, "Dive deep on AWS networking infrastructure," AWS re:Invent 2022 (NET402). ' +
      '<a href="https://d1.awsstatic.com/events/Summits/reinvent2022/NET402_Dive-deep-on-AWS-networking-infrastructure.pdf" target="_blank">Slides</a></li>' +
      '<li>C. Clos, "A Study of Non-Blocking Switching Networks," Bell System Technical Journal, 1953.</li>' +
      "</ul>",
    meta:
      '<ul class="sources">' +
      '<li>A. Andreyev, "Introducing data center fabric, the next-generation Facebook data center network," Meta Engineering Blog, Nov 2014. ' +
      '<a href="https://engineering.fb.com/2014/11/14/production-engineering/introducing-data-center-fabric-the-next-generation-facebook-data-center-network/" target="_blank">Blog post</a></li>' +
      '<li>A. Andreyev et al., "Reinventing Facebook\'s data center network with F16 and Minipack," Meta Engineering Blog, Mar 2019. ' +
      '<a href="https://engineering.fb.com/2019/03/14/data-center-engineering/f16-minipack/" target="_blank">Blog post</a></li>' +
      "</ul>",
  };
  return s[type] || null;
}
