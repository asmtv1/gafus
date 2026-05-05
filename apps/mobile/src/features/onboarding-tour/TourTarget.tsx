import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";

import type { MobileOnboardingTourTargetId } from "./tour-steps";

export interface TourTargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RegisteredTourTarget {
  ref: React.RefObject<View | null>;
}

interface TourTargetsContextValue {
  registerTarget: (id: MobileOnboardingTourTargetId, target: RegisteredTourTarget) => void;
  unregisterTarget: (id: MobileOnboardingTourTargetId, target: RegisteredTourTarget) => void;
  measureTarget: (id: MobileOnboardingTourTargetId) => Promise<TourTargetRect | null>;
}

const TourTargetsContext = createContext<TourTargetsContextValue | null>(null);

export function TourTargetsProvider({ children }: { children: ReactNode }) {
  const targetsRef = useRef(new Map<MobileOnboardingTourTargetId, RegisteredTourTarget>());

  const registerTarget = useCallback(
    (id: MobileOnboardingTourTargetId, target: RegisteredTourTarget) => {
      targetsRef.current.set(id, target);
    },
    [],
  );

  const unregisterTarget = useCallback(
    (id: MobileOnboardingTourTargetId, target: RegisteredTourTarget) => {
      if (targetsRef.current.get(id) === target) {
        targetsRef.current.delete(id);
      }
    },
    [],
  );

  const measureTarget = useCallback(async (id: MobileOnboardingTourTargetId) => {
    const target = targetsRef.current.get(id);
    const node = target?.ref.current;
    if (!node) return null;

    return new Promise<TourTargetRect | null>((resolve) => {
      node.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) {
          resolve(null);
          return;
        }
        resolve({ x, y, width, height });
      });
    });
  }, []);

  return (
    <TourTargetsContext.Provider value={{ registerTarget, unregisterTarget, measureTarget }}>
      {children}
    </TourTargetsContext.Provider>
  );
}

export function useTourTargets() {
  const context = useContext(TourTargetsContext);
  if (!context) {
    throw new Error("useTourTargets must be used inside TourTargetsProvider");
  }
  return context;
}

export function TourTarget({
  id,
  children,
  style,
}: {
  id: MobileOnboardingTourTargetId;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<View>(null);
  const target = useRef<RegisteredTourTarget>({ ref });
  const { registerTarget, unregisterTarget } = useTourTargets();

  useEffect(() => {
    const currentTarget = target.current;
    registerTarget(id, currentTarget);
    return () => unregisterTarget(id, currentTarget);
  }, [id, registerTarget, unregisterTarget]);

  const handleLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      registerTarget(id, target.current);
    },
    [id, registerTarget],
  );

  return (
    <View
      ref={ref}
      collapsable={false}
      pointerEvents="box-none"
      style={style}
      onLayout={handleLayout}
    >
      {children}
    </View>
  );
}
