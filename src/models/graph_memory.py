"""Concept Topology Graph Memory for Streaming Machine Learning.

Solves the Catastrophic Forgetting and Recurring Concept Drift problem:
- Stores distinct statistical distribution regimes as topological graph nodes.
- Models regime transition dynamics as directed, weighted Markov edges.
- Enables instant (<0.1ms) expert recall when past concepts recur, avoiding re-training.
- Spawns novel nodes dynamically when unobserved concepts arrive.
- Provides anticipatory transition forecasting to predict upcoming regime shifts.
"""

import time
import math
from typing import Dict, Any, List, Optional, Tuple
import numpy as np


class ConceptNode:
    """Represents a discovered concept regime in the streaming topology."""

    def __init__(self, node_id: int, label: str, centroid: np.ndarray, feature_dim: int):
        self.node_id = node_id
        self.label = label
        self.centroid = np.array(centroid, dtype=np.float32)
        self.variance = np.ones(feature_dim, dtype=np.float32) * 0.1
        self.feature_dim = feature_dim
        self.sample_count = 1
        self.correct_count = 0
        self.created_at = time.time()
        self.last_active_at = time.time()
        self.last_active_step = 0

        # Localized online expert model (fast streaming logistic / SGD weights)
        self.weights = np.zeros(feature_dim, dtype=np.float32)
        self.bias = 0.0
        self.learning_rate = 0.05

    def update_distribution(self, x: np.ndarray):
        """Update centroid and variance with online Welford running mean."""
        self.sample_count += 1
        self.last_active_at = time.time()
        delta = x - self.centroid
        self.centroid += delta / min(1000, self.sample_count)
        delta2 = x - self.centroid
        self.variance += (delta * delta2 - self.variance) / min(1000, self.sample_count)
        self.variance = np.maximum(self.variance, 1e-4)

    def predict_proba(self, x: np.ndarray) -> float:
        """Sigmoid probability prediction from localized expert with standardized features."""
        std = np.sqrt(np.maximum(1e-4, self.variance))
        x_norm = (x - self.centroid) / std
        z = float(np.dot(self.weights, x_norm) + self.bias)
        z = max(-15.0, min(15.0, z))
        return 1.0 / (1.0 + math.exp(-z))

    def predict(self, x: np.ndarray) -> int:
        return 1 if self.predict_proba(x) >= 0.5 else 0

    def train_sample(self, x: np.ndarray, y: int):
        """Online SGD update for the localized expert with standardized features."""
        self.update_distribution(x)
        std = np.sqrt(np.maximum(1e-4, self.variance))
        x_norm = (x - self.centroid) / std
        p = self.predict_proba(x)
        err = float(y) - p
        self.weights += self.learning_rate * err * x_norm
        self.bias += self.learning_rate * err
        if (1 if p >= 0.5 else 0) == y:
            self.correct_count += 1

    @property
    def accuracy(self) -> float:
        return (self.correct_count / max(1, self.sample_count)) * 100.0


class ConceptGraphMemory:
    """Dynamic Concept Topology Graph managing recurring concepts and transitions."""

    def __init__(
        self,
        feature_dim: int = 9,
        similarity_threshold: float = 1.8,
        max_nodes: int = 12,
        smoothing_alpha: float = 0.1,
    ):
        self.feature_dim = feature_dim
        self.similarity_threshold = similarity_threshold
        self.max_nodes = max_nodes
        self.smoothing_alpha = smoothing_alpha

        self.nodes: Dict[int, ConceptNode] = {}
        self.next_node_id = 0
        self.active_node_id: Optional[int] = None

        # Transition matrix: transition_counts[from_id][to_id]
        self.transition_counts: Dict[int, Dict[int, float]] = {}

        # Telemetry metrics
        self.recall_count = 0
        self.spawn_count = 0
        self.total_queries = 0
        self.last_action = "INITIALIZED"
        self.last_distance = 0.0

    def initialize_root_node(self, initial_features: np.ndarray, label: str = "Regime 0: Baseline Stationary"):
        """Spawn initial root concept node."""
        node = ConceptNode(self.next_node_id, label, initial_features, self.feature_dim)
        self.nodes[self.next_node_id] = node
        self.transition_counts[self.next_node_id] = {self.next_node_id: 1.0}
        self.active_node_id = self.next_node_id
        self.next_node_id += 1
        return self.active_node_id

    def compute_distance(self, x: np.ndarray, node: ConceptNode) -> float:
        """Compute normalized Mahalanobis/Euclidean distance to node centroid."""
        diff = x - node.centroid
        norm_diff = diff / np.sqrt(node.variance)
        return float(np.sqrt(np.sum(norm_diff ** 2))) / np.sqrt(self.feature_dim)

    def query_or_adapt(
        self,
        current_window_features: np.ndarray,
        step: int,
        force_drift: bool = False,
    ) -> Tuple[str, int, float]:
        """Query graph memory to either recall a recurring concept or spawn a novel regime.

        Returns:
            Tuple of (action_type: 'RECALL' | 'SPAWN' | 'STABLE', active_node_id, distance)
        """
        self.total_queries += 1
        if not self.nodes:
            nid = self.initialize_root_node(current_window_features)
            return "SPAWN", nid, 0.0

        current_node = self.nodes.get(self.active_node_id, list(self.nodes.values())[0])
        dist_to_current = self.compute_distance(current_window_features, current_node)

        # If not flagged as drift and distance is within nominal bounds, stay stable
        if not force_drift and dist_to_current < self.similarity_threshold:
            current_node.update_distribution(current_window_features)
            current_node.last_active_step = step
            self.last_action = "STABLE"
            self.last_distance = dist_to_current
            return "STABLE", current_node.node_id, dist_to_current

        # Search across all existing concept nodes for closest match
        best_node_id = None
        min_dist = float("inf")

        for nid, node in self.nodes.items():
            dist = self.compute_distance(current_window_features, node)
            if dist < min_dist:
                min_dist = dist
                best_node_id = nid

        self.last_distance = min_dist

        # Case A: RECURRING CONCEPT RECALL
        if min_dist < self.similarity_threshold and best_node_id is not None:
            prev_id = self.active_node_id
            self.active_node_id = best_node_id
            self.recall_count += 1
            self.last_action = f"RECALLED (Regime #{best_node_id})"

            # Update transition matrix edge
            if prev_id is not None:
                self._record_transition(prev_id, best_node_id)

            matched_node = self.nodes[best_node_id]
            matched_node.update_distribution(current_window_features)
            matched_node.last_active_step = step
            return "RECALL", best_node_id, min_dist

        # Case B: NOVEL CONCEPT SPAWN
        prev_id = self.active_node_id
        new_id = self._spawn_node(current_window_features, step)
        self.active_node_id = new_id
        self.spawn_count += 1
        self.last_action = f"SPAWNED (Regime #{new_id})"

        if prev_id is not None:
            self._record_transition(prev_id, new_id)

        return "SPAWN", new_id, min_dist

    def _spawn_node(self, features: np.ndarray, step: int) -> int:
        """Create and register a new concept node."""
        if len(self.nodes) >= self.max_nodes:
            # Prune least frequently visited non-active node to bound memory
            candidates = [nid for nid in self.nodes.keys() if nid != self.active_node_id]
            if candidates:
                prune_id = min(candidates, key=lambda i: self.nodes[i].sample_count)
                del self.nodes[prune_id]
                self.transition_counts.pop(prune_id, None)
                for targets in self.transition_counts.values():
                    targets.pop(prune_id, None)

        nid = self.next_node_id
        self.next_node_id += 1

        regime_labels = [
            "Low-Vol Accumulation",
            "High-Vol Expansion",
            "Liquidity Shock",
            "Momentum Breakout",
            "Mean Reversion",
            "Distribution Dump",
            "Consolidation Range",
        ]
        label_idx = (nid) % len(regime_labels)
        name = f"Regime {nid}: {regime_labels[label_idx]}"

        node = ConceptNode(nid, name, features, self.feature_dim)
        node.last_active_step = step
        self.nodes[nid] = node
        self.transition_counts[nid] = {nid: 1.0}
        return nid

    def _record_transition(self, from_id: int, to_id: int):
        """Record directed transition count between nodes."""
        if from_id not in self.transition_counts:
            self.transition_counts[from_id] = {}
        self.transition_counts[from_id][to_id] = self.transition_counts[from_id].get(to_id, 0.0) + 1.0

    def get_transition_probabilities(self, from_id: Optional[int] = None) -> Dict[int, float]:
        """Compute outgoing transition probabilities with Laplace smoothing."""
        fid = from_id if from_id is not None else self.active_node_id
        if fid is None or fid not in self.transition_counts:
            return {}

        counts = self.transition_counts[fid]
        total_transitions = sum(counts.values()) + (len(self.nodes) * self.smoothing_alpha)
        probs = {}
        for nid in self.nodes.keys():
            c = counts.get(nid, 0.0) + self.smoothing_alpha
            probs[nid] = round(c / max(1e-4, total_transitions), 3)
        return probs

    def predict_next_regime(self) -> Tuple[Optional[int], float]:
        """Anticipate next regime using Markov transition edge probabilities."""
        probs = self.get_transition_probabilities()
        if not probs:
            return None, 0.0
        best_id = max(probs.keys(), key=lambda k: probs[k])
        return best_id, probs[best_id]

    def predict_one(self, x: np.ndarray) -> int:
        """Predict using the currently active regime expert."""
        if self.active_node_id is not None and self.active_node_id in self.nodes:
            return self.nodes[self.active_node_id].predict(x)
        return 0

    def predict_proba_one(self, x: np.ndarray) -> float:
        """Probability prediction using active regime expert."""
        if self.active_node_id is not None and self.active_node_id in self.nodes:
            return self.nodes[self.active_node_id].predict_proba(x)
        return 0.5

    def update_sample(self, x: np.ndarray, y: int):
        """Train active expert model with ground-truth sample."""
        if self.active_node_id is not None and self.active_node_id in self.nodes:
            self.nodes[self.active_node_id].train_sample(x, y)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize complete concept topology graph for frontend visualization."""
        nodes_data = []
        for nid, node in sorted(self.nodes.items(), key=lambda x: x[0]):
            nodes_data.append({
                "id": nid,
                "label": node.label,
                "is_active": (nid == self.active_node_id),
                "samples": node.sample_count,
                "accuracy": round(node.accuracy, 1),
                "variance_scale": round(float(np.mean(node.variance)), 3),
                "created_at": round(node.created_at, 1),
                "last_active_step": node.last_active_step,
            })

        edges_data = []
        for from_id, targets in self.transition_counts.items():
            total = sum(targets.values())
            for to_id, count in targets.items():
                if from_id in self.nodes and to_id in self.nodes:
                    prob = round(count / max(1.0, total), 2)
                    edges_data.append({
                        "from": from_id,
                        "to": to_id,
                        "weight": count,
                        "probability": prob,
                        "is_active_transition": (from_id == self.active_node_id),
                    })

        next_predicted_regime, next_prob = self.predict_next_regime()

        return {
            "active_node_id": self.active_node_id,
            "total_nodes": len(self.nodes),
            "recall_count": self.recall_count,
            "spawn_count": self.spawn_count,
            "total_queries": self.total_queries,
            "last_action": self.last_action,
            "last_distance": round(self.last_distance, 3),
            "similarity_threshold": self.similarity_threshold,
            "next_predicted_regime": next_predicted_regime,
            "next_predicted_probability": round(next_prob * 100, 1),
            "nodes": nodes_data,
            "edges": edges_data,
        }
