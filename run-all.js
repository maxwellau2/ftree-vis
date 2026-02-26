// Run All Topologies Analysis
// Cycles through every topology, runs the full analysis engine,
// and displays results in a collapsible panel on the page.
//
// Each topology is processed sequentially using setTimeout(0) to
// yield the main thread between topologies, preventing the browser
// from freezing.

function runAllAnalysis() {
  var btn = document.getElementById("runAllBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Running..."; }

  var panel = document.getElementById("runAllPanel");
  var content = document.getElementById("runAllContent");
  panel.style.display = "block";
  content.innerHTML = "<p><em>Running analysis across all topologies...</em></p>";

  var topos = [
    { name: "Fat Tree k=2 d=3", setup: function() { drawFatTree(3, 4); return currentGraph; } },
    { name: "Fat Tree k=4 d=3", setup: function() { drawFatTree(3, 8); return currentGraph; } },
    { name: "Jupiter",  setup: function() { topologies['jupiter'](); return currentGraph; } },
    { name: "Amazon",   setup: function() { topologies['amazon'](); return currentGraph; } },
    { name: "Meta",     setup: function() { topologies['meta'](); return currentGraph; } }
  ];

  var allHTML = "";
  var idx = 0;

  function processNext() {
    if (idx >= topos.length) {
      // Done — restore the original topology
      var origTopo = conf["topology"] || "fattree";
      if (topologies[origTopo]) { topologies[origTopo](); }
      else { drawFatTree(conf["depth"], conf["width"]); }

      if (btn) { btn.disabled = false; btn.textContent = "Run All Analysis"; }
      // Append raw text copy button
      allHTML += '<div style="margin-top:8px;text-align:center;">' +
        '<button onclick="copyRunAllText()" style="font-size:11px;padding:2px 8px;cursor:pointer;">Copy as Text</button></div>';
      content.innerHTML = allHTML;
      return;
    }

    var t = topos[idx];
    var lines = [];
    function log(s) { lines.push(s); }

    var graph = t.setup();
    if (!graph) {
      allHTML += '<div class="run-all-topo"><h4>' + t.name + '</h4><p>ERROR: no graph</p></div>';
      idx++;
      setTimeout(processNext, 0);
      return;
    }
    var adj = buildAdjacency(graph);

    // Header
    log(graph.hosts.length + " hosts, " + graph.switches.length + " switches, " + graph.edges.length + " links");

    var roots = findRootSwitches(graph);
    log("Root switches: " + roots.map(function(r){return r.id;}).join(", ") + " (" + roots.length + " total)");

    // (a) Server -> Root
    log("");
    log("<strong>(a) Server → Root Switch</strong>");
    if (graph.hosts.length > 0 && roots.length > 0) {
      var h = graph.hosts[0].id;
      roots.forEach(function(r) {
        var res = countShortestPaths(adj, h, r.id);
        log("  " + h + " → " + r.id + ": " + res.count + " paths (len " + res.dist + ")");
      });
    }

    // (b) Host-to-host
    log("");
    log("<strong>(b) Host-to-Host Paths</strong>");
    var pairs = [["M1","M2"], ["M1","M3"], ["M1","M5"]];
    pairs.forEach(function(p) {
      if (adj[p[0]] && adj[p[1]]) {
        var res = countShortestPaths(adj, p[0], p[1]);
        log("  " + p[0] + " → " + p[1] + ": " + res.count + " paths (len " + res.dist + ")");
      }
    });
    if (adj["M1"] && adj["M5"] && adj["S2"]) {
      log("  M1 → M5 through S2: " + countPathsThroughNode(adj, "M1", "M5", "S2") + " paths");
    }
    if (adj["M1"] && adj["M3"] && adj["S2"]) {
      log("  M1 → M3 through S2: " + countPathsThroughNode(adj, "M1", "M3", "S2") + " paths");
    }
    var interDst = findInterGroupHost(graph, adj, "M1");
    if (interDst) {
      var interRes = countShortestPaths(adj, "M1", interDst);
      log("  M1 → " + interDst + " (inter-group): " + interRes.count + " paths (len " + interRes.dist + ")");
      if (adj["S2"]) {
        log("  M1 → " + interDst + " through S2: " + countPathsThroughNode(adj, "M1", interDst, "S2") + " paths");
      }
    }

    // (c) Bisection BW
    log("");
    log("<strong>(c) Bisection Bandwidth</strong>");
    var bw = computeBisectionBW(graph);
    log("  Bisection BW: " + bw + " links × 10 Gbps = " + (bw * 10) + " Gbps");

    // (d) Fault tolerance
    log("");
    log("<strong>(d) Fault Tolerance (single failure)</strong>");
    var ft = analyzeFaultTolerance(graph, adj);
    if (ft) {
      log("  Removed: " + ft.switchId + " (" + ft.switchType + ")");
      log("  Disconnected pairs: " + ft.disconnectedPairs + " / " + ft.totalPairs);
      log("  Avg path reduction: " + ft.avgPathReduction.toFixed(1) + "%");
      log("  Oversubscription: " + ft.oversubscription);
    }

    // (e) Multi-failure cascade
    log("");
    log("<strong>(e) Multi-Failure Cascade</strong>");
    var sampled = sampleHostsAcrossGroups(graph, adj, 3);
    log("  Sampled: " + sampled.map(function(h){return h.id;}).join(", "));
    var cascade = multiFailureCascade(graph, adj);
    cascade.forEach(function(c) {
      log("  Remove " + c.removed + "/" + c.totalRoots +
          " roots: survival=" + c.avgPathSurvival.toFixed(1) +
          "%  disconnected=" + c.disconnectedPairs + "/" + c.totalPairs);
    });

    // (f) All-pairs stats
    log("");
    log("<strong>(f) Network Statistics</strong>");
    var stats = allPairsStats(graph, adj);
    log("  Diameter: " + stats.diameter);
    log("  Min distance: " + stats.minDist);
    log("  Avg distance: " + stats.avgDist);
    log("  Avg paths/pair: " + stats.avgPaths);

    // (g) Cost efficiency
    log("");
    log("<strong>(g) Cost Efficiency</strong>");
    var ce = costEfficiency(graph, adj);
    log("  Paths/switch: " + ce.pathsPerSwitch);
    log("  BW/link: " + ce.bwPerLink);

    // Build collapsible section for this topology
    var topoId = "runall-topo-" + idx;
    allHTML += '<details class="run-all-topo"' + (idx === 0 ? ' open' : '') + '>' +
      '<summary><strong>' + t.name + '</strong> — ' +
      graph.hosts.length + ' hosts, ' + graph.switches.length + ' switches</summary>' +
      '<pre class="run-all-pre">' + lines.join("\n") + '</pre></details>';

    // Update panel with progress
    content.innerHTML = allHTML + '<p><em>Processing ' + (idx + 1) + '/' + topos.length + '...</em></p>';

    idx++;
    setTimeout(processNext, 0);
  }

  processNext();
}

// Copy all results as plain text
function copyRunAllText() {
  var pres = document.querySelectorAll(".run-all-pre");
  var text = "";
  var summaries = document.querySelectorAll(".run-all-topo summary");
  for (var i = 0; i < pres.length; i++) {
    text += "=".repeat(60) + "\n";
    text += summaries[i].textContent + "\n";
    text += "=".repeat(60) + "\n";
    // Strip HTML tags from pre content
    var tmp = document.createElement("div");
    tmp.innerHTML = pres[i].innerHTML;
    text += tmp.textContent + "\n\n";
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  } else {
    // Fallback
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert("Copied to clipboard!");
  }
}
