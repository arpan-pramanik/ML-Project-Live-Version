"""Graph-Memory Augmented Adaptive Online Machine Learning Model.

Integrates:
1. Concept Topology Graph Memory (ConceptGraphMemory) for zero-latency recurring concept recall
2. Online Statistical Concept Drift Detector (ADWIN / DDM)
3. Selective Adaptive Sub-Ensemble
4. Downstream Risk & Execution Engine (DownstreamRiskEngine)
"""

import time
from typing import List, Optional, Dict, Any, Tuple
import numpy as np

from src.detectors.base import BaseDriftDetector
from src.detectors.adwin import ADWINDetector
from src.models.graph_memory import ConceptGraphMemory
from src.models.downstream_risk import DownstreamRiskEngine
from src.models.selective_adaptive import SelectiveAdaptiveEnsemble


class GraphMemoryAdaptiveModel:
    """Adaptive streaming classifier augmented with dynamic concept graph memory and downstream execution."""

    def __init__(
        self,
        feature_dim: int = 9,
        drift_detector: Optional[BaseDriftDetector] = None,
        similarity_threshold: float = 1.8,
        name: str = "Graph Memory Concept Topology Adaptive Model",
    ):
        self.feature_dim = feature_dim
        self.drift_detector = drift_detector or ADWINDetector(delta=0.005)
        self.name = name

        # Core Graph Memory
        self.graph_memory = ConceptGraphMemory(
            feature_dim=feature_dim,
            similarity_threshold=similarity_threshold,
        )

        # Baseline ensemble for selective localized updates
        self.adaptive_ensemble = SelectiveAdaptiveEnsemble(
            n_estimators=15,
            replacement_ratio=0.3,
            drift_detector=self.drift_detector,
        )

        # Downstream execution engine
        self.risk_engine = DownstreamRiskEngine(initial_capital=10000.0)

        # Sliding window buffer for centroid distribution estimation
        self.window_buffer: List[np.ndarray] = []
        self.window_size = 25

        # Tracking state
        self.sample_count = 0
        self.last_components_updated = 0
        self.last_action = "STABLE"
        self.last_regime_id = 0
        self.selected_feature_indices = list(range(feature_dim))

    def fit_initial(self, X: np.ndarray, y: np.ndarray):
        """Warmup initialization."""
        self.feature_dim = X.shape[1]
        self.selected_feature_indices = list(range(self.feature_dim))
        self.adaptive_ensemble.fit_initial(X, y)

        # Initialize root node in graph memory
        mean_init = np.mean(X, axis=0)
        self.graph_memory.feature_dim = self.feature_dim
        self.graph_memory.initialize_root_node(mean_init, label="Regime 0: Warmup Stationary")

        # Pre-train initial expert
        for i in range(min(len(X), 100)):
            self.graph_memory.update_sample(X[i], int(y[i]))

    def predict_one(self, x: np.ndarray) -> int:
        """Ensemble prediction combining active graph expert and adaptive ensemble."""
        p_graph = float(self.graph_memory.predict_proba_one(x))
        p_ens = self.adaptive_ensemble.predict_proba_one(x)
        p_ens_1 = float(p_ens[1]) if isinstance(p_ens, (np.ndarray, list)) and len(p_ens) > 1 else float(p_ens)
        p_comb = (0.55 * p_graph) + (0.45 * p_ens_1)
        return 1 if p_comb >= 0.5 else 0

    def predict_proba_one(self, x: np.ndarray) -> float:
        """Calibrated probability combining graph memory and adaptive ensemble."""
        p_graph = float(self.graph_memory.predict_proba_one(x))
        p_ens = self.adaptive_ensemble.predict_proba_one(x)
        p_ens_1 = float(p_ens[1]) if isinstance(p_ens, (np.ndarray, list)) and len(p_ens) > 1 else float(p_ens)
        return float((0.55 * p_graph) + (0.45 * p_ens_1))

    def update_sample(
        self,
        x: np.ndarray,
        y: int,
        sample_idx: int = 0,
        price: Optional[float] = None,
        static_pred: int = 0,
        retrain_pred: int = 0,
    ) -> bool:
        """Prequential update with graph topology query and downstream risk dispatch."""
        self.sample_count += 1
        self.window_buffer.append(x)
        if len(self.window_buffer) > self.window_size:
            self.window_buffer.pop(0)

        # 1. Evaluate prediction error & monitor statistical drift
        pred = self.predict_one(x)
        conf = self.predict_proba_one(x)
        conf_metric = conf if pred == 1 else (1.0 - conf)
        err = 1 if pred != y else 0

        # ADWIN drift detection on prediction error
        drift_occurred = self.drift_detector.update(err)

        # 2. Concept Graph Memory Query & Topology Adaptation
        action_type = "STABLE"
        regime_id = self.graph_memory.active_node_id or 0
        dist = 0.0

        if len(self.window_buffer) >= 10:
            current_mean = np.mean(self.window_buffer, axis=0)
            action_type, regime_id, dist = self.graph_memory.query_or_adapt(
                current_mean,
                step=self.sample_count,
                force_drift=drift_occurred,
            )

        self.last_action = action_type
        self.last_regime_id = regime_id

        # 3. Handle model adaptation based on Graph Memory action
        if action_type == "RECALL":
            # RECURRING CONCEPT: 0ms Instant Swap! No retraining needed
            self.last_components_updated = 1
            drift_occurred = True  # Signal event to telemetry
        elif action_type == "SPAWN" or drift_occurred:
            # NOVEL REGIME: Selectively adapt ensemble components
            self.adaptive_ensemble.update_sample(x, y, sample_idx=sample_idx)
            self.last_components_updated = max(2, int(np.ceil(self.adaptive_ensemble.n_estimators * 0.3)))
            drift_occurred = True
        else:
            self.last_components_updated = 0

        # 4. Continual online learning on current sample
        self.graph_memory.update_sample(x, y)

        # 5. Downstream Execution & Risk Cockpit Update (if price is provided)
        current_price = price if price is not None else float(x[0] if len(x) > 0 else 100.0)
        self.risk_engine.execute_tick(
            price=current_price,
            adaptive_pred=pred,
            adaptive_conf=conf_metric,
            static_pred=static_pred,
            retrain_pred=retrain_pred,
            drift_detected=drift_occurred,
            graph_action=action_type,
            regime_id=regime_id,
        )

        return drift_occurred

    def get_graph_state(self) -> Dict[str, Any]:
        """Returns live concept graph memory topology."""
        return self.graph_memory.to_dict()

    def get_downstream_state(self) -> Dict[str, Any]:
        """Returns live downstream financial execution ledger."""
        return self.risk_engine.to_dict()
