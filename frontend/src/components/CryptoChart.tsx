"use client";
import { useEffect, useRef } from 'react';
import { createChart, ColorType, ISeriesApi, LineData, Time, CrosshairMode, LineSeries } from 'lightweight-charts';

export function CryptoChart({ 
    prices, 
    predictions,
    nextDayPrice,
}: { 
    prices: any[]; 
    predictions?: any[];
    nextDayPrice?: number;
}) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null);
    const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const predSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const hasFittedRef = useRef<boolean>(false);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // TradingView chart sticks strictly to Daily resolution (no time/seconds)
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
            // Group all historical & live points strictly by Day (86400s) to keep TradingView on pure Daily scale
            const dailyMap = new Map<number, number>();
            prices.forEach(p => {
                if (!p || typeof p.price !== 'number' || typeof p.timestamp !== 'number') return;
                const dayTime = Math.floor(p.timestamp / 86400) * 86400;
                dailyMap.set(dayTime, p.price);
            });
            
            const uniqueLineData: LineData[] = Array.from(dailyMap.entries())
                .map(([time, value]) => ({
                    time: time as Time,
                    value: Math.round(value * 100) / 100
                }))
                .sort((a, b) => (a.time as number) - (b.time as number));
            
            if (uniqueLineData.length > 0) {
                lineSeriesRef.current.setData(uniqueLineData);
                lastKnownPrice = uniqueLineData[uniqueLineData.length - 1];

                if (!hasFittedRef.current && uniqueLineData.length > 10 && chartRef.current) {
                    chartRef.current.timeScale().fitContent();
                    hasFittedRef.current = true;
                }
            }
        }
        
        // Show next-day prediction on the daily TradingView chart
        if (predSeriesRef.current && lastKnownPrice) {
            const nextDayTime = (lastKnownPrice.time as number) + 86400;
            const targetP = nextDayPrice || (predictions && predictions.length > 0 ? (predictions[0].price || predictions[0].value) : lastKnownPrice.value);
            
            const predData: LineData[] = [
                { time: lastKnownPrice.time, value: lastKnownPrice.value },
                { time: nextDayTime as Time, value: Math.round(targetP * 100) / 100 }
            ];
            
            predSeriesRef.current.setData(predData);
        }
    }, [prices, predictions, nextDayPrice]);

    return (
        <div ref={chartContainerRef} style={{ width: '100%', height: '450px' }} className="rounded-lg overflow-hidden border border-slate-200" />
    );
}
