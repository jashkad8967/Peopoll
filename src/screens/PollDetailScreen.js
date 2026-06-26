import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { auth, db } from '../firebase/firebaseApp';
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { useTheme } from '../theme/ThemeContext';
import { castPollVote } from '../utils/pollVoting';
import TrendChart from '../components/TrendChart';

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
    try {
      await castPollVote(pollId, choiceId);
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
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Vote share over time</Text>
        <Text style={[styles.sectionHint, { color: theme.subtext }]}>How each option's share has shifted as people voted.</Text>
        <TrendChart poll={poll} options={voteOptions} variant="full" />
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
  sectionHint: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: -10,
    marginBottom: 16
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
  chartScrollContent: {
    paddingBottom: 8
  },
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12
  },
  rangeButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1
  },
  rangeButtonText: {
    fontSize: 12,
    fontWeight: '700'
  },
  chartBox: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 12
  },
  yGuideRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    flexDirection: 'row',
    alignItems: 'center'
  },
  yGuideLabel: {
    width: 42,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center'
  },
  yGuideLine: {
    flex: 1,
    height: 1,
    opacity: 0.7
  },
  chartLineSegment: {
    position: 'absolute',
    height: 2.5,
    borderRadius: 2,
    transformOrigin: '0 50%'
  },
  chartPointDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 4,
    borderWidth: 1
  },
  xLabelsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 20
  },
  xLabel: {
    position: 'absolute',
    bottom: 2,
    width: 52,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700'
  },
  legendWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    marginRight: 12
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 6
  },
  legendText: {
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
