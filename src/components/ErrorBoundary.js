import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

// Catches render/runtime errors anywhere below it so a single component failure
// shows a recoverable fallback instead of a blank white screen in production.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Kept lightweight: log for diagnostics. Wire to a real reporting service
    // (Sentry/Crashlytics) here when one is added.
    console.error('Unhandled UI error', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            The app hit an unexpected error. You can try again — your data is safe.
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#fafafa'
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#262626',
    marginBottom: 10,
    textAlign: 'center'
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: '#8e8e8e',
    textAlign: 'center',
    marginBottom: 22,
    maxWidth: 360
  },
  button: {
    backgroundColor: '#0095f6',
    paddingVertical: 13,
    paddingHorizontal: 26,
    borderRadius: 12
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15
  }
});
