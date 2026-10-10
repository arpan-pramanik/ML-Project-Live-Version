"""Live real-time Coinbase WebSocket data stream connector and online feature extractor.

Streams live tick data (trades, ticker, matches) from Coinbase public WebSocket feed
(wss://ws-feed.exchange.coinbase.com) with optional authentication support via .env.
Computes high-frequency streaming features and labels for real-time concept drift detection.
"""

import os
import json
import time
import queue
import collections
import threading
import asyncio
from typing import Generator, Tuple, Dict, Any, Optional, List
import numpy as np
import aiohttp


class CoinbaseLiveStream:
    """Connects to Coinbase WebSocket, extracts streaming features, and produces prequential samples."""

    def __init__(
        self,
        product_id: str = "BTC-USD",
        window_size: int = 30,
        prediction_horizon: int = 5,
        price_change_threshold: float = 0.0001,
    ):
        self.product_id = product_id.upper()
        self.ws_url = "wss://ws-feed.exchange.coinbase.com"
        self.window_size = window_size
        self.prediction_horizon = prediction_horizon
        self.price_change_threshold = price_change_threshold

        self.queue: queue.Queue = queue.Queue(maxsize=2000)
        self.running = False
        self.connected = False
        self.thread: Optional[threading.Thread] = None

        # Rolling buffers for feature extraction
        self.prices = collections.deque(maxlen=window_size)
        self.volumes = collections.deque(maxlen=window_size)
        self.timestamps = collections.deque(maxlen=window_size)
        self.sides = collections.deque(maxlen=window_size)  # 1 for buy, -1 for sell

        # Pending prediction queue for prequential ground-truth label assignment
        # Stores (sample_id, features, current_price, timestamp, metadata)
        self.pending_samples = collections.deque(maxlen=1000)
        self.sample_counter = 0

        # Latest ticker cache
        self.latest_price = 0.0
        self.latest_volume = 0.0
        self.latest_timestamp = 0.0
        self.tick_count = 0
        self.start_time = 0.0

        # Read optional credentials from environment (if provided)
        self.api_key = os.getenv("COINBASE_API_KEY", "")
        self.api_secret = os.getenv("COINBASE_API_SECRET", "")
        self.passphrase = os.getenv("COINBASE_PASSPHRASE", "")

    def start(self):
        """Start the background ingestion thread."""
        if self.running:
            return
        self.running = True
        self.start_time = time.time()
        self.thread = threading.Thread(target=self._run_async_loop, daemon=True)
        self.thread.start()

    def stop(self):
        """Stop the stream and disconnect."""
        self.running = False
        self.connected = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2.0)

    def _run_async_loop(self):
        """Background thread running asyncio event loop."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._websocket_worker())
        finally:
            loop.close()

    async def _websocket_worker(self):
        """Asyncio worker maintaining WebSocket connection with auto-reconnect."""
        backoff = 1.0
        while self.running:
            try:
                timeout = aiohttp.ClientTimeout(total=15, connect=8)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.ws_connect(self.ws_url) as ws:
                        self.connected = True
                        backoff = 1.0

                        # Subscribe to public ticker & matches channels
                        sub_msg = {
                            "type": "subscribe",
                            "product_ids": [self.product_id],
                            "channels": ["matches", "ticker"],
                        }
                        await ws.send_str(json.dumps(sub_msg))

                        async for msg in ws:
                            if not self.running:
                                break
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                try:
                                    data = json.loads(msg.data)
                                    self._handle_message(data)
                                except Exception:
                                    continue
                            elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                                break
            except Exception:
                self.connected = False
                await asyncio.sleep(min(backoff, 10.0))
                backoff *= 1.5
            finally:
                self.connected = False

    def _handle_message(self, data: Dict[str, Any]):
        """Process incoming raw Coinbase WebSocket tick."""
        mtype = data.get("type")
        if mtype not in ("ticker", "match", "last_match"):
            return

        try:
            price_val = data.get("price")
            if not price_val:
                return
            price = float(price_val)
            size_val = data.get("size") or data.get("last_size") or 0.001
            volume = float(size_val)
            side_str = data.get("side", "buy").lower()
            side = 1.0 if side_str == "buy" else -1.0
            now = time.time()
        except (ValueError, TypeError):
            return

        self.latest_price = price
        self.latest_volume = volume
        self.latest_timestamp = now
        self.tick_count += 1

        self.prices.append(price)
        self.volumes.append(volume)
        self.timestamps.append(now)
        self.sides.append(side)

        # 1. Resolve pending samples whose prediction horizon has elapsed
        self._resolve_pending_samples(price)

        # 2. Extract features if we have enough rolling history
        if len(self.prices) >= 10:
            features, meta = self._extract_features()
            self.sample_counter += 1
            # Add to pending queue to evaluate forward label
            self.pending_samples.append({
                "sample_id": self.sample_counter,
                "features": features,
                "price": price,
                "timestamp": now,
                "meta": meta,
                "horizon_ticks": self.prediction_horizon,
            })

    def _extract_features(self) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Calculate high-frequency streaming features from rolling price/volume buffers."""
        prices = np.array(self.prices, dtype=np.float64)
        volumes = np.array(self.volumes, dtype=np.float64)
        sides = np.array(self.sides, dtype=np.float64)
        ts = np.array(self.timestamps, dtype=np.float64)

        current_price = prices[-1]
        prev_price = prices[-2] if len(prices) >= 2 else current_price

        # Feature 1: Log return (1 tick)
        ret_1 = np.log(max(1e-6, current_price) / max(1e-6, prev_price))

        # Feature 2: Rolling return over 5 ticks
        p_5 = prices[-5] if len(prices) >= 5 else prices[0]
        ret_5 = np.log(max(1e-6, current_price) / max(1e-6, p_5))

        # Feature 3: Rolling return over window
        ret_win = np.log(max(1e-6, current_price) / max(1e-6, prices[0]))

        # Feature 4: VWAP Delta (relative difference from rolling Volume-Weighted Average Price)
        tot_vol = np.sum(volumes)
        vwap = np.sum(prices * volumes) / max(1e-6, tot_vol)
        vwap_delta = (current_price - vwap) / max(1e-6, current_price)

        # Feature 5: Order Flow Imbalance (OFI) in [-1.0, 1.0]
        buy_vol = np.sum(volumes[sides > 0])
        sell_vol = np.sum(volumes[sides < 0])
        ofi = (buy_vol - sell_vol) / max(1e-6, (buy_vol + sell_vol))

        # Feature 6: Rolling Realized Volatility (standard deviation of log returns)
        if len(prices) >= 3:
            log_returns = np.diff(np.log(np.maximum(1e-6, prices)))
            realized_vol = float(np.std(log_returns))
        else:
            realized_vol = 0.0

        # Feature 7: EMA Spread (Fast EMA 5 - Slow EMA 20) normalized by price
        if len(prices) >= 20:
            ema_fast = float(np.mean(prices[-5:]))
            ema_slow = float(np.mean(prices[-20:]))
            ema_spread = (ema_fast - ema_slow) / max(1e-6, current_price)
        else:
            ema_spread = 0.0

        # Feature 8: Tick Velocity (ticks per second)
        dt = ts[-1] - ts[0]
        tick_velocity = len(prices) / max(0.1, dt)

        # Feature 9: Volume Momentum (current volume / mean rolling volume)
        mean_vol = np.mean(volumes)
        vol_momentum = volumes[-1] / max(1e-6, mean_vol)

        # 9-dimensional normalized feature vector
        feat_vector = np.array([
            ret_1 * 100.0,
            ret_5 * 100.0,
            ret_win * 100.0,
            vwap_delta * 1000.0,
            ofi,
            realized_vol * 1000.0,
            ema_spread * 1000.0,
            tick_velocity / 10.0,
            vol_momentum,
        ], dtype=np.float32)

        meta = {
            "price": current_price,
            "vwap": vwap,
            "ofi": ofi,
            "volatility": realized_vol,
            "tick_velocity": tick_velocity,
            "timestamp": ts[-1],
            "product_id": self.product_id,
        }
        return feat_vector, meta

    def _resolve_pending_samples(self, current_price: float):
        """Compare current price against pending samples to emit resolved (X, y) ground truth."""
        while self.pending_samples:
            sample = self.pending_samples[0]
            sample["horizon_ticks"] -= 1

            if sample["horizon_ticks"] <= 0:
                self.pending_samples.popleft()
                entry_price = sample["price"]
                price_diff = (current_price - entry_price) / max(1e-6, entry_price)

                # Binary classification label: 1 if price went UP, 0 if DOWN or flat
                label = 1 if price_diff > self.price_change_threshold else 0
                sample["meta"]["exit_price"] = current_price
                sample["meta"]["price_return"] = price_diff

                try:
                    self.queue.put_nowait((sample["features"], label, sample["meta"]))
                except queue.Full:
                    # Drop oldest if queue full to prevent memory leak
                    try:
                        self.queue.get_nowait()
                        self.queue.put_nowait((sample["features"], label, sample["meta"]))
                    except Exception:
                        pass
            else:
                break

    def get_sample(self, timeout: float = 1.0) -> Optional[Tuple[np.ndarray, int, Dict[str, Any]]]:
        """Fetch the next resolved streaming sample."""
        try:
            return self.queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def get_status(self) -> Dict[str, Any]:
        """Get live telemetry for the WebSocket stream."""
        elapsed = time.time() - self.start_time if self.start_time > 0 else 0.0
        return {
            "source": "Coinbase Exchange WebSocket",
            "product_id": self.product_id,
            "connected": self.connected,
            "running": self.running,
            "latest_price": self.latest_price,
            "latest_volume": self.latest_volume,
            "total_ticks": self.tick_count,
            "queue_size": self.queue.qsize(),
            "tick_rate": round(self.tick_count / max(0.1, elapsed), 1) if elapsed > 0 else 0.0,
            "elapsed_seconds": round(elapsed, 1),
        }
