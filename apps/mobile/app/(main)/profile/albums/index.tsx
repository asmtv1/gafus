import { Redirect, useLocalSearchParams, type Href } from "expo-router";

export default function AlbumsRedirect() {
  const { username } = useLocalSearchParams<{ username?: string | string[] }>();
  return (
    <Redirect
      href={{
        pathname: "/(main)/(tabs)/albums",
        params: username ? { username } : {},
      } as Href}
    />
  );
}
