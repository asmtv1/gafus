"use client";

import { useEffect } from "react";
import { Detector } from "react-detect-offline";
import { useOfflineStore } from "@shared/stores/offlineStore";

export default function NetworkDetector() {
  const setOnlineStatus = useOfflineStore((s) => s.setOnlineStatus);

  useEffect(() => {
    // No-op on mount; state will be driven by Detector
  }, []);

  return (
    <Detector
      onChange={(isOnline: boolean) => {
        setOnlineStatus(isOnline);
      }}
      render={() => null}
    />
  );
}


