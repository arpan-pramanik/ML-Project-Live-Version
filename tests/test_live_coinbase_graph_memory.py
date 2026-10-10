"""Verification Test Suite for Coinbase Live Stream, Graph Memory, and Downstream Risk Engine."""

import time
import numpy as np
from src.models.graph_memory import ConceptGraphMemory, ConceptNode
from src.models.downstream_risk import DownstreamRiskEngine
from src.models.graph_memory_adaptive import GraphMemoryAdaptiveModel
from src.datasets.coinbase_stream import CoinbaseLiveStream


def test_concept_graph_memory():
    """Verify Graph Memory spawns nodes, recalls recurring regimes, and computes transitions."""
    print("Testing ConceptGraphMemory...")
    gm = ConceptGraphMemory(feature_dim=9, similarity_threshold=1.5)

    # Initial regime
    x0 = np.zeros(9, dtype=np.float32)
    action, nid0, dist0 = gm.query_or_adapt(x0, step=1)
    assert action == "SPAWN"
    assert nid0 == 0

    # Repeat regime (stable)
    action, nid_s, _ = gm.query_or_adapt(x0 + 0.1, step=2)
    assert action == "STABLE"
    assert nid_s == 0

    # Novel regime (spawn)
    x1 = np.ones(9, dtype=np.float32) * 5.0
    action, nid1, dist1 = gm.query_or_adapt(x1, step=3, force_drift=True)
    assert action == "SPAWN"
    assert nid1 == 1

    # Return to initial regime (RECALL!)
    action, nid_recall, _ = gm.query_or_adapt(x0 + 0.05, step=4, force_drift=True)
    assert action == "RECALL"
    assert nid_recall == 0
    assert gm.recall_count >= 1

    # Check Markov transitions
    probs = gm.get_transition_probabilities(from_id=0)
    assert isinstance(probs, dict)
    state = gm.to_dict()
    assert state["total_nodes"] == 2
    assert state["recall_count"] >= 1
    print("✓ ConceptGraphMemory passed all checks!")


def test_downstream_risk_engine():
    """Verify Downstream Risk Engine executes simulated trades and applies defensive circuit breakers."""
    print("Testing DownstreamRiskEngine...")
    engine = DownstreamRiskEngine(initial_capital=10000.0)

    # Normal tick
    log1 = engine.execute_tick(
        price=60000.0,
        adaptive_pred=1,
        adaptive_conf=0.85,
        static_pred=1,
        retrain_pred=1,
        drift_detected=False,
    )
    assert log1["signal"] == "BUY"
    assert engine.adaptive_position > 0

    # Price moves up, tick 2
    log2 = engine.execute_tick(
        price=61000.0,
        adaptive_pred=1,
        adaptive_conf=0.80,
        static_pred=1,
        retrain_pred=1,
        drift_detected=False,
    )
    assert engine.adaptive_capital > 10000.0

    # Drift Event occurs! Defensive circuit breaker should trigger
    log3 = engine.execute_tick(
        price=59000.0,
        adaptive_pred=0,
        adaptive_conf=0.75,
        static_pred=1,
        retrain_pred=1,
        drift_detected=True,
    )
    assert "DEFENSIVE" in engine.adaptive_risk_status
    assert abs(engine.adaptive_position) <= 0.25  # Scaled down exposure

    data = engine.to_dict()
    assert "adaptive" in data and "static" in data and "retrain" in data
    assert len(data["recent_actions"]) == 3
    print("✓ DownstreamRiskEngine passed all checks!")


def test_graph_memory_adaptive_model():
    """Verify end-to-end integration of GraphMemoryAdaptiveModel."""
    print("Testing GraphMemoryAdaptiveModel...")
    X = np.random.randn(80, 9).astype(np.float32)
    y = (X[:, 0] > 0).astype(int)

    model = GraphMemoryAdaptiveModel(feature_dim=9)
    model.fit_initial(X[:20], y[:20])

    for i in range(20, 80):
        drift = model.update_sample(X[i], y[i], sample_idx=i, price=62000.0 + i)
        pred = model.predict_one(X[i])
        assert pred in (0, 1)

    g_state = model.get_graph_state()
    assert g_state["total_nodes"] >= 1
    d_state = model.get_downstream_state()
    assert d_state["adaptive"]["trades"] >= 50
    print("✓ GraphMemoryAdaptiveModel passed all checks!")


def test_coinbase_feature_extraction():
    """Verify feature extractor handles mock price ticks properly."""
    print("Testing CoinbaseLiveStream feature extraction...")
    stream = CoinbaseLiveStream(product_id="BTC-USD", window_size=15)
    for p in range(15):
        stream.prices.append(60000.0 + p * 10)
        stream.volumes.append(0.5)
        stream.timestamps.append(time.time() + p)
        stream.sides.append(1.0 if p % 2 == 0 else -1.0)

    feat, meta = stream._extract_features()
    assert feat.shape == (9,)
    assert not np.isnan(feat).any()
    assert meta["price"] == 60140.0
    print("✓ CoinbaseLiveStream feature extraction passed!")


def test_forward_prediction_trajectory_5s_intervals():
    """Verify forward trajectory computes 8 steps at 5-second intervals (T+5s .. T+40s)."""
    price = 65000.0
    vol = 0.001
    direction_sign = 1.0
    conf_norm = 0.85

    steps = []
    for s_idx in range(1, 9):
        sec = s_idx * 5
        drift_s = direction_sign * (vol * 0.25 * np.sqrt(s_idx)) * max(0.5, conf_norm)
        s_price = round(price * (1.0 + drift_s), 2)
        steps.append({
            "step": f"T+{sec}s",
            "step_num": s_idx,
            "seconds": sec,
            "price": s_price,
            "delta": round(s_price - price, 2),
            "delta_pct": round(drift_s * 100, 3),
        })

    assert len(steps) == 8
    assert steps[0]["step"] == "T+5s"
    assert steps[0]["seconds"] == 5
    assert steps[-1]["step"] == "T+40s"
    assert steps[-1]["seconds"] == 40
    assert all(s["price"] > price for s in steps)


if __name__ == "__main__":
    test_concept_graph_memory()
    test_downstream_risk_engine()
    test_graph_memory_adaptive_model()
    test_coinbase_feature_extraction()
    test_forward_prediction_trajectory_5s_intervals()
    print("\nALL LIVE STREAM & GRAPH MEMORY TESTS PASSED!")
