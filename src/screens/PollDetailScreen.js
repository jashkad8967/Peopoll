import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { auth, db } from '../firebase/firebaseApp';
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  runTransaction,
  Timestamp,
  increment
} from 'firebase/firestore';
import { useTheme } from '../theme/ThemeContext';

function formatTimeLabel(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : timestamp;
  return date.toISOString().slice(11, 16);
}

function formatDateLabel(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = timestamp.toDate ? timestamp.toDate() : timestamp;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PollDetailScreen({ route }) {
  const { pollId } = route.params;
  const { theme } = useTheme();
  const [poll, setPoll] = useState(null);
  const [userVote, setUserVote] = useState(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [trendSnapshots, setTrendSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingVote, setSavingVote] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  useEffect(() => {
    const pollRef = doc(db, 'polls', pollId);
    let voteRef = null;
    const commentsQuery = query(collection(pollRef, 'comments'), orderBy('createdAt', 'desc'));
    const snapshotsQuery = query(collection(pollRef, 'trendSnapshots'), orderBy('timestamp', 'asc'));

    const unsubPoll = onSnapshot(pollRef, (snapshot) => {
      if (snapshot.exists()) {
        setPoll({ id: snapshot.id, ...snapshot.data() });
      }
      setLoading(false);
    });

    let unsubVote = null;
    if (auth.currentUser) {
      voteRef = doc(db, 'polls', pollId, 'votes', auth.currentUser.uid);
      unsubVote = onSnapshot(voteRef, (snapshot) => {
        if (snapshot.exists()) {
          const voteData = snapshot.data();
          setUserVote(voteData.choiceId);
          setSelectedChoiceId(voteData.choiceId);
        }
      });
    }

    const unsubComments = onSnapshot(commentsQuery, (snapshot) => {
      setComments(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    const unsubSnapshots = onSnapshot(snapshotsQuery, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setTrendSnapshots(items);
    });

    return () => {
      unsubPoll();
      if (unsubVote) unsubVote();
      unsubComments();
      unsubSnapshots();
    };
  }, [pollId]);

  const voteOptions = poll?.choices || [];
  const canVote = !savingVote && !!poll;

  const handleVote = async (choiceId) => {
    if (!auth.currentUser) {
      Alert.alert('Sign in required', 'Please sign in to vote.');
      return;
    }

    setSelectedChoiceId(choiceId);
    if (userVote === choiceId) {
      return;
    }

    setSavingVote(true);
    const pollRef = doc(db, 'polls', pollId);
    const voteRef = doc(db, 'polls', pollId, 'votes', auth.currentUser.uid);
    const bucketId = new Date().toISOString().slice(0, 13).replace(/:/g, '-');
    const snapshotRef = doc(db, 'polls', pollId, 'trendSnapshots', bucketId);

    try {
      await runTransaction(db, async (tx) => {
        const pollDoc = await tx.get(pollRef);
        if (!pollDoc.exists()) {
          throw new Error('Poll no longer exists');
        }

        const voteDoc = await tx.get(voteRef);
        const previousChoiceId = voteDoc.exists() ? voteDoc.data().choiceId : null;
        const currentPoll = pollDoc.data();
        const updatedChoices = (currentPoll.choices || []).map((choice) => {
          if (choice.id === choiceId) {
            return { ...choice, count: (choice.count || 0) + 1 };
          }
          if (choice.id === previousChoiceId) {
            return { ...choice, count: Math.max(0, (choice.count || 0) - 1) };
          }
          return choice;
        });

        const totalVotes = currentPoll.totalVotes || 0;
        const updatedTotalVotes = previousChoiceId ? totalVotes : totalVotes + 1;

        tx.update(pollRef, {
          choices: updatedChoices,
          totalVotes: updatedTotalVotes
        });

        tx.set(voteRef, {
          userId: auth.currentUser.uid,
          choiceId,
          votedAt: Timestamp.now()
        }, { merge: true });

        const snapshotUpdate = {
          timestamp: Timestamp.now(),
          totalVotes: increment(previousChoiceId ? 0 : 1),
          [`counts.${choiceId}`]: increment(1)
        };
        if (previousChoiceId) {
          snapshotUpdate[`counts.${previousChoiceId}`] = increment(-1);
        }

        tx.set(snapshotRef, snapshotUpdate, { merge: true });
      });
    } catch (error) {
      console.error('Vote transaction failed', error);
      Alert.alert('Unable to cast vote', error.message || 'Please try again later.');
    } finally {
      setSavingVote(false);
    }
  };

  const handleAddComment = async () => {
    if (!auth.currentUser) {
      Alert.alert('Sign in required', 'Please sign in before commenting.');
      return;
    }
    if (!newComment.trim()) {
      return;
    }

    setSendingComment(true);
    try {
      await addDoc(collection(db, 'polls', pollId, 'comments'), {
        userId: auth.currentUser.uid,
        text: newComment.trim(),
        createdAt: serverTimestamp()
      });
      setNewComment('');
    } catch (error) {
      console.error('Comment failed', error);
      Alert.alert('Unable to post comment', error.message || 'Please try again.');
    } finally {
      setSendingComment(false);
    }
  };

  const latestTrend = useMemo(() => {
    if (!trendSnapshots.length) {
      return [];
    }

    return trendSnapshots.map((snapshot) => {
      const counts = snapshot.counts || {};
      return {
        id: snapshot.id,
        label: formatTimeLabel(snapshot.timestamp),
        counts,
        totalVotes: snapshot.totalVotes || 0
      };
    });
  }, [trendSnapshots]);

  const maxTrendValue = Math.max(1, ...latestTrend.flatMap((item) => Object.values(item.counts || {})));

  if (loading) {
    return (
      <View style={[styles.loaderContainer, { backgroundColor: theme.background }]}> 
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!poll) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}> 
        <Text style={[styles.emptyTitle, { color: theme.text }]}>Poll not found</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}> 
      <View style={[styles.metaBox, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        <Text style={[styles.category, { color: theme.accent }]}>{poll.category || 'General'}</Text>
        <Text style={[styles.metaSub, { color: theme.subtext }]}>{formatDateLabel(poll.createdAt)} • {poll.allowMultiple ? 'Multiple answers allowed' : 'Single answer'}</Text>
      </View>
      <Text style={[styles.title, { color: theme.text }]}>{poll.title}</Text>
      <Text style={[styles.description, { color: theme.subtext }]}>{poll.description || 'No description available.'}</Text>

      <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Vote</Text>
        {voteOptions.map((choice) => {
          const selected = choice.id === selectedChoiceId;
          const progress = (choice.count || 0) / Math.max(1, poll.totalVotes || 1);
          return (
            <TouchableOpacity
              key={choice.id}
              style={[styles.choiceButton, { backgroundColor: selected ? theme.accentSoft : theme.background, borderColor: selected ? theme.accent : theme.border }]}
              onPress={() => canVote && handleVote(choice.id)}
              disabled={!canVote}
            >
              <View style={styles.choiceTextGroup}>
                <Text style={[styles.choiceText, { color: theme.text }]}>{choice.label}</Text>
                <View style={[styles.progressBar, { backgroundColor: theme.border }]}> 
                  <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%`, backgroundColor: theme.accent }]} />
                </View>
              </View>
              <Text style={[styles.choiceCount, { color: theme.subtext }]}>{choice.count || 0}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Trend history</Text>
        {latestTrend.length === 0 ? (
          <Text style={[styles.emptySubtitle, { color: theme.subtext }]}>Trend history begins as people vote.</Text>
        ) : (
          latestTrend.map((snapshot) => (
            <View key={snapshot.id} style={[styles.trendRow, { backgroundColor: theme.background, borderColor: theme.border }]}> 
              <Text style={[styles.trendLabel, { color: theme.text }]}>{snapshot.label}</Text>
              <View style={styles.trendBars}>
                {voteOptions.map((choice) => {
                  const value = snapshot.counts?.[choice.id] || 0;
                  const width = (value / maxTrendValue) * 220;
                  return (
                    <View key={choice.id} style={styles.trendBarRow}>
                      <Text style={[styles.trendChoice, { color: theme.subtext }]}>{choice.label}</Text>
                      <View style={[styles.trendBar, { backgroundColor: theme.border }]}> 
                        <View style={[styles.trendFill, { width, backgroundColor: theme.accent }]} />
                      </View>
                      <Text style={[styles.trendValue, { color: theme.subtext }]}>{value}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </View>

      <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Comments</Text>
        <TextInput
          style={[styles.commentInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
          placeholder="Share your opinion"
          placeholderTextColor={theme.placeholder}
          value={newComment}
          onChangeText={setNewComment}
          multiline
        />
        <TouchableOpacity style={[styles.button, { backgroundColor: theme.accent }, sendingComment && styles.buttonDisabled]} onPress={handleAddComment} disabled={sendingComment}>
          <Text style={[styles.buttonText, { color: theme.card }]}>{sendingComment ? 'Posting...' : 'Post comment'}</Text>
        </TouchableOpacity>
        {comments.length === 0 ? (
          <Text style={[styles.emptySubtitle, { color: theme.subtext }]}>No comments yet. Be the first to reply.</Text>
        ) : (
          comments.map((comment) => (
            <View key={comment.id} style={[styles.commentCard, { backgroundColor: theme.background, borderColor: theme.border }]}> 
              <Text style={[styles.commentText, { color: theme.text }]}>{comment.text}</Text>
              <Text style={[styles.commentMeta, { color: theme.subtext }]}>{comment.userId || 'Anonymous'}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 32
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  metaBox: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  category: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.3
  },
  metaSub: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500'
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
    letterSpacing: -0.5
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 20,
    fontWeight: '500'
  },
  section: {
    marginBottom: 24,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 18,
    letterSpacing: 0.3
  },
  choiceButton: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  choiceTextGroup: {
    flex: 1,
    marginRight: 14
  },
  choiceText: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
    letterSpacing: 0.2
  },
  progressBar: {
    height: 10,
    borderRadius: 8,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%'
  },
  choiceCount: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  trendRow: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  trendLabel: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 12,
    letterSpacing: 0.3
  },
  trendBars: {
    marginBottom: 4
  },
  trendBarRow: {
    marginBottom: 14
  },
  trendChoice: {
    fontSize: 14,
    marginBottom: 6,
    fontWeight: '600'
  },
  trendBar: {
    borderRadius: 10,
    overflow: 'hidden',
    height: 12,
    marginBottom: 6
  },
  trendFill: {
    height: '100%'
  },
  trendValue: {
    fontSize: 12,
    fontWeight: '700'
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 14,
    fontSize: 15,
    fontWeight: '500',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  button: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  emptySubtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500'
  },
  commentCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  commentText: {
    fontSize: 15,
    marginBottom: 8,
    fontWeight: '500',
    lineHeight: 22
  },
  commentMeta: {
    fontSize: 13,
    fontWeight: '600'
  }
});
