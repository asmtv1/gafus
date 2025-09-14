declare module "react-detect-offline" {
  import type { ComponentType, ReactNode } from "react";

  export interface DetectorProps {
    onChange?: (online: boolean) => void;
    render?: () => ReactNode;
    children?: ReactNode;
  }

  export const Detector: ComponentType<DetectorProps>;
  export const Online: ComponentType<{ children?: ReactNode }>;
  export const Offline: ComponentType<{ children?: ReactNode }>;
}


