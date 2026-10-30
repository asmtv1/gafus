import { Redirect, type Href } from "expo-router";

export default function ChatsRedirect() {
  return <Redirect href={"/(main)/(tabs)/messages" as Href} />;
}
