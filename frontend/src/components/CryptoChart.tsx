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
            // Group all points by Day (86400 seconds) to create a pure Daily timeframe chart.
            // This prevents live 1-second ticks from visually stretching out as a flat line 
            // when plotted alongside 7 years of 1-day historical candles.
            const dailyMap = new Map<number, number>();
            prices.forEach(p => {
                const dayTime = Math.floor(p.timestamp / 86400) * 86400;
                // Latest price overwrites previous prices for that day (acts as the live daily close)
                dailyMap.set(dayTime, p.price);
            });
            
            const uniqueLineData: LineData[] = Array.from(dailyMap.entries()).map(([time, value]) => ({
                time: time as Time,
                value
            }));
            uniqueLineData.sort((a, b) => (a.time as number) - (b.time as number));
            
            lineSeriesRef.current.setData(uniqueLineData);
            lastKnownPrice = uniqueLineData[uniqueLineData.length - 1];
        }
        
        if (predSeriesRef.current && predictions && predictions.length > 0 && lastKnownPrice) {
            const predData: LineData[] = [
                { time: lastKnownPrice.time, value: lastKnownPrice.value }
            ];
            
            let currTime = lastKnownPrice.time as number;
            
            predictions.forEach((p, idx) => {
                // Map future steps to future days so they scale proportionally on the Daily chart
                const fTime = Math.floor(currTime + (idx + 1) * 86400);
                predData.push({
                    time: fTime as Time,
                    value: p.price || p.predicted_price || p.value
                });
            });
            
            const uniquePredData = Array.from(new Map(predData.map(item => [item.time, item])).values());
            uniquePredData.sort((a, b) => (a.time as number) - (b.time as number));
            
            predSeriesRef.current.setData(uniquePredData);
        }
    }, [prices, predictions]);

    return (
        <div ref={chartContainerRef} style={{ width: '100%', height: '450px' }} className="rounded-lg overflow-hidden border border-slate-200" />
    );
}
