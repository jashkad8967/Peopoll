import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ScrollView, Switch, FlatList } from 'react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseApp';
import { useTheme } from '../theme/ThemeContext';
import { displayNameFor } from '../utils/account';
import { upsertUserProfile } from '../utils/social';
import { subscribeGroups } from '../utils/groups';

const defaultChoices = ['', ''];
const categorySuggestions = ['Politics', 'Sports', 'Technology', 'Lifestyle', 'Entertainment', 'Business', 'News'];
const OTHER = 'Other';

export default function CreatePollScreen({ navigation, route }) {
  const { theme } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('News');
  const [isOther, setIsOther] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [choices, setChoices] = useState(defaultChoices);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(route?.params?.groupId || null);

  useEffect(() => subscribeGroups(setGroups), []);

  const selectedGroup = useMemo(() => {
    if (!selectedGroupId) return null;
    const found = groups.find((g) => g.id === selectedGroupId);
    if (found) return found;
    if (route?.params?.groupId === selectedGroupId && route?.params?.groupName) {
      return { id: selectedGroupId, name: route.params.groupName };
    }
    return null;
  }, [selectedGroupId, groups, route?.params?.groupId, route?.params?.groupName]);

  const resolvedCategory = isOther ? customCategory.trim() : category;

  const handleChoiceChange = (index, value) => {
    const next = [...choices];
    next[index] = value;
    setChoices(next);
  };

  const handleAddChoice = () => {
    setChoices((current) => [...current, '']);
  };

  const handleRemoveChoice = (index) => {
    setChoices((current) => {
      if (current.length <= 2) {
        return current;
      }
      return current.filter((_, position) => position !== index);
    });
  };

  const handleCreate = async () => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert('Authentication required', 'Please sign in to create polls.');
      return;
    }

    const validChoices = choices
      .filter((choice) => choice.trim().length > 0)
      .map((choice, index) => ({ id: `choice-${index + 1}`, label: choice.trim(), count: 0 }));

    if (!title.trim() || validChoices.length < 2) {
      Alert.alert('Invalid poll', 'Please provide a title and at least two answer options.');
      return;
    }

    if (isOther && !customCategory.trim()) {
      Alert.alert('Category required', 'Please type a custom category for "Other".');
      return;
    }

    try {
      setSaving(true);
      await upsertUserProfile(user);
      const poll = {
        title: title.trim(),
        description: description.trim(),
        category: resolvedCategory || 'News',
        choices: validChoices,
        totalVotes: 0,
        authorId: user.uid,
        authorName: displayNameFor(user),
        createdAt: serverTimestamp(),
        allowMultiple,
        expiresAt: null,
        groupId: selectedGroup ? selectedGroup.id : null,
        groupName: selectedGroup ? selectedGroup.name || null : null
      };
      const pollsCollection = collection(db, 'polls');
      await addDoc(pollsCollection, poll);
      navigation.goBack();
    } catch (error) {
      console.error('Failed to create poll', error);
      Alert.alert('Unable to create poll', error.message || 'Please try again later.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.heading, { color: theme.text }]}>Create a poll</Text>
      <Text style={[styles.subHeading, { color: theme.subtext }]}>Build a thoughtful question and select the right category for your audience.</Text>

      <TextInput
        style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        placeholder="Poll question"
        placeholderTextColor={theme.placeholder}
        value={title}
        onChangeText={setTitle}
      />

      <TextInput
        style={[styles.input, styles.multiline, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        placeholder="Description (optional)"
        placeholderTextColor={theme.placeholder}
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Text style={[styles.subTitle, { color: theme.text }]}>Category</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[...categorySuggestions, OTHER]}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.categoryRow}
        renderItem={({ item }) => {
          const selected = item === OTHER ? isOther : !isOther && item === category;
          return (
            <TouchableOpacity
              style={[styles.tag, { backgroundColor: selected ? theme.accent : theme.surface, borderColor: theme.border }]}
              onPress={() => {
                if (item === OTHER) {
                  setIsOther(true);
                } else {
                  setIsOther(false);
                  setCategory(item);
                }
              }}
            >
              <Text style={[styles.tagText, { color: selected ? theme.card : theme.text }]}>{item}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {isOther && (
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
          placeholder="Enter a custom category"
          placeholderTextColor={theme.placeholder}
          value={customCategory}
          onChangeText={setCustomCategory}
          autoFocus
        />
      )}

      <Text style={[styles.subTitle, { color: theme.text }]}>Post to group (optional)</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[{ id: null, name: 'Public' }, ...groups]}
        keyExtractor={(item) => item.id || 'public'}
        contentContainerStyle={styles.categoryRow}
        renderItem={({ item }) => {
          const selected = (item.id || null) === selectedGroupId;
          return (
            <TouchableOpacity
              style={[styles.tag, { backgroundColor: selected ? theme.accent : theme.surface, borderColor: theme.border }]}
              onPress={() => setSelectedGroupId(item.id || null)}
            >
              <Text style={[styles.tagText, { color: selected ? theme.card : theme.text }]} numberOfLines={1}>
                {item.id ? item.name || 'Group' : 'Public'}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      <Text style={[styles.subTitle, { color: theme.text }]}>Answer options</Text>
      {choices.map((choice, index) => (
        <View key={index} style={styles.optionRow}>
          <TextInput
            style={[styles.optionInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
            placeholder={`Option ${index + 1}`}
            placeholderTextColor={theme.placeholder}
            value={choice}
            onChangeText={(value) => handleChoiceChange(index, value)}
          />
          <TouchableOpacity
            style={[styles.removeOptionButton, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]}
            onPress={() => handleRemoveChoice(index)}
            disabled={choices.length <= 2}
          >
            <Text style={[styles.removeOptionText, { color: choices.length <= 2 ? theme.placeholder : theme.danger }]}>−</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={[styles.addOptionButton, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]} onPress={handleAddChoice}>
        <Text style={[styles.addOptionText, { color: theme.accent }]}>+ Add option</Text>
      </TouchableOpacity>

      <View style={[styles.switchRow, { borderColor: theme.border }]}> 
        <View>
          <Text style={[styles.switchLabel, { color: theme.text }]}>Allow multiple answers</Text>
          <Text style={[styles.switchDescription, { color: theme.subtext }]}>Voters can choose more than one option in this poll.</Text>
        </View>
        <Switch value={allowMultiple} onValueChange={setAllowMultiple} trackColor={{ false: '#9ca3af', true: theme.accent }} thumbColor={allowMultiple ? '#fff' : '#fff'} />
      </View>

      <TouchableOpacity style={[styles.button, { backgroundColor: theme.accent }]} onPress={handleCreate} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Publishing…' : 'Publish poll'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center'
  },
  heading: {
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 6,
    letterSpacing: -0.5
  },
  subHeading: {
    fontSize: 16,
    marginBottom: 24,
    lineHeight: 24
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    fontSize: 16,
    fontWeight: '500',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  multiline: {
    minHeight: 120,
    textAlignVertical: 'top'
  },
  subTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 14,
    letterSpacing: 0.3
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10
  },
  optionInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    fontWeight: '500',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  removeOptionButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  removeOptionText: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28
  },
  addOptionButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8
  },
  addOptionText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2
  },
  categoryRow: {
    marginBottom: 20
  },
  tag: {
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginRight: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  tagText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  switchRow: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    marginVertical: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  switchDescription: {
    fontSize: 14,
    marginTop: 4,
    fontWeight: '500'
  },
  button: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3
  }
});
