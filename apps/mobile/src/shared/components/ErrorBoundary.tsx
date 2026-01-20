import { Component, type ReactNode } from "react";
import { View, StyleSheet } from "react-native";
import { Text, Button } from "react-native-paper";
import { COLORS, SPACING } from "@/constants";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary для отлова ошибок рендеринга
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
    // Здесь можно отправить ошибку в систему мониторинга
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <Text variant="headlineSmall" style={styles.title}>
            Что-то пошло не так
          </Text>
          <Text style={styles.message}>
            Произошла ошибка при загрузке страницы.
          </Text>
          {__DEV__ && this.state.error && (
            <Text style={styles.errorText}>
              {this.state.error.message}
            </Text>
          )}
          <Button mode="contained" onPress={this.handleRetry} style={styles.button}>
            Попробовать снова
          </Button>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
    backgroundColor: COLORS.background,
  },
  title: {
    marginBottom: SPACING.md,
    color: COLORS.error,
  },
  message: {
    textAlign: "center",
    marginBottom: SPACING.lg,
    color: COLORS.textSecondary,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.error,
    marginBottom: SPACING.lg,
    fontFamily: "monospace",
  },
  button: {
    marginTop: SPACING.md,
  },
});
