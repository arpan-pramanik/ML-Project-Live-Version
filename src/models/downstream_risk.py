"""Downstream Execution & Dynamic Risk Management Cockpit.

Connects streaming ML predictions and concept drift / graph memory events to actionable downstream outcomes:
- Dynamic position sizing based on prediction confidence and regime state
- Instant capital protection (circuit breaker) when drift occurs
- Side-by-side 3-way comparative ledger:
  1. Graph Memory Adaptive Framework
  2. Static Baseline Model
  3. Full Retraining Baseline Model
"""

import time
from typing import Dict, Any, List, Optional


class DownstreamRiskEngine:
    """Simulates real-time downstream trade execution and capital preservation."""

    def __init__(self, initial_capital: float = 10000.0):
        self.initial_capital = initial_capital

        # 1. Graph Memory Adaptive Strategy
        self.adaptive_capital = initial_capital
        self.adaptive_position = 0.0  # +1.0 Long, -1.0 Short, 0.0 Flat
        self.adaptive_entry_price = 0.0
        self.adaptive_trades = 0
        self.adaptive_wins = 0
        self.adaptive_peak = initial_capital
        self.adaptive_max_drawdown = 0.0
        self.adaptive_risk_status = "NORMAL (100% Budget)"

        # 2. Static Model Strategy
        self.static_capital = initial_capital
        self.static_position = 0.0
        self.static_entry_price = 0.0
        self.static_trades = 0
        self.static_wins = 0
        self.static_peak = initial_capital
        self.static_max_drawdown = 0.0

        # 3. Full Retrain Strategy (with latency penalty)
        self.retrain_capital = initial_capital
        self.retrain_position = 0.0
        self.retrain_entry_price = 0.0
        self.retrain_trades = 0
        self.retrain_wins = 0
        self.retrain_peak = initial_capital
        self.retrain_max_drawdown = 0.0

        # Action history logs
        self.action_logs: List[Dict[str, Any]] = []

    def execute_tick(
        self,
        price: float,
        adaptive_pred: int,
        adaptive_conf: float,
        static_pred: int,
        retrain_pred: int,
        drift_detected: bool,
        graph_action: str = "STABLE",
        regime_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Process incoming price tick and evaluate downstream execution."""
        timestamp_str = time.strftime("%H:%M:%S")

        # --- A. UPDATE EXISTING POSITIONS ---
        # 1. Adaptive PnL
        if self.adaptive_position != 0 and self.adaptive_entry_price > 0:
            price_change = (price - self.adaptive_entry_price) / self.adaptive_entry_price
            pnl = self.adaptive_position * price_change * (self.adaptive_capital * 0.4)
            self.adaptive_capital += pnl
            if pnl > 0:
                self.adaptive_wins += 1

        # 2. Static PnL
        if self.static_position != 0 and self.static_entry_price > 0:
            price_change = (price - self.static_entry_price) / self.static_entry_price
            pnl_static = self.static_position * price_change * (self.static_capital * 0.4)
            self.static_capital += pnl_static
            if pnl_static > 0:
                self.static_wins += 1

        # 3. Retrain PnL
        if self.retrain_position != 0 and self.retrain_entry_price > 0:
            price_change = (price - self.retrain_entry_price) / self.retrain_entry_price
            pnl_retrain = self.retrain_position * price_change * (self.retrain_capital * 0.4)
            self.retrain_capital += pnl_retrain
            if pnl_retrain > 0:
                self.retrain_wins += 1

        # Update Peaks & Drawdowns
        self.adaptive_peak = max(self.adaptive_peak, self.adaptive_capital)
        ad_dd = (self.adaptive_peak - self.adaptive_capital) / max(1.0, self.adaptive_peak) * 100.0
        self.adaptive_max_drawdown = max(self.adaptive_max_drawdown, ad_dd)

        self.static_peak = max(self.static_peak, self.static_capital)
        st_dd = (self.static_peak - self.static_capital) / max(1.0, self.static_peak) * 100.0
        self.static_max_drawdown = max(self.static_max_drawdown, st_dd)

        self.retrain_peak = max(self.retrain_peak, self.retrain_capital)
        rt_dd = (self.retrain_peak - self.retrain_capital) / max(1.0, self.retrain_peak) * 100.0
        self.retrain_max_drawdown = max(self.retrain_max_drawdown, rt_dd)

        # --- B. ADAPTIVE RISK CONTROL PROTOCOL ---
        action_note = "HOLD"
        if drift_detected:
            # DEFENSIVE CIRCUIT BREAKER: Scale exposure down by 75%
            self.adaptive_position = 0.25 if adaptive_pred == 1 else -0.25
            self.adaptive_risk_status = "DEFENSIVE (25% Budget - Drift Triggered)"
            action_note = "CIRCUIT BREAKER: Exposure reduced on Drift"
        elif "RECALL" in graph_action:
            # RECURRING REGIME RECALL: Instantly restore full exposure with confidence scaling
            size_multiplier = min(1.0, max(0.5, adaptive_conf))
            self.adaptive_position = size_multiplier if adaptive_pred == 1 else -size_multiplier
            self.adaptive_risk_status = f"RECALL ACCELERATION (Regime #{regime_id})"
            action_note = f"INSTANT RECALL: Activated Regime #{regime_id} expert"
        else:
            # Nominal regime trading
            size_multiplier = min(1.0, max(0.5, adaptive_conf))
            self.adaptive_position = size_multiplier if adaptive_pred == 1 else -size_multiplier
            self.adaptive_risk_status = "NORMAL (100% Budget)"
            action_note = "LONG" if adaptive_pred == 1 else "SHORT"

        self.adaptive_entry_price = price
        self.adaptive_trades += 1

        # Static unadapted execution (always full 1.0 position regardless of drift)
        self.static_position = 1.0 if static_pred == 1 else -1.0
        self.static_entry_price = price
        self.static_trades += 1

        # Retrain execution
        self.retrain_position = 0.8 if retrain_pred == 1 else -0.8
        self.retrain_entry_price = price
        self.retrain_trades += 1

        log_item = {
            "timestamp": timestamp_str,
            "price": round(price, 2),
            "signal": "BUY" if adaptive_pred == 1 else "SELL",
            "confidence": round(adaptive_conf * 100, 1),
            "risk_action": action_note,
            "drift": drift_detected,
            "graph_action": graph_action,
            "adaptive_pnl": round(self.adaptive_capital - self.initial_capital, 2),
            "static_pnl": round(self.static_capital - self.initial_capital, 2),
        }
        self.action_logs.append(log_item)
        if len(self.action_logs) > 50:
            self.action_logs.pop(0)

        return log_item

    def to_dict(self) -> Dict[str, Any]:
        """Serialize complete comparative financial & risk cockpit."""
        return {
            "adaptive": {
                "capital": round(self.adaptive_capital, 2),
                "pnl": round(self.adaptive_capital - self.initial_capital, 2),
                "pnl_pct": round(((self.adaptive_capital - self.initial_capital) / self.initial_capital) * 100, 2),
                "position": round(self.adaptive_position, 2),
                "trades": self.adaptive_trades,
                "win_rate": round((self.adaptive_wins / max(1, self.adaptive_trades)) * 100, 1),
                "max_drawdown": round(self.adaptive_max_drawdown, 2),
                "risk_status": self.adaptive_risk_status,
            },
            "static": {
                "capital": round(self.static_capital, 2),
                "pnl": round(self.static_capital - self.initial_capital, 2),
                "pnl_pct": round(((self.static_capital - self.initial_capital) / self.initial_capital) * 100, 2),
                "position": round(self.static_position, 2),
                "trades": self.static_trades,
                "win_rate": round((self.static_wins / max(1, self.static_trades)) * 100, 1),
                "max_drawdown": round(self.static_max_drawdown, 2),
            },
            "retrain": {
                "capital": round(self.retrain_capital, 2),
                "pnl": round(self.retrain_capital - self.initial_capital, 2),
                "pnl_pct": round(((self.retrain_capital - self.initial_capital) / self.initial_capital) * 100, 2),
                "position": round(self.retrain_position, 2),
                "trades": self.retrain_trades,
                "win_rate": round((self.retrain_wins / max(1, self.retrain_trades)) * 100, 1),
                "max_drawdown": round(self.retrain_max_drawdown, 2),
            },
            "recent_actions": list(self.action_logs[-15:]),
        }
