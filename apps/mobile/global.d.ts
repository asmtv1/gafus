/**
 * Модули без типов и ассеты для tsc (Expo / Metro).
 */
declare module "*.gif" {
  import type { ImageRequireSource } from "react-native";
  const value: ImageRequireSource;
  export default value;
}

declare module "*.png" {
  import type { ImageRequireSource } from "react-native";
  const value: ImageRequireSource;
  export default value;
}

declare module "petrovich" {
  // Пакет без @types; в core используется с явным приведением типа
  const petrovich: unknown;
  export default petrovich;
}
