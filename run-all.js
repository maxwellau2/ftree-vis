// Run All Topologies Analysis
// Paste this into the browser console after loading index.html
// Or include via <script src="run-all.js"></script> at the bottom of index.html

(function() {
  var results = [];

  function log(s) { results.push(s); }
  function hr() { log("\n" + "=".repeat(60)); }

  // List of topologies to test
  var topos = [
    { name: "Fat Tree k=2 d=3", setup: function() { drawFatTree(3, 4); return currentGraph; } },
    { name: "Fat Tree k=4 d=3", setup: function() { drawFatTree(3, 8); return currentGraph; } },
    { name: "Jupiter",  setup: function() { topologies['jupiter'](); return currentGraph; } },
    { name: "Amazon",   setup: function() { topologies['amazon'](); return currentGraph; } },
    { name: "Meta",     setup: function() { topologies['meta'](); return currentGraph; } }
  ];

  topos.forEach(function(t) {
    hr();
    log("TOPOLOGY: " + t.name);
    hr();

    var graph = t.setup();
    if (!graph) { log("  ERROR: no graph"); return; }
    var adj = buildAdjacency(graph);

    log("Hosts: " + graph.hosts.length +
        "  Switches: " + graph.switches.length +
        "  Links: " + graph.edges.length);

    // Root switches
    var roots = findRootSwitches(graph);
    log("Root switches: " + roots.map(function(r){return r.id;}).join(", ") +
        " (" + roots.length + " total)");

    // (a) Server -> Root
    log("\n--- (a) Server -> Root Switch ---");
    if (graph.hosts.length > 0 && roots.length > 0) {
      var h = graph.hosts[0].id;
      roots.forEach(function(r) {
        var res = countShortestPaths(adj, h, r.id);
        log("  " + h + " -> " + r.id + ": " + res.count + " paths (len " + res.dist + ")");
      });
    }

    // (b) Host-to-host paths
    log("\n--- (b) Host-to-Host Paths ---");
    var pairs = [["M1","M2"], ["M1","M3"], ["M1","M5"]];
    pairs.forEach(function(p) {
      if (adj[p[0]] && adj[p[1]]) {
        var res = countShortestPaths(adj, p[0], p[1]);
        log("  " + p[0] + " -> " + p[1] + ": " + res.count + " paths (len " + res.dist + ")");
      }
    });

    // Through S2
    if (adj["M1"] && adj["M5"] && adj["S2"]) {
      var ts2 = countPathsThroughNode(adj, "M1", "M5", "S2");
      log("  M1 -> M5 through S2: " + ts2 + " paths");
    }
    if (adj["M1"] && adj["M3"] && adj["S2"]) {
      var ts2b = countPathsThroughNode(adj, "M1", "M3", "S2");
      log("  M1 -> M3 through S2: " + ts2b + " paths");
    }

    // Inter-group pair
    var interDst = findInterGroupHost(graph, adj, "M1");
    if (interDst) {
      var interRes = countShortestPaths(adj, "M1", interDst);
      log("  M1 -> " + interDst + " (inter-group): " + interRes.count + " paths (len " + interRes.dist + ")");
      if (adj["S2"]) {
        var interS2 = countPathsThroughNode(adj, "M1", interDst, "S2");
        log("  M1 -> " + interDst + " through S2: " + interS2 + " paths");
      }
    }

    // (c) Bisection BW
    log("\n--- (c) Bisection Bandwidth ---");
    var bw = computeBisectionBW(graph);
    log("  Bisection BW: " + bw + " link-units");

    // (d) Fault tolerance
    log("\n--- (d) Fault Tolerance (single failure) ---");
    var ft = analyzeFaultTolerance(graph, adj);
    if (ft) {
      log("  Removed: " + ft.switchId + " (" + ft.switchType + ")");
      log("  Disconnected pairs: " + ft.disconnectedPairs + " / " + ft.totalPairs);
      log("  Avg path reduction: " + ft.avgPathReduction.toFixed(1) + "%");
      log("  Oversubscription: " + ft.oversubscription);
    }

    // (e) Multi-failure cascade
    log("\n--- (e) Multi-Failure Cascade ---");
    var sampled = sampleHostsAcrossGroups(graph, adj, 3);
    log("  Sampled hosts: " + sampled.map(function(h){return h.id;}).join(", "));
    var cascade = multiFailureCascade(graph, adj);
    cascade.forEach(function(c) {
      log("  Remove " + c.removed + "/" + c.totalRoots +
          " roots: survival=" + c.avgPathSurvival.toFixed(1) +
          "%  disconnected=" + c.disconnectedPairs + "/" + c.totalPairs);
    });

    // (f) All-pairs stats
    log("\n--- (f) Network Statistics ---");
    var stats = allPairsStats(graph, adj);
    log("  Diameter: " + stats.diameter);
    log("  Min distance: " + stats.minDist);
    log("  Avg distance: " + stats.avgDist);
    log("  Avg paths/pair: " + stats.avgPaths);

    // (g) Cost efficiency
    log("\n--- (g) Cost Efficiency ---");
    var ce = costEfficiency(graph, adj);
    log("  Paths/switch: " + ce.pathsPerSwitch);
    log("  BW/link: " + ce.bwPerLink);
  });

  hr();
  log("\nDONE");

  var output = results.join("\n");
  console.log(output);

  // Also show in a textarea for easy copy
  var ta = document.createElement("textarea");
  ta.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;font-family:monospace;font-size:12px;";
  ta.value = output;
  document.body.appendChild(ta);
  ta.select();
})();
