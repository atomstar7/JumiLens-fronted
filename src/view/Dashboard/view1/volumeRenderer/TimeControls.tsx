import React from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore } from '@/store/volumeStore';

const TimeControls: React.FC = observer(() => {
  const { currentStep } = volumeStore;

  return (
    <div className="time-controls">
      <input
        className="time-slider"
        type="range"
        min={0}
        max={99}
        value={currentStep}
        onChange={(e) => volumeStore.setTimeStep(Number(e.target.value))}
      />

      <span className="step-label">
        Step {currentStep} / 99
      </span>
    </div>
  );
});

export default TimeControls;
