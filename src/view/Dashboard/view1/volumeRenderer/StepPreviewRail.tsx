import React, { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore } from '@/store/volumeStore';

type StepSummary = {
  min: number;
  max: number;
  mean?: number;
  std?: number;
};

const clampStep = (step: number) => Math.max(0, Math.min(99, step));

const formatNumber = (value?: number) => {
  if (value === undefined || Number.isNaN(value)) return '--';
  if (value === 0) return '0';
  if (Math.abs(value) < 0.001 || Math.abs(value) >= 10000) {
    return value.toExponential(2);
  }
  return value.toFixed(4);
};

const buildSparkline = (data?: Float32Array, binCount = 12) => {
  if (!data || data.length === 0) return new Array(binCount).fill(0);

  const bins = new Array(binCount).fill(0);
  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    const index = Math.min(binCount - 1, Math.max(0, Math.floor(value * binCount)));
    bins[index] += 1;
  }

  const maxCount = Math.max(...bins, 1);
  return bins.map(count => count / maxCount);
};

const PreviewStepCard: React.FC<{ step: number; isCurrent: boolean; isBookmarked: boolean }> = ({
  step,
  isCurrent,
  isBookmarked,
}) => {
  const cachedData = volumeStore.getCachedData(step);
  const summary = volumeStore.getDataSummary(step) as StepSummary | undefined;

  const sparkline = useMemo(() => buildSparkline(cachedData), [cachedData]);

  const handleJump = () => {
    volumeStore.setTimeStep(step);
  };

  const handleToggleBookmark = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    volumeStore.toggleBookmarkedStep(step);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleJump();
    }
  };

  return (
    <div
      className={`preview-step-card${isCurrent ? ' is-current' : ''}${isBookmarked ? ' is-bookmarked' : ''}`}
      role="button"
      tabIndex={0}
      onClick={handleJump}
      onKeyDown={handleKeyDown}
      title={`跳转到时间步 ${step}`}
    >
      <div className="preview-card-header">
        <div className="preview-step-meta">
          <span className="preview-step-chip">Step {step.toString().padStart(2, '0')}</span>
          {isCurrent && <span className="preview-step-tag current">当前</span>}
          {isBookmarked && <span className="preview-step-tag bookmarked">收藏</span>}
        </div>
        <button
          className={`preview-bookmark-btn${isBookmarked ? ' is-on' : ''}`}
          type="button"
          onClick={handleToggleBookmark}
          title={isBookmarked ? '取消收藏' : '收藏此步'}
          aria-label={isBookmarked ? `取消收藏时间步 ${step}` : `收藏时间步 ${step}`}
        >
          {isBookmarked ? '★' : '☆'}
        </button>
      </div>

      <div className="preview-sparkline" aria-hidden="true">
        {cachedData ? (
          sparkline.map((value, index) => (
            <span key={`${step}-${index}`} className="preview-spark-bar" style={{ height: `${Math.max(8, value * 100)}%` }} />
          ))
        ) : (
          <span className="preview-loading">预载中</span>
        )}
      </div>

      <div className="preview-card-footer">
        <div className="preview-stat">
          <span className="preview-stat-label">范围</span>
          <span className="preview-stat-value">
            {summary ? `${formatNumber(summary.min)} → ${formatNumber(summary.max)}` : '--'}
          </span>
        </div>
        <div className="preview-stat">
          <span className="preview-stat-label">均值 / 波动</span>
          <span className="preview-stat-value">
            {summary ? `${formatNumber(summary.mean)} / ${formatNumber(summary.std)}` : '--'}
          </span>
        </div>
      </div>
    </div>
  );
};

const StepPreviewRail: React.FC = observer(() => {
  const currentStep = volumeStore.currentStep;
  const bookmarkedSteps = volumeStore.bookmarkedSteps;

  const previewSteps = useMemo(() => {
    const steps = new Set<number>();

    for (let offset = -3; offset <= 3; offset++) {
      steps.add(clampStep(currentStep + offset));
    }

    for (const step of bookmarkedSteps) {
      steps.add(clampStep(step));
    }

    return Array.from(steps).sort((a, b) => a - b);
  }, [bookmarkedSteps, currentStep]);

  return (
    <div className="step-preview-rail">
      <div className="step-preview-rail-header">
        <div className="step-preview-rail-title">
          <span className="step-preview-rail-name">时间步预览轨</span>
          <span className="step-preview-rail-hint">点击跳转，点星号收藏，优先展示当前步附近与已收藏步</span>
        </div>
        <div className="step-preview-rail-counter">
          {bookmarkedSteps.length} 个收藏步 / {previewSteps.length} 个候选步
        </div>
      </div>

      <div className="step-preview-rail-scroller">
        {previewSteps.map(step => (
          <PreviewStepCard
            key={step}
            step={step}
            isCurrent={step === currentStep}
            isBookmarked={volumeStore.isBookmarkedStep(step)}
          />
        ))}
      </div>
    </div>
  );
});

export default StepPreviewRail;