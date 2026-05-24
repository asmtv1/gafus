import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import {
  Platform,
  StatusBar,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type TourTargetId = string;

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
  registerTarget: (id: TourTargetId, target: RegisteredTourTarget) => void;
  unregisterTarget: (id: TourTargetId, target: RegisteredTourTarget) => void;
  measureTarget: (id: TourTargetId) => Promise<TourTargetRect | null>;
}

const TourTargetsContext = createContext<TourTargetsContextValue | null>(null);

export function TourTargetsProvider({ children }: { children: ReactNode }) {
  const targetsRef = useRef(new Map<TourTargetId, RegisteredTourTarget>());

  const registerTarget = useCallback((id: TourTargetId, target: RegisteredTourTarget) => {
    targetsRef.current.set(id, target);
  }, []);

  const unregisterTarget = useCallback((id: TourTargetId, target: RegisteredTourTarget) => {
    if (targetsRef.current.get(id) === target) {
      targetsRef.current.delete(id);
    }
  }, []);

  const measureTarget = useCallback(async (id: TourTargetId) => {
    const target = targetsRef.current.get(id);
    const node = target?.ref.current;
    if (!node) return null;

    return new Promise<TourTargetRect | null>((resolve) => {
      node.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) {
          resolve(null);
          return;
        }
        const androidStatusBarOffset = Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0;
        resolve({ x, y: y + androidStatusBarOffset, width, height });
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
  id: TourTargetId;
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
