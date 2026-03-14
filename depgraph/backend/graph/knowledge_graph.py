import networkx as nx
import json
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from backend.parsers.dispatcher import flatten_tree, parse_file, build_node_index
from backend.graph.llm_resolver import traverse_and_annotate
from backend.graph.boundary import detect_boundary_nodes, create_boundary_pairs
from backend.graph.llm_resolver import resolve_boundary_edges


def build_knowledge_graph(
    all_file_nodes: list,
    structural_graph: nx.DiGraph,
    semantic_edges: list[dict]
) -> nx.DiGraph:
    """
    Merge the structural (AST) graph with LLM-resolved semantic edges
    into a unified knowledge graph.
    """
    G = structural_graph.copy()

    def get_domain(lang):
        if lang == 'sql': return 'Database'
        if lang == 'python': return 'Backend'
        if lang in ('typescript', 'react', 'javascript'): return 'Frontend'
        return 'Unknown'

    # Add/update node metadata with LLM summaries
    for node in flatten_tree(all_file_nodes):
        node_domain = get_domain(node.language)
        if node.id in G.nodes:
            # Prevent metadata from overwriting the clean relative file path
            meta = {k: v for k, v in node.metadata.items() if k != 'file'}
            G.nodes[node.id].update({"summary": node.summary, "domain": node_domain, **meta})
        else:
            G.add_node(node.id,
                       name=node.name,
                       type=node.type,
                       language=node.language,
                       domain=node_domain,
                       file=node.file,
                       line_start=node.line_start,
                       line_end=node.line_end,
                       summary=node.summary,
                       **node.metadata)

    # Add semantic edges from Layer 4 (LLM)
    for edge in semantic_edges:
        src = edge.get("source_node_id")
        tgt = edge.get("target_node_id")
        if src and tgt and src in G and tgt in G:
            conf = edge.get("confidence", 0)
            if conf >= 0.5:
                G.add_edge(src, tgt,
                           type=edge.get("relationship", "FLOWS_TO"),
                           confidence=conf,
                           inferred_by="llm",
                           transformation=edge.get("transformation", ""),
                           data_fields=edge.get("data_fields", []),
                           break_risk=edge.get("break_risk", "none"),
                           break_reason=edge.get("break_reason", ""))

    return G


def save_graph(G: nx.DiGraph, path: str = "depgraph_knowledge.json"):
    """Serialize the knowledge graph to JSON."""
    data = nx.node_link_data(G)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"  Graph saved to {path} ({G.number_of_nodes()} nodes, {G.number_of_edges()} edges)")


def load_graph(path: str = "depgraph_knowledge.json") -> nx.DiGraph:
    """Load a knowledge graph from JSON."""
    with open(path, encoding="utf-8") as f:
        return nx.node_link_graph(json.load(f))


def update_graph_for_changed_file(
    G: nx.DiGraph,
    changed_filepath: str,
    all_file_nodes: list
) -> nx.DiGraph:
    """
    Incremental re-analysis: only re-parse the changed file.
    Removes old nodes, re-parses and re-annotates, re-resolves boundary pairs.
    """
    # Remove nodes belonging to changed file
    to_remove = [n for n, d in G.nodes(data=True) if d.get("file") == changed_filepath]
    G.remove_nodes_from(to_remove)

    new_file_node = parse_file(changed_filepath)
    if not new_file_node:
        return G

    node_index = build_node_index(all_file_nodes)
    traverse_and_annotate(new_file_node, node_index)

    new_pairs = create_boundary_pairs(
        detect_boundary_nodes([new_file_node] + all_file_nodes)
    )
    new_edges = resolve_boundary_edges(new_pairs, node_index)

    def get_domain(lang):
        if lang == 'sql': return 'Database'
        if lang == 'python': return 'Backend'
        if lang in ('typescript', 'react', 'javascript'): return 'Frontend'
        return 'Unknown'

    for node in flatten_tree([new_file_node]):
        G.add_node(node.id,
                   name=node.name, type=node.type,
                   language=node.language, domain=get_domain(node.language),
                   file=node.file,
                   summary=node.summary, **node.metadata)
    for edge in new_edges:
        src = edge.get("source_node_id")
        tgt = edge.get("target_node_id")
        if src and tgt and src in G and tgt in G:
            G.add_edge(src, tgt, **edge)

    return G
