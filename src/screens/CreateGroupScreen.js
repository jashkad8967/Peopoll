import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { createGroup } from '../utils/groups';

export default function CreateGroupScreen({ navigation }) {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please give your group a name.');
      return;
    }
    try {
      setSaving(true);
      const groupId = await createGroup({ name, topic, description });
      navigation.replace('GroupDetail', { groupId, groupName: name.trim() });
    } catch (error) {
      Alert.alert('Unable to create group', error.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.heading, { color: theme.text }]}>Create a group</Text>
      <Text style={[styles.subHeading, { color: theme.subtext }]}>
        You become the owner. Posts from members are held for admin approval so the group stays on-topic.
      </Text>

      <Text style={[styles.label, { color: theme.text }]}>Group name</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        placeholder="e.g. Climate Policy Debate"
        placeholderTextColor={theme.placeholder}
        value={name}
        onChangeText={setName}
      />

      <Text style={[styles.label, { color: theme.text }]}>Topic</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        placeholder="e.g. Environment"
        placeholderTextColor={theme.placeholder}
        value={topic}
        onChangeText={setTopic}
      />

      <Text style={[styles.label, { color: theme.text }]}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        placeholder="What is this group about?"
        placeholderTextColor={theme.placeholder}
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <TouchableOpacity style={[styles.button, { backgroundColor: theme.accent }]} onPress={handleCreate} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Creating…' : 'Create group'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center'
  },
  heading: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 6
  },
  subHeading: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    fontSize: 15,
    fontWeight: '500'
  },
  multiline: {
    minHeight: 110,
    textAlignVertical: 'top'
  },
  button: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800'
  }
});
