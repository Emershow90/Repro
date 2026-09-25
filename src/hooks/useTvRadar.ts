import { useState, useEffect } from 'react';
import { subscribeToTelemetry, LiveTelemetrySnapshot, TelemetryPayload } from '../services/telemetryService';

export const useTvRadar = () => {
  const [snapshot, setSnapshot] = useState<LiveTelemetrySnapshot | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const sub = subscribeToTelemetry((data: LiveTelemetrySnapshot) => {
      setSnapshot(data);
      setIsConnected(true);
    });

    return () => {
      sub.unsubscribe();
    };
  }, []);

  return { snapshot, telemetry: snapshot?.activeReapro ?? null, isConnected };
};
