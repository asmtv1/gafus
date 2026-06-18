export const Platform = {
  OS: "ios",
  select<T>(options: Partial<Record<"ios" | "android" | "default", T>>): T | undefined {
    return options.ios ?? options.default;
  },
};
