import { createNavigationContainerRef } from '@react-navigation/native';

// Shared navigation ref so non-screen components (e.g. the global drawer) can
// trigger navigation without being passed the navigation prop.
export const navigationRef = createNavigationContainerRef();

export function navigate(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}
