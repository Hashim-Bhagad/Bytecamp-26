import networkx as nx
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))


def compute_severity_score(G: nx.DiGraph, node_id: str, chain: list) -> dict:
    """
    ImpactScore = Σ(path_confidence_i) × API_multiplier × coverage_multiplier

    Severity tiers:
      CRITICAL  ImpactScore >= 8   #ef4444
      HIGH      ImpactScore >= 4   #f97316
      MEDIUM    ImpactScore >= 1   #eab308
      LOW       ImpactScore  < 1   #22c55e
    """
    if not chain:
        return {
            "score": 0, "tier": "LOW", "color": "#22c55e",
            "breakdown": {"weighted_dependents": 0, "api_multiplier": 1,
                          "coverage_multiplier": 1, "untested_count": 0}
        }

    weighted_deps = sum(c["path_confidence"] for c in chain)

    # API multiplier: 3x if this node is part of a public API boundary
    source_data = dict(G.nodes.get(node_id, {}))
    source_str = str(source_data)
    is_api = any(
        sig in source_str
        for sig in ["response_model", "router", "@app.", "FastAPI", "route"]
    )
    # Also check if any ancestor is an API node
    if not is_api and node_id in G:
        try:
            ancestors = nx.ancestors(G, node_id)
            for anc in ancestors:
                anc_str = str(dict(G.nodes.get(anc, {})))
                if any(sig in anc_str for sig in ["response_model", "@app.", "FastAPI"]):
                    is_api = True
                    break
        except Exception:
            pass

    api_multiplier = 3 if is_api else 1

    # Coverage multiplier: untested nodes matter more
    untested = 0
    for c in chain:
        node_ref = c["node"]
        n_id = node_ref.get("id", "")
        if n_id and n_id in G.nodes:
            if not G.nodes[n_id].get("test_coverage", False):
                untested += 1
        elif not node_ref.get("test_coverage", False):
            untested += 1

    coverage_multiplier = 1 + (untested * 1.5) if chain else 1

    score = weighted_deps * api_multiplier * coverage_multiplier

    if score >= 8:
        tier, color = "CRITICAL", "#ef4444"
    elif score >= 4:
        tier, color = "HIGH", "#f97316"
    elif score >= 1:
        tier, color = "MEDIUM", "#eab308"
    else:
        tier, color = "LOW", "#22c55e"

    return {
        "score": round(score, 2),
        "tier": tier,
        "color": color,
        "breakdown": {
            "weighted_dependents": round(weighted_deps, 2),
            "api_multiplier": api_multiplier,
            "coverage_multiplier": round(coverage_multiplier, 2),
            "untested_count": untested
        }
    }
