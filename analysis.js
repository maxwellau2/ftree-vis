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

// General bisection: partition all nodes by x-coordinate into two halves,
// count crossing links
function computeGeneralBisection(graph) {
  var allNodes = graph.nodes.slice().sort(function (a, b) {
    return a.x - b.x;
  });
  var mid = Math.floor(allNodes.length / 2);
  var leftSet = {};

  for (var i = 0; i < mid; i++) leftSet[allNodes[i].id] = true;

  var crossLinks = 0;
  for (var i = 0; i < graph.edges.length; i++) {
    var e = graph.edges[i];
    var fromLeft = !!leftSet[e.from];
    var toLeft = !!leftSet[e.to];
    if (fromLeft !== toLeft) {
      crossLinks++;
    }
  }
  return crossLinks;
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
      "<p>Bisection BW &asymp; <strong>" + bw + " link-units</strong></p>";
    html +=
      "<p><em>Computed by partitioning nodes into two equal halves (left/right) and counting crossing links.</em></p>";
  }

  panel.html(html);
}
