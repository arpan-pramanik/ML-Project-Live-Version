import requests
import datetime
import time
import csv
import os

def fetch_and_save_history():
    product_id = "BTC-USD"
    url = f"https://api.exchange.coinbase.com/products/{product_id}/candles"
    
    current_time = datetime.datetime(2019, 1, 1, tzinfo=datetime.timezone.utc)
    end_time = datetime.datetime.now(datetime.timezone.utc)
    
    all_candles = []
    print(f"Fetching {product_id} historical data from {current_time.date()} to {end_time.date()}...")
    
    while current_time < end_time:
        next_time = current_time + datetime.timedelta(days=300)
        if next_time > end_time:
            next_time = end_time
            
        params = {
            "granularity": 86400, # Daily candles
            "start": current_time.isoformat(),
            "end": next_time.isoformat()
        }
        try:
            res = requests.get(url, params=params)
            if res.status_code == 200:
                data = res.json()
                if not data:
                    break
                all_candles.extend(data)
            else:
                print(f"API Error {res.status_code}")
                break
            time.sleep(0.15)
        except Exception as e:
            print(f"Failed: {e}")
            break
        current_time = next_time
        
    # Sort ascending by time
    all_candles.sort(key=lambda x: x[0])
    
    # Save to CSV
    os.makedirs("data", exist_ok=True)
    filename = "data/coinbase_btc_history_2019_2026.csv"
    with open(filename, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "date", "low", "high", "open", "close", "volume"])
        for c in all_candles:
            # c = [time, low, high, open, close, volume]
            dt_str = datetime.datetime.fromtimestamp(c[0], tz=datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
            writer.writerow([c[0], dt_str, c[1], c[2], c[3], c[4], c[5]])
            
    print(f"Saved {len(all_candles)} rows to {filename}")

if __name__ == "__main__":
    fetch_and_save_history()
