import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ScrollView, Switch, FlatList } from 'react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseApp';
import { useTheme } from '../theme/ThemeContext';

const defaultChoices = ['', '', '', ''];
const categorySuggestions = ['Politics', 'Sports', 'Technology', 'Lifestyle', 'Entertainment', 'Business', 'General'];

export default function CreatePollScreen({ navigation }) {
  const { theme } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [choices, setChoices] = useState(defaultChoices);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleChoiceChange = (index, value) => {
    const next = [...choices];
    next[index] = value;
    setChoices(next);
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

    try {
      setSaving(true);
      const poll = {
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || 'General',
        choices: validChoices,
        totalVotes: 0,
        authorId: user.uid,
        createdAt: serverTimestamp(),
        allowMultiple,
        expiresAt: null
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
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}> 
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

      <TextInput
        style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        placeholder="Category"
        placeholderTextColor={theme.placeholder}
        value={category}
        onChangeText={setCategory}
      />

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={categorySuggestions}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.categoryRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.tag, { backgroundColor: item === category ? theme.accent : theme.surface, borderColor: theme.border }]}
            onPress={() => setCategory(item)}
          >
            <Text style={[styles.tagText, { color: item === category ? theme.card : theme.text }]}>{item}</Text>
          </TouchableOpacity>
        )}
      />

      <Text style={[styles.subTitle, { color: theme.text }]}>Answer options</Text>
      {choices.map((choice, index) => (
        <TextInput
          key={index}
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
          placeholder={`Option ${index + 1}`}
          placeholderTextColor={theme.placeholder}
          value={choice}
          onChangeText={(value) => handleChoiceChange(index, value)}
        />
      ))}

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
    paddingBottom: 40
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
