import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "react-native-paper";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

/**
 * Layout для нижней навигации (tabs)
 */
export default function TabsLayout() {
  const theme = useTheme();

  const renderIcon = (name: IconName, color: string, size: number) => (
    <MaterialCommunityIcons name={name} size={size} color={color} />
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.outline,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: theme.colors.outlineVariant,
        },
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.onSurface,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Главная",
          tabBarIcon: ({ color, size }) => renderIcon("home", color, size),
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: "Курсы",
          tabBarIcon: ({ color, size }) => renderIcon("book-open-variant", color, size),
        }}
      />
      <Tabs.Screen
        name="achievements"
        options={{
          title: "Достижения",
          tabBarIcon: ({ color, size }) => renderIcon("trophy", color, size),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Профиль",
          tabBarIcon: ({ color, size }) => renderIcon("account", color, size),
        }}
      />
    </Tabs>
  );
}
