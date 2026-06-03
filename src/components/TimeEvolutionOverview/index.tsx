import React, { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore } from '@/store/volumeStore';
import {
  loadNyxData,
  calculateTimestepRelationMetrics,
  type TimestepRelationMetrics,
} from '@/utils/nyxDataLoader';
import './index.less';

interface TimeEvolutionOverviewProps {
  totalSteps?: number;
  dimensions?: { x: number; y: number; z: number };
}

const DEFAULT_TOTAL_STEPS = 100;
const DEFAULT_DIMENSIONS = { x: 128, y: 128, z: 128 };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const buildLinePoints = (
  values: number[],
  width: number,
  height: number,
  minValue: number,
  maxValue: number
) => {
  if (values.length === 0) return '';

  const range = maxValue - minValue || 1;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const normalized = (value - minValue) / range;
      const y = height - normalized * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
};

const getHeatColor = (ratio: number) => {
  const clamped = clamp(ratio, 0, 1);
  const hue = 220 - clamped * 180;
  const saturation = 80;
  const lightness = 18 + clamped * 52;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const TimeEvolutionOverview: React.FC<TimeEvolutionOverviewProps> = observer(({
  totalSteps = DEFAULT_TOTAL_STEPS,
  dimensions = DEFAULT_DIMENSIONS,
}) => {
  const [metrics, setMetrics] = useState<Array<TimestepRelationMetrics | null>>(
    () => new Array(totalSteps).fill(null)
  );
  const [loadedCount, setLoadedCount] = useState(0);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const heatmapRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const nextMetrics: Array<TimestepRelationMetrics | null> = new Array(totalSteps).fill(null);

      const requests = Array.from({ length: totalSteps }, async (_, step) => {
        const filename = `${step.toString().padStart(4, '0')}.dat`;
        const data = await loadNyxData(`/assets/Nyx/${filename}`, step, dimensions);
        return calculateTimestepRelationMetrics(data.data, step, 64);
      });

      const results = await Promise.allSettled(requests);

      let successCount = 0;
      results.forEach((result, step) => {
        if (result.status === 'fulfilled') {
          nextMetrics[step] = result.value;
          successCount += 1;
        } else {
          console.error(`Failed to load timestep ${step}`, result.reason);
        }
      });

      if (cancelled) return;

      setMetrics(nextMetrics);
      setLoadedCount(successCount);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [dimensions, totalSteps]);

  const loadedMetrics = useMemo(
    () => metrics.filter((item): item is TimestepRelationMetrics => item !== null),
    [metrics]
  );

  const selectedStep = hoveredStep ?? volumeStore.currentStep;
  const selectedMetric = metrics[selectedStep] ?? null;

  const heatmapData = useMemo(() => {
    if (loadedMetrics.length === 0) return null;

    const bins = loadedMetrics[0]?.histogram.logBins.length ?? 0;
    if (bins === 0) return null;

    let maxCount = 0;
    for (const metric of loadedMetrics) {
      for (const count of metric.histogram.logBins) {
        if (count > maxCount) maxCount = count;
      }
    }

    return { bins, maxCount };
  }, [loadedMetrics]);

  const lineData = useMemo(() => {
    const meanValues: number[] = [];
    const stdValues: number[] = [];
    const p99Values: number[] = [];
    const maxValues: number[] = [];
    const entropyValues: number[] = [];
    const clusterRatios: number[] = [];
    const voidRatios: number[] = [];

    for (const metric of loadedMetrics) {
      meanValues.push(metric.statistics.mean);
      stdValues.push(metric.statistics.std);
      p99Values.push(metric.statistics.p99);
      maxValues.push(metric.statistics.max);
      entropyValues.push(metric.entropy);
      clusterRatios.push(metric.phaseOccupancy.clusterRatio);
      voidRatios.push(metric.phaseOccupancy.voidRatio);
    }

    const combined = [...meanValues, ...stdValues, ...p99Values, ...maxValues, ...entropyValues, ...clusterRatios, ...voidRatios];
    const minValue = combined.length ? Math.min(...combined) : 0;
    const maxValue = combined.length ? Math.max(...combined) : 1;

    return {
      meanValues,
      stdValues,
      p99Values,
      maxValues,
      entropyValues,
      clusterRatios,
      voidRatios,
      minValue,
      maxValue,
    };
  }, [loadedMetrics]);

  const phaseBars = useMemo(() => {
    return loadedMetrics.map(metric => ({
      step: metric.timestep,
      voidRatio: metric.phaseOccupancy.voidRatio,
      transitionRatio: metric.phaseOccupancy.transitionRatio,
      clusterRatio: metric.phaseOccupancy.clusterRatio,
      entropy: metric.entropy,
    }));
  }, [loadedMetrics]);

  const selectedSummary = selectedMetric
    ? [
        `均值 ${selectedMetric.statistics.mean.toExponential(3)}`,
        `波动 ${selectedMetric.statistics.std.toExponential(3)}`,
        `p99 ${selectedMetric.statistics.p99.toExponential(3)}`,
        `团块占比 ${(selectedMetric.phaseOccupancy.clusterRatio * 100).toFixed(1)}%`,
        `空洞占比 ${(selectedMetric.phaseOccupancy.voidRatio * 100).toFixed(1)}%`,
      ].join(' · ')
    : '正在构建全时间步关系图…';

  const handleHeatmapInteraction = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = heatmapRef.current;
    if (!svg || loadedMetrics.length === 0) return;

    const rect = svg.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const step = clamp(Math.round((x / rect.width) * (totalSteps - 1)), 0, totalSteps - 1);
    volumeStore.setTimeStep(step);
  };

  const trendWidth = 920;
  const trendHeight = 180;
  const phaseWidth = 920;
  const phaseHeight = 110;

  return (
    <div className="time-evolution-overview">
      <div className="overview-header">
        <div>
          <div className="overview-title">全时间步关系总览</div>
          <div className="overview-subtitle">热力图、趋势曲线、相态占有率与复杂度指标一次性呈现</div>
        </div>
        <div className="overview-progress">
          {loadedCount}/{totalSteps}
        </div>
      </div>

      <div className="overview-summary">{selectedSummary}</div>

      <div className="overview-grid">
        <section className="overview-panel overview-heatmap-panel">
          <header>
            <span>密度 PDF 演化热力图</span>
            <span>{loadedMetrics.length ? `已加载 ${loadedMetrics.length} 步` : '等待数据'}</span>
          </header>
          <svg
            ref={heatmapRef}
            className="overview-heatmap"
            viewBox={`0 0 ${trendWidth} 220`}
            preserveAspectRatio="none"
            onMouseMove={handleHeatmapInteraction}
            onClick={handleHeatmapInteraction}
          >
            <rect x="0" y="0" width={trendWidth} height="220" className="overview-background" />
            {heatmapData ? loadedMetrics.map(metric => {
              const stepWidth = trendWidth / totalSteps;
              const binHeight = 220 / heatmapData.bins;
              const maxCount = heatmapData.maxCount || 1;

              return metric.histogram.logBins.map((count, binIndex) => {
                const x = metric.timestep * stepWidth;
                const y = 220 - (binIndex + 1) * binHeight;
                const ratio = count / maxCount;
                return (
                  <rect
                    key={`${metric.timestep}-${binIndex}`}
                    x={x}
                    y={y}
                    width={stepWidth + 0.2}
                    height={binHeight + 0.2}
                    fill={getHeatColor(ratio)}
                    opacity={0.95}
                  />
                );
              });
            }) : null}
            {loadedMetrics.length > 0 && (
              <line
                x1={(selectedStep / (totalSteps - 1)) * trendWidth}
                y1="0"
                x2={(selectedStep / (totalSteps - 1)) * trendWidth}
                y2="220"
                className="overview-cursor"
              />
            )}
          </svg>
          <div className="overview-axis">
            <span>0</span>
            <span>{Math.floor(totalSteps / 4)}</span>
            <span>{Math.floor(totalSteps / 2)}</span>
            <span>{Math.floor(totalSteps * 3 / 4)}</span>
            <span>{totalSteps - 1}</span>
          </div>
        </section>

        <section className="overview-panel overview-line-panel">
          <header>
            <span>均值 / 波动 / 尾部骨架</span>
            <span>Mean · Std · p99 · Max</span>
          </header>
          <svg className="overview-lines" viewBox={`0 0 ${trendWidth} ${trendHeight}`} preserveAspectRatio="none">
            <rect x="0" y="0" width={trendWidth} height={trendHeight} className="overview-background" />
            <g className="overview-grid-lines">
              {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
                <line key={ratio} x1="0" y1={trendHeight * ratio} x2={trendWidth} y2={trendHeight * ratio} />
              ))}
            </g>
            {loadedMetrics.length > 1 && (
              <>
                <polyline className="line mean-line" points={buildLinePoints(lineData.meanValues, trendWidth, trendHeight, lineData.minValue, lineData.maxValue)} />
                <polyline className="line std-line" points={buildLinePoints(lineData.stdValues, trendWidth, trendHeight, lineData.minValue, lineData.maxValue)} />
                <polyline className="line p99-line" points={buildLinePoints(lineData.p99Values, trendWidth, trendHeight, lineData.minValue, lineData.maxValue)} />
                <polyline className="line max-line" points={buildLinePoints(lineData.maxValues, trendWidth, trendHeight, lineData.minValue, lineData.maxValue)} />
              </>
            )}
          </svg>
          <div className="overview-legend">
            <span className="legend-item mean">均值</span>
            <span className="legend-item std">波动</span>
            <span className="legend-item p99">p99</span>
            <span className="legend-item max">最大值</span>
          </div>
        </section>

        <section className="overview-panel overview-phase-panel">
          <header>
            <span>空洞 / 过渡 / 团块占有率</span>
            <span>Void · Transition · Cluster</span>
          </header>
          <svg className="overview-phases" viewBox={`0 0 ${phaseWidth} ${phaseHeight}`} preserveAspectRatio="none">
            <rect x="0" y="0" width={phaseWidth} height={phaseHeight} className="overview-background" />
            {phaseBars.map(bar => {
              const x = (bar.step / totalSteps) * phaseWidth;
              const barWidth = phaseWidth / totalSteps;
              const voidHeight = bar.voidRatio * phaseHeight;
              const transHeight = bar.transitionRatio * phaseHeight;
              const clusterHeight = bar.clusterRatio * phaseHeight;
              return (
                <g key={bar.step}>
                  <rect x={x} y={phaseHeight - voidHeight} width={barWidth + 0.2} height={voidHeight} className="phase-void" />
                  <rect x={x} y={phaseHeight - voidHeight - transHeight} width={barWidth + 0.2} height={transHeight} className="phase-transition" />
                  <rect x={x} y={phaseHeight - voidHeight - transHeight - clusterHeight} width={barWidth + 0.2} height={clusterHeight} className="phase-cluster" />
                </g>
              );
            })}
          </svg>
        </section>

        <section className="overview-panel overview-entropy-panel">
          <header>
            <span>复杂度 / 熵演化</span>
            <span>Normalized entropy</span>
          </header>
          <svg className="overview-entropy" viewBox={`0 0 ${trendWidth} 120`} preserveAspectRatio="none">
            <rect x="0" y="0" width={trendWidth} height="120" className="overview-background" />
            {loadedMetrics.length > 1 && (
              <polyline
                className="line entropy-line"
                points={buildLinePoints(lineData.entropyValues, trendWidth, 120, 0, 1)}
              />
            )}
          </svg>
        </section>
      </div>
    </div>
  );
});

export default TimeEvolutionOverview;