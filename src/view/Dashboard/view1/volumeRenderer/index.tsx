import React, { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { VolumeScene } from './volumeScene';
import { volumeStore } from '@/store/volumeStore';
import { loadTimeStep } from './loadData';
import TimeControls from './TimeControls';
import TransferFunctionEditor from './TransferFunctionEditor';
import './index.less';

const VolumeRenderer: React.FC = observer(() => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<VolumeScene | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const vs = new VolumeScene(containerRef.current);
    sceneRef.current = vs;

    const cached = volumeStore.getCachedData(0);
    if (cached) {
      vs.loadVolumeData(cached);
    } else {
      loadTimeStep(0).then(({ normalized, min, max, mean, std }) => {
        volumeStore.cacheData(0, normalized, min, max, mean, std);
        vs.loadVolumeData(normalized);
      });
    }

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        vs.resize(width, height);
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      vs.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const vs = sceneRef.current;
    if (!vs) return;

    const step = volumeStore.currentStep;
    const cached = volumeStore.getCachedData(step);
    if (cached) {
      vs.loadVolumeData(cached);
    } else {
      volumeStore.isLoading = true;
      loadTimeStep(step).then(({ normalized, min, max, mean, std }) => {
        volumeStore.cacheData(step, normalized, min, max, mean, std);
        volumeStore.isLoading = false;
        vs.loadVolumeData(normalized);
      });
    }

    for (let d = 1; d <= 3; d++) {
      for (const offset of [d, -d]) {
        const preloadStep = step + offset;
        if (preloadStep < 0 || preloadStep > 99) continue;
        if (volumeStore.getCachedData(preloadStep)) continue;
        loadTimeStep(preloadStep).then(({ normalized, min, max, mean, std }) => {
          volumeStore.cacheData(preloadStep, normalized, min, max, mean, std);
        });
      }
    }
  }, [volumeStore.currentStep]);

  useEffect(() => {
    for (const bookmarkedStep of volumeStore.bookmarkedSteps) {
      if (volumeStore.getCachedData(bookmarkedStep)) continue;
      loadTimeStep(bookmarkedStep).then(({ normalized, min, max, mean, std }) => {
        volumeStore.cacheData(bookmarkedStep, normalized, min, max, mean, std);
      });
    }
  }, [volumeStore.bookmarkedSteps]);

  useEffect(() => {
    sceneRef.current?.buildTFTexture(volumeStore.transferFunction);
  }, [volumeStore.transferFunction]);

  useEffect(() => {
    sceneRef.current?.updateStepSize(volumeStore.stepSize);
  }, [volumeStore.stepSize]);

  return (
    <div className="volume-renderer-root" ref={containerRef}>
      <TimeControls />
      <TransferFunctionEditor />
      {volumeStore.isLoading && (
        <div className="volume-loading">
          <span>Loading step {volumeStore.currentStep}...</span>
        </div>
      )}
    </div>
  );
});

export default VolumeRenderer;
