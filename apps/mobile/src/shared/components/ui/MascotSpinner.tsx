import type { StyleProp, ViewStyle } from "react-native";

import { Loading } from "./Loading";

export interface MascotSpinnerProps {
  style?: StyleProp<ViewStyle>;
}

/** Pagination uses the same standard full-size loading mascot and card. */
export function MascotSpinner({ style }: MascotSpinnerProps) {
  return <Loading variant="inline" message="Загружаем ещё…" style={style} />;
}
