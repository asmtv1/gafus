import NetInfo from "@react-native-community/netinfo";
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { deriveNetworkStatus } from "@/shared/lib/network/networkStatus";
import { setNetworkStatus } from "@/shared/stores/networkStatusStore";

interface QueryProviderProps {
  children: ReactNode;
}

/**
 * Синглтон QueryClient — нужен для сброса кэша при смене пользователя вне компонентов
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // Офлайн-aware mutation должны выполниться и записать действие в локальную очередь.
      networkMode: "always",
      retry: false,
    },
  },
});

function useNativeQueryLifecycle(): void {
  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      const status = deriveNetworkStatus(state);

      setNetworkStatus(status);
      onlineManager.setOnline(!status.isOffline);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const syncFocusState = (status: AppStateStatus) => {
      focusManager.setFocused(status === "active");
    };

    syncFocusState(AppState.currentState);
    const subscription = AppState.addEventListener("change", syncFocusState);

    return () => subscription.remove();
  }, []);
}

/**
 * Провайдер для React Query
 */
export function QueryProvider({ children }: QueryProviderProps) {
  useNativeQueryLifecycle();

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
