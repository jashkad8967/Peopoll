import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseApp';
import { auth } from '../firebase/firebaseApp';

const defaultChoices = ['', '', '', ''];

export default function CreatePollScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Trending');
  const [choices, setChoices] = useState(defaultChoices);
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

    const validChoices = choices.filter(choice => choice.trim().length > 0).map((choice, index) => ({ id: `choice-${index + 1}`, label: choice.trim(), count: 0 }));
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
        allowMultiple: false,
        expiresAt: null
      };
      const pollsCollection = collection(db, 'polls');
      await addDoc(pollsCollection, poll);
      navigation.goBack();
    } catch (error) {
      console.error('Failed to create poll', error);
      Alert.alert('Unable to create poll', error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Create a new poll</Text>
      <TextInput
        style={styles.input}
        placeholder="Poll question"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Description (optional)"
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <TextInput
        style={styles.input}
        placeholder="Category (e.g. Politics, Sports)"
        value={category}
        onChangeText={setCategory}
      />
      <Text style={styles.subTitle}>Answer options</Text>
      {choices.map((choice, index) => (
        <TextInput
          key={index}
          style={styles.input}
          placeholder={`Option ${index + 1}`}
          value={choice}
          onChangeText={value => handleChoiceChange(index, value)}
        />
      ))}
      <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={handleCreate} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Creating...' : 'Publish poll'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff'
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16
  },
  subTitle: {
    fontSize: 16,
    marginTop: 12,
    marginBottom: 4,
    fontWeight: '600'
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    fontSize: 16
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top'
  },
  button: {
    backgroundColor: '#1d4ed8',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  }
});
