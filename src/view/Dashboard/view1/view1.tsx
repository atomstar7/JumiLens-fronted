import React from 'react';
import { TimeEvolutionOverview } from '@/components';
import VolumeRenderer from './volumeRenderer';
import './index.less';

const DATA_DIMENSIONS = { x: 128, y: 128, z: 128 };

const View1 = () => {
    return (
        <div className="view1-root">
            <div className="view1-overview">
                <TimeEvolutionOverview totalSteps={100} dimensions={DATA_DIMENSIONS} />
            </div>
            <div className="view1-renderer">
                <VolumeRenderer />
            </div>
        </div>
    );
};

export default View1;
