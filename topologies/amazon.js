// ============================================================
// Amazon Leaf-Spine (2-Tier Clos) Topology
// Classic AWS-style data center fabric
// Every leaf connects to every spine (full bipartite mesh)
// ============================================================

registerTopology('amazon', function() {
    d3.select("svg.main").remove();

    var graph = { nodes: [], edges: [], switches: [], hosts: [], metadata: { type: 'amazon' } };
    var switchCounter = 0;
    var hostCounter = 0;

    // Configuration
    var numSpine = 4;         // Spine switches
    var numLeaf = 8;          // Leaf (ToR) switches
    var hostsPerLeaf = 2;     // Hosts per leaf

    var leafSpacing = 70;
    var totalWidth = (numLeaf - 1) * leafSpacing;

    var w = totalWidth + 200;
    var h = 400;

    var svg = d3.select("body").append("svg")
        .attr("width", w)
        .attr("height", h)
        .attr("class", "main")
        .append("g")
        .attr("transform", "translate(" + w/2 + ",40)");

    // Y positions
    var ySpine = 0;
    var yLeaf = 140;
    var yHost = 280;

    var podw = 10;
    var podh = 10;
    var hostr = 3;

    // Draw spine switches
    var spineNodes = [];
    var spineSpacing = totalWidth / (numSpine + 1);
    for (var i = 0; i < numSpine; i++) {
        switchCounter++;
        var x = -totalWidth/2 + spineSpacing * (i + 1);
        var label = "S" + switchCounter;
        var node = { id: label, type: "switch", subtype: "spine", x: x, y: ySpine };
        graph.nodes.push(node);
        graph.switches.push(node);
        spineNodes.push(node);

        svg.append("rect")
            .attr("class", "spine-switch")
            .attr("width", podw)
            .attr("height", podh)
            .attr("x", x - podw/2)
            .attr("y", ySpine - podh/2);

        svg.append("text")
            .attr("class", "node-label switch-label")
            .attr("x", x)
            .attr("y", ySpine - podh/2 - 4)
            .attr("text-anchor", "middle")
            .text(label);
    }

    // Draw leaf switches
    var leafNodes = [];
    for (var i = 0; i < numLeaf; i++) {
        switchCounter++;
        var x = -totalWidth/2 + i * leafSpacing;
        var label = "S" + switchCounter;
        var node = { id: label, type: "switch", subtype: "leaf", x: x, y: yLeaf };
        graph.nodes.push(node);
        graph.switches.push(node);
        leafNodes.push(node);

        svg.append("rect")
            .attr("class", "pod")
            .attr("width", podw)
            .attr("height", podh)
            .attr("x", x - podw/2)
            .attr("y", yLeaf - podh/2);

        svg.append("text")
            .attr("class", "node-label switch-label")
            .attr("x", x)
            .attr("y", yLeaf - podh/2 - 4)
            .attr("text-anchor", "middle")
            .text(label);
    }

    // Full mesh: every leaf <-> every spine
    for (var l = 0; l < numLeaf; l++) {
        for (var s = 0; s < numSpine; s++) {
            graph.edges.push({ from: leafNodes[l].id, to: spineNodes[s].id });
            svg.append("line")
                .attr("class", "cable")
                .attr("x1", leafNodes[l].x)
                .attr("y1", yLeaf)
                .attr("x2", spineNodes[s].x)
                .attr("y2", ySpine);
        }
    }

    // Hosts under each leaf
    for (var l = 0; l < numLeaf; l++) {
        for (var hh = 0; hh < hostsPerLeaf; hh++) {
            hostCounter++;
            var dx = (hh - (hostsPerLeaf - 1)/2) * 10;
            var hx = leafNodes[l].x + dx;
            var label = "M" + hostCounter;
            var node = { id: label, type: "host", x: hx };
            graph.nodes.push(node);
            graph.hosts.push(node);
            graph.edges.push({ from: leafNodes[l].id, to: label });

            svg.append("line")
                .attr("class", "cable")
                .attr("x1", leafNodes[l].x)
                .attr("y1", yLeaf)
                .attr("x2", hx)
                .attr("y2", yHost);

            svg.append("circle")
                .attr("class", "host")
                .attr("cx", hx)
                .attr("cy", yHost)
                .attr("r", hostr);

            svg.append("text")
                .attr("class", "node-label host-label")
                .attr("x", hx)
                .attr("y", yHost + hostr + 10)
                .attr("text-anchor", "middle")
                .text(label);
        }
    }

    // Layer labels
    svg.append("text")
        .attr("class", "layer-label")
        .attr("x", -totalWidth/2 - 30)
        .attr("y", ySpine + 4)
        .attr("text-anchor", "end")
        .text("Spine");

    svg.append("text")
        .attr("class", "layer-label")
        .attr("x", -totalWidth/2 - 30)
        .attr("y", yLeaf + 4)
        .attr("text-anchor", "end")
        .text("Leaf");

    svg.append("text")
        .attr("class", "layer-label")
        .attr("x", -totalWidth/2 - 30)
        .attr("y", yHost + 4)
        .attr("text-anchor", "end")
        .text("Hosts");

    currentGraph = graph;
    updateStat();
    if (typeof runAnalysis === 'function') {
        runAnalysis(graph);
    }
});
