"use client";
import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, ISeriesApi, LineData, Time, CrosshairMode, LineSeries } from 'lightweight-charts';

export function CryptoChart({ 
    prices, 
    predictions 
}: { 
    prices: any[], 
    predictions: any[] 
}) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null);
    const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const predSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#ffffff' },
                textColor: '#475569',
            },
            grid: {
                vertLines: { color: '#f1f5f9' },
                horzLines: { color: '#f1f5f9' },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
            },
            timeScale: {
                borderColor: '#e2e8f0',
                timeVisible: true,
                secondsVisible: true,
            },
            rightPriceScale: {
                borderColor: '#e2e8f0',
            },
            width: chartContainerRef.current.clientWidth,
            height: 450,
        });

        chartRef.current = chart;

        const lineSeries = chart.addSeries(LineSeries, {
            color: '#1d4ed8',
            lineWidth: 2,
            crosshairMarkerVisible: true,
        });
        lineSeriesRef.current = lineSeries;

        const predSeries = chart.addSeries(LineSeries, {
            color: '#d97706', // amber-600
            lineWidth: 2,
            lineStyle: 2, // Dashed
            crosshairMarkerVisible: true,
        });
        predSeriesRef.current = predSeries;

        // Resize observer
        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, []);

    // Update data when prices/predictions change
    useEffect(() => {
        if (!chartRef.current) return;
        
        let lastKnownPrice: any = null;

        if (lineSeriesRef.current && prices && prices.length > 0) {
            // Quantize timestamps to 2-second multiples as requested.
            // Preserves historical daily candles while allowing granular zoom down to seconds (:02, :04, :06) on live data.
            const timeMap = new Map<number, number>();
            prices.forEach(p => {
                if (!p || typeof p.price !== 'number' || typeof p.timestamp !== 'number') return;
                // Quantize to 2-second multiple (even integer seconds)
                const t2s = Math.floor(p.timestamp / 2) * 2;
                timeMap.set(t2s, p.price);
            });
            
            const uniqueLineData: LineData[] = Array.from(timeMap.entries())
                .map(([time, value]) => ({
                    time: time as Time,
                    value: Math.round(value * 100) / 100
                }))
                .sort((a, b) => (a.time as number) - (b.time as number));
            
            if (uniqueLineData.length > 0) {
                lineSeriesRef.current.setData(uniqueLineData);
                lastKnownPrice = uniqueLineData[uniqueLineData.length - 1];
            }
        }
        
        if (predSeriesRef.current && predictions && predictions.length > 0 && lastKnownPrice) {
            const predData: LineData[] = [
                { time: lastKnownPrice.time, value: lastKnownPrice.value }
            ];
            
            let currTime = lastKnownPrice.time as number;
            
            predictions.forEach((p, idx) => {
                // Project future prediction steps in 2-second multiples (+2s, +4s, +6s, +8s...)
                const fTime = Math.floor(currTime + (idx + 1) * 2);
                predData.push({
                    time: fTime as Time,
                    value: Math.round((p.price || p.predicted_price || p.value || 0) * 100) / 100
                });
            });
            
            const uniquePredData = Array.from(new Map(predData.map(item => [item.time, item])).values())
                .sort((a, b) => (a.time as number) - (b.time as number));
            
            predSeriesRef.current.setData(uniquePredData);
        }
    }, [prices, predictions]);

    return (
        <div ref={chartContainerRef} style={{ width: '100%', height: '450px' }} className="rounded-lg overflow-hidden border border-slate-200" />
    );
}
