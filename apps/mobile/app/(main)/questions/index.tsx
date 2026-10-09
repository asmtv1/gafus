import { Redirect, type Href } from "expo-router";

export default function QuestionsRedirect() {
  return <Redirect href={"/(main)/(tabs)/questions" as Href} />;
}
