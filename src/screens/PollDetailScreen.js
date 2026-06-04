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

function formatTimeLabel(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : timestamp;
  return date.toISOString().slice(11, 16);
}

export default function PollDetailScreen({ route }) {
  const { pollId } = route.params;
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
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#1d4ed8" />
      </View>
    );
  }

  if (!poll) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Poll not found</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{poll.title}</Text>
      <Text style={styles.description}>{poll.description || 'No description available.'}</Text>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vote</Text>
        {voteOptions.map((choice) => {
          const selected = choice.id === selectedChoiceId;
          return (
            <TouchableOpacity
              key={choice.id}
              style={[styles.choiceButton, selected && styles.choiceButtonSelected]}
              onPress={() => canVote && handleVote(choice.id)}
              disabled={!canVote}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{choice.label}</Text>
              <Text style={styles.choiceCount}>{choice.count || 0} votes</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trend history</Text>
        {latestTrend.length === 0 ? (
          <Text style={styles.emptySubtitle}>Trend history begins as people vote.</Text>
        ) : (
          latestTrend.map((snapshot) => (
            <View key={snapshot.id} style={styles.trendRow}>
              <Text style={styles.trendLabel}>{snapshot.label}</Text>
              <View style={styles.trendBars}>
                {voteOptions.map((choice) => {
                  const value = snapshot.counts?.[choice.id] || 0;
                  const width = (value / maxTrendValue) * 180;
                  return (
                    <View key={choice.id} style={styles.trendBarRow}>
                      <Text style={styles.trendChoice}>{choice.label}</Text>
                      <View style={[styles.trendBar, { width }]} />
                      <Text style={styles.trendValue}>{value}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Comments</Text>
        <TextInput
          style={styles.commentInput}
          placeholder="Share your opinion"
          value={newComment}
          onChangeText={setNewComment}
          multiline
        />
        <TouchableOpacity style={[styles.button, sendingComment && styles.buttonDisabled]} onPress={handleAddComment} disabled={sendingComment}>
          <Text style={styles.buttonText}>{sendingComment ? 'Posting...' : 'Post comment'}</Text>
        </TouchableOpacity>
        {comments.length === 0 ? (
          <Text style={styles.emptySubtitle}>No comments yet. Be the first to reply.</Text>
        ) : (
          comments.map((comment) => (
            <View key={comment.id} style={styles.commentCard}>
              <Text style={styles.commentText}>{comment.text}</Text>
              <Text style={styles.commentMeta}>{comment.userId || 'Anonymous'}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f9fafb'
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700'
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8
  },
  description: {
    color: '#4b5563',
    marginBottom: 16
  },
  section: {
    marginBottom: 22
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12
  },
  choiceButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  choiceButtonSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#e0e7ff'
  },
  choiceText: {
    fontSize: 16,
    color: '#111827'
  },
  choiceTextSelected: {
    fontWeight: '700'
  },
  choiceCount: {
    color: '#6b7280',
    fontSize: 14
  },
  trendRow: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  trendLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10
  },
  trendBars: {
    gap: 8
  },
  trendBarRow: {
    marginBottom: 10
  },
  trendChoice: {
    fontSize: 14,
    color: '#374151'
  },
  trendBar: {
    height: 10,
    borderRadius: 6,
    backgroundColor: '#2563eb',
    marginVertical: 6
  },
  trendValue: {
    color: '#6b7280',
    fontSize: 12
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
    minHeight: 80,
    textAlignVertical: 'top'
  },
  button: {
    backgroundColor: '#1d4ed8',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center'
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700'
  },
  emptySubtitle: {
    color: '#6b7280'
  },
  commentCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  commentText: {
    fontSize: 15,
    marginBottom: 8,
    color: '#111827'
  },
  commentMeta: {
    fontSize: 12,
    color: '#6b7280'
  }
});
