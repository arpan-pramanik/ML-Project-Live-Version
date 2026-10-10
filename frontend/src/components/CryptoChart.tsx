"use client";
import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, ISeriesApi, LineData, Time, CrosshairMode } from 'lightweight-charts';

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
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#e2e8f0',
            },
            rightPriceScale: {
                borderColor: '#e2e8f0',
            },
            width: chartContainerRef.current.clientWidth,
            height: 450,
        });

        chartRef.current = chart;

        const lineSeries = chart.addLineSeries({
            color: '#1d4ed8',
            lineWidth: 2,
            crosshairMarkerVisible: true,
        });
        lineSeriesRef.current = lineSeries;

        const predSeries = chart.addLineSeries({
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
            const lineData: LineData[] = prices.map(p => ({
                time: Math.floor(p.timestamp) as Time,
                value: p.price
            }));
            // Ensure strictly ascending and unique timestamps
            const uniqueLineData = Array.from(new Map(lineData.map(item => [item.time, item])).values());
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
                const fTime = Math.floor(currTime + (idx + 1) * 60);
                predData.push({
                    time: fTime as Time,
                    value: p.price
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
