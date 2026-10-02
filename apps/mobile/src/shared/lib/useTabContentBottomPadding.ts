import { useContext } from "react";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";

/** Позволяет прокрутить последний элемент выше прозрачного меню. */
export function useTabContentBottomPadding() {
  return (useContext(BottomTabBarHeightContext) ?? 0) + 32;
}
