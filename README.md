# Data Center Network Topology Visualizer

An interactive visualizer and analysis tool for data center network topologies, built with D3.js.

Forked from [h8liu/ftree-vis](https://github.com/h8liu/ftree-vis) and extended with additional topologies and a graph analysis engine.

## Supported Topologies

| Topology | Description | Source |
|----------|-------------|--------|
| **Fat Tree** | Parameterized k-ary fat tree (Clos network) with configurable depth and port count | Al-Fares et al., SIGCOMM 2008 |
| **Google Jupiter** | Aggregation blocks interconnected via Optical Circuit Switches (OCS) | Singh et al., SIGCOMM 2015; Poutievski et al., SIGCOMM 2022 |
| **Amazon Leaf-Spine** | 2-tier Clos with full bipartite mesh between leaf and spine switches | AWS re:Invent 2022 (NET402) |
| **Meta 3-Level Clos** | Spine + pods (fabric + ToR switches per pod) | Andreyev, Meta Engineering Blog, 2014 |

## Analysis Features

For each topology, the tool computes:

- **(a) Server-to-root paths**: Number of minimal-length shortest paths from any server to any root switch, via BFS-based path counting.
- **(b) Host-to-host paths**: Shortest path counts between specific host pairs (M1-M3, M1-M5), including paths constrained through a given switch (product principle). Inter-pod/block examples included for hierarchical topologies.
- **(c) Bisection bandwidth**: Exact formula (k^d) for fat trees; exact balanced-partition enumeration for other topologies.

## Usage

Open `index.html` in a browser. Select a topology from the dropdown. For fat trees, adjust depth and port count.

Press `h` to toggle the control and analysis panels.

## File Structure

```
├── index.html              UI and script loading
├── ftree.js                Fat tree topology + main visualization engine
├── analysis.js             BFS path counting, bisection bandwidth, analysis output
├── style.css               SVG and layout styling
├── topologies/
│   ├── jupiter.js          Google Jupiter topology
│   ├── amazon.js           Amazon Leaf-Spine topology
│   └── meta.js             Meta 3-Level Clos topology
└── lib/
    ├── d3.js               D3.js visualization library
    └── jquery.js           jQuery library
```

## Credits

- Original fat tree visualizer by [H. Liu](https://github.com/h8liu/ftree-vis)
- Additional topologies and analysis engine developed for Cloud Computing Assignment 1 (Question 5), with assistance from Claude Code (Anthropic)
