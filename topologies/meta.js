// ============================================================
// Meta (Facebook) 3-Level Clos Topology
// Spine + Pods (each pod has fabric/agg switches + ToR switches)
// Every fabric switch connects to every spine
// Every ToR connects to every fabric switch within its pod
//
// Sources:
// - A. Andreyev, "Introducing data center fabric, the next-
//   generation Facebook data center network," Meta Engineering
//   Blog, Nov 2014.
//   https://engineering.fb.com/2014/11/14/production-engineering/introducing-data-center-fabric-the-next-generation-facebook-data-center-network/
// - A. Andreyev et al., "Reinventing Facebook's data center
//   network with F16 and Minipack," Meta Engineering Blog,
//   Mar 2019.
//   https://engineering.fb.com/2019/03/14/data-center-engineering/f16-minipack/
// ============================================================

registerTopology('meta', function() {
    d3.select("svg.main").remove();

    var graph = { nodes: [], edges: [], switches: [], hosts: [], metadata: { type: 'meta' } };
    var switchCounter = 0;
    var hostCounter = 0;

    // Configuration
    var numSpine = 4;          // Spine switches (top level)
    var numPods = 4;           // Number of pods
    var fabricPerPod = 2;      // Fabric/aggregation switches per pod
    var torPerPod = 4;         // ToR switches per pod
    var hostsPerTor = 2;       // Hosts per ToR

    var podWidth = 140;
    var podSpacing = 30;
    var totalWidth = numPods * podWidth + (numPods - 1) * podSpacing;

    var w = totalWidth + 200;
    var h = 520;

    var svg = d3.select("body").append("svg")
        .attr("width", w)
        .attr("height", h)
        .attr("class", "main")
        .append("g")
        .attr("transform", "translate(" + w/2 + ",40)");

    // Y positions
    var ySpine = 0;
    var yFabric = 140;
    var yTor = 260;
    var yHost = 380;

    var podw = 10;
    var podh = 10;
    var hostr = 3;

    // Draw spine switches
    var spineNodes = [];
    var spineSpacing = totalWidth * 0.6 / (numSpine - 1 || 1);
    for (var i = 0; i < numSpine; i++) {
        switchCounter++;
        var x = -totalWidth * 0.3 + i * spineSpacing;
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

    // Draw layer labels
    svg.append("text")
        .attr("class", "layer-label")
        .attr("x", -totalWidth/2 - 30)
        .attr("y", ySpine + 4)
        .attr("text-anchor", "end")
        .text("Spine");

    svg.append("text")
        .attr("class", "layer-label")
        .attr("x", -totalWidth/2 - 30)
        .attr("y", yFabric + 4)
        .attr("text-anchor", "end")
        .text("Fabric");

    svg.append("text")
        .attr("class", "layer-label")
        .attr("x", -totalWidth/2 - 30)
        .attr("y", yTor + 4)
        .attr("text-anchor", "end")
        .text("ToR");

    svg.append("text")
        .attr("class", "layer-label")
        .attr("x", -totalWidth/2 - 30)
        .attr("y", yHost + 4)
        .attr("text-anchor", "end")
        .text("Hosts");

    // Draw pods
    for (var p = 0; p < numPods; p++) {
        var podX = -totalWidth/2 + p * (podWidth + podSpacing) + podWidth/2;

        // Pod background
        svg.append("rect")
            .attr("class", "block-bg")
            .attr("x", podX - podWidth/2 + 5)
            .attr("y", yFabric - 30)
            .attr("width", podWidth - 10)
            .attr("height", yTor - yFabric + 60)
            .attr("rx", 5);

        svg.append("text")
            .attr("class", "block-label")
            .attr("x", podX)
            .attr("y", yFabric - 35)
            .attr("text-anchor", "middle")
            .text("Pod " + (p + 1));

        // Fabric switches
        var fabricNodes = [];
        var fabricSpacing = (podWidth - 50) / (fabricPerPod - 1 || 1);
        for (var f = 0; f < fabricPerPod; f++) {
            switchCounter++;
            var x = podX - (podWidth - 50)/2 + f * fabricSpacing;
            var label = "S" + switchCounter;
            var node = { id: label, type: "switch", subtype: "fabric", x: x, y: yFabric, pod: p };
            graph.nodes.push(node);
            graph.switches.push(node);
            fabricNodes.push(node);

            svg.append("rect")
                .attr("class", "fabric-switch")
                .attr("width", podw)
                .attr("height", podh)
                .attr("x", x - podw/2)
                .attr("y", yFabric - podh/2);

            svg.append("text")
                .attr("class", "node-label switch-label")
                .attr("x", x)
                .attr("y", yFabric - podh/2 - 4)
                .attr("text-anchor", "middle")
                .text(label);
        }

        // ToR switches
        var torNodes = [];
        var torSpacing = (podWidth - 30) / (torPerPod - 1 || 1);
        for (var t = 0; t < torPerPod; t++) {
            switchCounter++;
            var x = podX - (podWidth - 30)/2 + t * torSpacing;
            var label = "S" + switchCounter;
            var node = { id: label, type: "switch", subtype: "tor", x: x, y: yTor, pod: p };
            graph.nodes.push(node);
            graph.switches.push(node);
            torNodes.push(node);

            svg.append("rect")
                .attr("class", "pod")
                .attr("width", podw)
                .attr("height", podh)
                .attr("x", x - podw/2)
                .attr("y", yTor - podh/2);

            svg.append("text")
                .attr("class", "node-label switch-label")
                .attr("x", x)
                .attr("y", yTor - podh/2 - 4)
                .attr("text-anchor", "middle")
                .text(label);
        }

        // Intra-pod: full mesh ToR <-> Fabric
        for (var t = 0; t < torPerPod; t++) {
            for (var f = 0; f < fabricPerPod; f++) {
                graph.edges.push({ from: torNodes[t].id, to: fabricNodes[f].id });
                svg.append("line")
                    .attr("class", "cable")
                    .attr("x1", torNodes[t].x)
                    .attr("y1", yTor)
                    .attr("x2", fabricNodes[f].x)
                    .attr("y2", yFabric);
            }
        }

        // Fabric <-> Spine: every fabric switch connects to every spine
        for (var f = 0; f < fabricPerPod; f++) {
            for (var s = 0; s < numSpine; s++) {
                graph.edges.push({ from: fabricNodes[f].id, to: spineNodes[s].id });
                svg.append("line")
                    .attr("class", "cable")
                    .attr("x1", fabricNodes[f].x)
                    .attr("y1", yFabric)
                    .attr("x2", spineNodes[s].x)
                    .attr("y2", ySpine);
            }
        }

        // Hosts under ToRs
        for (var t = 0; t < torPerPod; t++) {
            for (var hh = 0; hh < hostsPerTor; hh++) {
                hostCounter++;
                var dx = (hh - (hostsPerTor - 1)/2) * 8;
                var hx = torNodes[t].x + dx;
                var label = "M" + hostCounter;
                var node = { id: label, type: "host", x: hx };
                graph.nodes.push(node);
                graph.hosts.push(node);
                graph.edges.push({ from: torNodes[t].id, to: label });

                svg.append("line")
                    .attr("class", "cable")
                    .attr("x1", torNodes[t].x)
                    .attr("y1", yTor)
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
    }

    currentGraph = graph;
    updateStat();
    if (typeof runAnalysis === 'function') {
        runAnalysis(graph);
    }
});
