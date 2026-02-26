$(document).ready(docMain);

var conf = new Object();
conf["depth"] = 3;
conf["width"] = 8;
conf["topology"] = "fattree";

var controlVisible = true;
var topologies = {};
var currentGraph = null;

function registerTopology(name, drawFn) {
  topologies[name] = drawFn;
}

function docMain() {
  formInit();
  redraw();
  $(document).keypress(kpress);
}

function kpress(e) {
  if (e.which == 104) {
    // 'h'
    if (controlVisible) {
      controlVisible = false;
      $("div.control").hide();
      $("div.analysis").hide();
    } else {
      controlVisible = true;
      $("div.control").show();
      $("div.analysis").show();
    }
  }
}

function redraw() {
  var topo = conf["topology"];
  if (topologies[topo]) {
    topologies[topo]();
  } else {
    drawFatTree(conf["depth"], conf["width"]);
  }
}

function updateParamVisibility() {
  var topo = conf["topology"];
  if (topo === "fattree") {
    $(".fattree-param").show();
  } else {
    $(".fattree-param").hide();
  }
}

// ============================================================
// Fat Tree Topology
// ============================================================

function drawFatTree(depth, width) {
  var k = Math.floor(width / 2);
  var padg = 13;
  var padi = 12;
  var hline = 70;
  var hhost = 50;

  var podw = 8;
  var podh = 8;
  var hostr = 2;

  var kexp = function (n) {
    return Math.pow(k, n);
  };

  d3.select("svg.main").remove();
  if (kexp(depth - 1) > 1500 || depth <= 0 || k <= 0) {
    currentGraph = null;
    return;
  }

  var w = kexp(depth - 1) * padg + 200;
  var h = 2 * depth * hline;

  var svg = d3
    .select("body")
    .append("svg")
    .attr("width", w)
    .attr("height", h)
    .attr("class", "main")
    .append("g")
    .attr("transform", "translate(" + w / 2 + "," + h / 2 + ")");

  // Graph data structure for analysis
  var graph = { nodes: [], edges: [], switches: [], hosts: [], metadata: {} };
  var switchCounter = 0;
  var hostCounter = 0;
  var switchMap = {}; // "level_index" -> node object

  var linePositions = [];

  function podPositions(d) {
    var ret = [];

    var ngroup = kexp(d);
    var pergroup = kexp(depth - 1 - d);

    var wgroup = pergroup * padg;
    var wgroups = wgroup * (ngroup - 1);
    var offset = -wgroups / 2;

    for (var i = 0; i < ngroup; i++) {
      var wpods = pergroup * padi;
      var goffset = wgroup * i - wpods / 2;

      for (var j = 0; j < pergroup; j++) {
        ret.push(offset + goffset + padi * j);
      }
    }

    return ret;
  }

  for (var i = 0; i < depth; i++) {
    linePositions[i] = podPositions(i);
  }

  // Register switches (top-to-bottom, left-to-right)
  // Level 0 = root (top), level depth-1 = edge (bottom)
  for (var i = 0; i < depth; i++) {
    for (var j = 0; j < linePositions[i].length; j++) {
      switchCounter++;
      var label = "S" + switchCounter;
      var node = {
        id: label,
        type: "switch",
        level: i,
        index: j,
        x: linePositions[i][j],
      };
      graph.nodes.push(node);
      graph.switches.push(node);
      switchMap[i + "_" + j] = node;
    }
  }

  // Draw cables and record edges
  function linePods(d, list1, list2, y1, y2, recordEdges) {
    var pergroup = kexp(depth - 1 - d);
    var ngroup = kexp(d);
    var perbundle = pergroup / k;

    for (var i = 0; i < ngroup; i++) {
      var offset = pergroup * i;
      for (var j = 0; j < k; j++) {
        var boffset = perbundle * j;
        for (var t = 0; t < perbundle; t++) {
          var ichild = offset + boffset + t;
          for (var dd = 0; dd < k; dd++) {
            var ifather = offset + perbundle * dd + t;
            svg
              .append("line")
              .attr("class", "cable")
              .attr("x1", list1[ifather])
              .attr("y1", y1)
              .attr("x2", list2[ichild])
              .attr("y2", y2);

            if (recordEdges) {
              var parentNode = switchMap[d + "_" + ifather];
              var childNode = switchMap[d + 1 + "_" + ichild];
              if (parentNode && childNode) {
                graph.edges.push({ from: parentNode.id, to: childNode.id });
              }
            }
          }
        }
      }
    }
  }

  // Draw hosts and record host-to-switch edges
  function drawHost(x, y, dy, dx, parentSwitchId) {
    svg
      .append("line")
      .attr("class", "cable")
      .attr("x1", x)
      .attr("y1", y)
      .attr("x2", x + dx)
      .attr("y2", y + dy);

    hostCounter++;
    var label = "M" + hostCounter;
    var node = { id: label, type: "host", x: x + dx };
    graph.nodes.push(node);
    graph.hosts.push(node);
    graph.edges.push({ from: parentSwitchId, to: label });

    svg
      .append("circle")
      .attr("class", "host")
      .attr("cx", x + dx)
      .attr("cy", y + dy)
      .attr("r", hostr);

    // Label for host
    svg
      .append("text")
      .attr("class", "node-label host-label")
      .attr("x", x + dx)
      .attr("y", y + dy + hostr + 10)
      .attr("text-anchor", "middle")
      .text(label);
  }

  function drawHosts(list, y, direction) {
    for (var i = 0; i < list.length; i++) {
      var switchNode = switchMap[depth - 1 + "_" + i];
      var switchId = switchNode ? switchNode.id : "S?";
      // Draw exactly k hosts per edge switch to match the formula:
      // total hosts per side = k^(d-1) * k
      var spacing = k <= 1 ? 0 : 8 / (k - 1);
      var totalSpan = k <= 1 ? 0 : 8;
      for (var h = 0; h < k; h++) {
        var dx = k <= 1 ? 0 : -totalSpan / 2 + h * spacing;
        drawHost(list[i], y, hhost * direction, dx, switchId);
      }
    }
  }

  function drawPods(list, y) {
    for (var j = 0, n = list.length; j < n; j++) {
      svg
        .append("rect")
        .attr("class", "pod")
        .attr("width", podw)
        .attr("height", podh)
        .attr("x", list[j] - podw / 2)
        .attr("y", y - podh / 2);
    }
  }

  function drawSwitchLabels(list, y, level) {
    for (var j = 0; j < list.length; j++) {
      var node = switchMap[level + "_" + j];
      if (node) {
        svg
          .append("text")
          .attr("class", "node-label switch-label")
          .attr("x", list[j])
          .attr("y", y - podh / 2 - 4)
          .attr("text-anchor", "middle")
          .text(node.id);
      }
    }
  }

  // Draw cables (only record edges once, on the positive-y side)
  for (var i = 0; i < depth - 1; i++) {
    linePods(
      i,
      linePositions[i],
      linePositions[i + 1],
      i * hline,
      (i + 1) * hline,
      true,
    );
    linePods(
      i,
      linePositions[i],
      linePositions[i + 1],
      -i * hline,
      -(i + 1) * hline,
      false,
    );
  }

  // Draw hosts (only on positive-y side for graph tracking)
  drawHosts(linePositions[depth - 1], (depth - 1) * hline, 1);
  // Draw visual-only hosts on negative side (no graph tracking)
  var savedHostCounter = hostCounter;
  var savedNodes = graph.nodes.length;
  var savedHosts = graph.hosts.length;
  var savedEdges = graph.edges.length;
  drawHosts(linePositions[depth - 1], -(depth - 1) * hline, -1);
  // Remove duplicate graph entries from the mirrored hosts
  graph.nodes.length = savedNodes;
  graph.hosts.length = savedHosts;
  graph.edges.length = savedEdges;
  hostCounter = savedHostCounter;

  // Draw switches and labels
  for (var i = 0; i < depth; i++) {
    if (i == 0) {
      drawPods(linePositions[0], 0);
      drawSwitchLabels(linePositions[0], 0, 0);
    } else {
      drawPods(linePositions[i], i * hline);
      drawPods(linePositions[i], -i * hline);
      drawSwitchLabels(linePositions[i], i * hline, i);
    }
  }

  // Store metadata
  graph.metadata.k = k;
  graph.metadata.depth = depth;
  graph.metadata.type = "fattree";

  currentGraph = graph;

  // Run analysis
  if (typeof runAnalysis === "function") {
    runAnalysis(graph);
  }
}

registerTopology("fattree", function () {
  drawFatTree(conf["depth"], conf["width"]);
});

// ============================================================
// Statistics
// ============================================================

function updateStat() {
  var topo = conf["topology"];
  if (topo !== "fattree") {
    // For non-fattree topologies, stats come from the graph
    if (currentGraph) {
      d3.select("#nhost").html(formatNum(currentGraph.hosts.length));
      d3.select("#nswitch").html(formatNum(currentGraph.switches.length));
      d3.select("#ncable").html(formatNum(currentGraph.edges.length));
      d3.select("#ntx").html(formatNum(currentGraph.edges.length * 2));
      d3.select("#nswtx").html(
        formatNum(currentGraph.edges.length * 2 - currentGraph.hosts.length),
      );
    }
    return;
  }

  var w = Math.floor(conf["width"] / 2);
  var d = conf["depth"];
  if (d == 0 || w == 0) {
    d3.select("#nhost").html("&nbsp;");
    d3.select("#nswitch").html("&nbsp;");
    d3.select("#ncable").html("&nbsp;");
    d3.select("#ntx").html("&nbsp;");
    d3.select("#nswtx").html("&nbsp;");
    return;
  }

  var line = Math.pow(w, d - 1);

  var nhost = 2 * line * w;
  var nswitch = (2 * d - 1) * line;
  var ncable = 2 * d * w * line;
  var ntx = 2 * (2 * d) * w * line;
  var nswtx = ntx - nhost;

  d3.select("#nhost").html(formatNum(nhost));
  d3.select("#nswitch").html(formatNum(nswitch));
  d3.select("#ncable").html(formatNum(ncable));
  d3.select("#ntx").html(formatNum(ntx));
  d3.select("#nswtx").html(formatNum(nswtx));
}

function formatNum(x) {
  x = x.toString();
  var pattern = /(-?\d+)(\d{3})/;
  while (pattern.test(x)) x = x.replace(pattern, "$1,$2");
  return x;
}

function formInit() {
  var form = d3.select("form");

  function confInt() {
    conf[this.name] = parseInt(this.value);
    updateStat();
    redraw();
  }

  function confSelect() {
    conf[this.name] = this.value;
    updateParamVisibility();
    updateStat();
    redraw();
  }

  function hook(name, func) {
    var fields = form.selectAll("[name=" + name + "]");
    fields.on("change", func);
    fields.each(func);
  }

  hook("depth", confInt);
  hook("width", confInt);
  hook("topology", confSelect);
}
