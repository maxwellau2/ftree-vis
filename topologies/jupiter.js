// ============================================================
// Google Jupiter Topology
// Direct-connect mesh between aggregation blocks via OCS
// No traditional spine layer - the key Jupiter innovation
//
// Sources:
// - A. Singh et al., "Jupiter Rising: A Decade of Clos Topologies
//   and Centralized Control in Google's Datacenter Network,"
//   ACM SIGCOMM 2015. https://dl.acm.org/doi/10.1145/2785956.2787508
// - S. Poutievski et al., "Jupiter Evolving: Transforming Google's
//   Datacenter Network via Optical Circuit Switches and Software-
//   Defined Networking," ACM SIGCOMM 2022.
//   https://research.google/pubs/jupiter-evolving-transforming-googles-datacenter-network-via-optical-circuit-switches-and-software-defined-networking/
// ============================================================

registerTopology('jupiter', function() {
    d3.select("svg.main").remove();

    var graph = { nodes: [], edges: [], switches: [], hosts: [], metadata: { type: 'jupiter' } };
    var switchCounter = 0;
    var hostCounter = 0;

    // Configuration
    var numBlocks = 4;        // Aggregation blocks
    var torsPerBlock = 4;     // ToR switches per block
    var aggsPerBlock = 2;     // Aggregation switches per block
    var numOCS = 4;           // Optical Circuit Switches
    var hostsPerTor = 2;      // Hosts per ToR

    var blockWidth = 120;
    var blockSpacing = 40;
    var totalWidth = numBlocks * blockWidth + (numBlocks - 1) * blockSpacing;

    var w = totalWidth + 200;
    var h = 500;

    var svg = d3.select("body").append("svg")
        .attr("width", w)
        .attr("height", h)
        .attr("class", "main")
        .append("g")
        .attr("transform", "translate(" + w/2 + ",30)");

    // Y positions
    var yOCS = 0;
    var yAgg = 120;
    var yTor = 240;
    var yHost = 350;

    var podw = 10;
    var podh = 10;
    var hostr = 3;

    // Draw OCS layer (top)
    var ocsNodes = [];
    var ocsSpacing = totalWidth / (numOCS + 1);
    for (var i = 0; i < numOCS; i++) {
        switchCounter++;
        var x = -totalWidth/2 + ocsSpacing * (i + 1);
        var label = "S" + switchCounter;
        var node = { id: label, type: "switch", subtype: "ocs", x: x, y: yOCS };
        graph.nodes.push(node);
        graph.switches.push(node);
        ocsNodes.push(node);

        // Draw OCS as diamond shape
        var size = 7;
        svg.append("polygon")
            .attr("class", "ocs-switch")
            .attr("points",
                x + "," + (yOCS - size) + " " +
                (x + size) + "," + yOCS + " " +
                x + "," + (yOCS + size) + " " +
                (x - size) + "," + yOCS)
            ;

        svg.append("text")
            .attr("class", "node-label switch-label")
            .attr("x", x)
            .attr("y", yOCS - size - 4)
            .attr("text-anchor", "middle")
            .text(label);
    }

    // Draw OCS label
    svg.append("text")
        .attr("class", "layer-label")
        .attr("x", -totalWidth/2 - 30)
        .attr("y", yOCS + 4)
        .attr("text-anchor", "end")
        .text("OCS");

    // Draw aggregation blocks
    var blockData = []; // { aggNodes: [], torNodes: [] }
    for (var b = 0; b < numBlocks; b++) {
        var blockX = -totalWidth/2 + b * (blockWidth + blockSpacing) + blockWidth/2;
        var block = { aggNodes: [], torNodes: [] };

        // Draw block background
        svg.append("rect")
            .attr("class", "block-bg")
            .attr("x", blockX - blockWidth/2 + 5)
            .attr("y", yAgg - 25)
            .attr("width", blockWidth - 10)
            .attr("height", yTor - yAgg + 50)
            .attr("rx", 5);

        svg.append("text")
            .attr("class", "block-label")
            .attr("x", blockX)
            .attr("y", yAgg - 30)
            .attr("text-anchor", "middle")
            .text("Block " + (b + 1));

        // Aggregation switches
        var aggSpacing = (blockWidth - 40) / (aggsPerBlock - 1 || 1);
        for (var a = 0; a < aggsPerBlock; a++) {
            switchCounter++;
            var x = blockX - (blockWidth - 40)/2 + a * aggSpacing;
            var label = "S" + switchCounter;
            var node = { id: label, type: "switch", subtype: "agg", x: x, y: yAgg, block: b };
            graph.nodes.push(node);
            graph.switches.push(node);
            block.aggNodes.push(node);

            svg.append("rect")
                .attr("class", "agg-switch")
                .attr("width", podw)
                .attr("height", podh)
                .attr("x", x - podw/2)
                .attr("y", yAgg - podh/2);

            svg.append("text")
                .attr("class", "node-label switch-label")
                .attr("x", x)
                .attr("y", yAgg - podh/2 - 4)
                .attr("text-anchor", "middle")
                .text(label);
        }

        // ToR switches
        var torSpacing = (blockWidth - 30) / (torsPerBlock - 1 || 1);
        for (var t = 0; t < torsPerBlock; t++) {
            switchCounter++;
            var x = blockX - (blockWidth - 30)/2 + t * torSpacing;
            var label = "S" + switchCounter;
            var node = { id: label, type: "switch", subtype: "tor", x: x, y: yTor, block: b };
            graph.nodes.push(node);
            graph.switches.push(node);
            block.torNodes.push(node);

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

        // Intra-block: full mesh ToR <-> Agg
        for (var t = 0; t < torsPerBlock; t++) {
            for (var a = 0; a < aggsPerBlock; a++) {
                graph.edges.push({ from: block.torNodes[t].id, to: block.aggNodes[a].id });
                svg.append("line")
                    .attr("class", "cable")
                    .attr("x1", block.torNodes[t].x)
                    .attr("y1", yTor)
                    .attr("x2", block.aggNodes[a].x)
                    .attr("y2", yAgg);
            }
        }

        // Hosts under ToRs
        for (var t = 0; t < torsPerBlock; t++) {
            var torX = block.torNodes[t].x;
            for (var hh = 0; hh < hostsPerTor; hh++) {
                hostCounter++;
                var dx = (hh - (hostsPerTor - 1)/2) * 8;
                var hx = torX + dx;
                var label = "M" + hostCounter;
                var node = { id: label, type: "host", x: hx };
                graph.nodes.push(node);
                graph.hosts.push(node);
                graph.edges.push({ from: block.torNodes[t].id, to: label });

                svg.append("line")
                    .attr("class", "cable")
                    .attr("x1", torX)
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

        blockData.push(block);
    }

    // Connect Agg switches to OCS (direct-connect mesh via OCS)
    // Each agg switch connects to all OCS switches
    for (var b = 0; b < numBlocks; b++) {
        for (var a = 0; a < aggsPerBlock; a++) {
            for (var o = 0; o < numOCS; o++) {
                graph.edges.push({ from: blockData[b].aggNodes[a].id, to: ocsNodes[o].id });
                svg.append("line")
                    .attr("class", "cable ocs-cable")
                    .attr("x1", blockData[b].aggNodes[a].x)
                    .attr("y1", yAgg)
                    .attr("x2", ocsNodes[o].x)
                    .attr("y2", yOCS);
            }
        }
    }

    // Draw layer labels
    svg.append("text")
        .attr("class", "layer-label")
        .attr("x", -totalWidth/2 - 30)
        .attr("y", yAgg + 4)
        .attr("text-anchor", "end")
        .text("AGG");

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

    currentGraph = graph;
    updateStat();
    if (typeof runAnalysis === 'function') {
        runAnalysis(graph);
    }
});
