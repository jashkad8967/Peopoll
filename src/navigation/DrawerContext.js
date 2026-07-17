import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/firebaseApp';
import { navigate } from './navigationRef';

const DrawerContext = createContext({});

// Holds the left-drawer open state and the global category selection used by
// the home feed. Categories are derived from all polls so the drawer can show
// them on any screen.
export function DrawerProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [pollCategories, setPollCategories] = useState([]);

  useEffect(() => {
    // Derive categories from the most recent polls only. Downloading the entire
    // polls collection just to list categories is slow, wastes bandwidth, and
    // can time out once the collection grows — a bounded, ordered query keeps
    // this cheap while still surfacing every actively used category.
    const unsub = onSnapshot(
      query(collection(db, 'polls'), orderBy('createdAt', 'desc'), limit(300)),
      (snap) => {
        const available = new Set();
        snap.docs.forEach((doc) => {
          const label = (doc.data().category || 'General').trim();
          if (label) available.add(label);
        });
        setPollCategories(Array.from(available).sort((a, b) => a.localeCompare(b)));
      },
      () => setPollCategories([])
    );
    return unsub;
  }, []);

  const categories = useMemo(
    () => ['All', 'Trending', ...pollCategories.filter((label) => label !== 'Trending')],
    [pollCategories]
  );

  const value = useMemo(
    () => ({
      isOpen,
      openDrawer: () => setIsOpen(true),
      closeDrawer: () => setIsOpen(false),
      toggleDrawer: () => setIsOpen((current) => !current),
      categories,
      selectedCategory,
      setSelectedCategory,
      // Selecting a category routes to Home and applies the filter.
      selectCategory: (category) => {
        setSelectedCategory(category);
        setIsOpen(false);
        navigate('Home');
      }
    }),
    [isOpen, categories, selectedCategory]
  );

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useDrawer() {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error('useDrawer must be used within a DrawerProvider');
  }
  return context;
}
