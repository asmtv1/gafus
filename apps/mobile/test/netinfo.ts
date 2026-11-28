// No native connectivity events in the Node runner. Suites can mock this boundary.
export default {
  addEventListener(_listener: (state: import("@react-native-community/netinfo").NetInfoState) => void) {
    return () => {};
  },
};
