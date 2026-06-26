import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
  Alert
} from 'react-native';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseApp';
import { onAuthStateChanged } from 'firebase/auth';
import { useTheme } from '../theme/ThemeContext';
import { castPollVote, subscribeTrendSnapshots, PhoneVerificationRequiredError } from '../utils/pollVoting';
import { postComment, toggleCommentLike } from '../utils/comments';
import TrendChart from './TrendChart';
import PhoneVerifyModal from './PhoneVerifyModal';

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function timeAgo(value) {
  const date = toDate(value);
  if (!date) return 'just now';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function colorForName(name, palette) {
  const text = String(name || '?');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

export default function PollModal({ pollId, initialPoll, visible, onClose }) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const isWide = width >= 880;

  const [poll, setPoll] = useState(initialPoll || null);
  const [snapshots, setSnapshots] = useState([]);
  const [comments, setComments] = useState([]);
  const [uid, setUid] = useState(auth.currentUser?.uid || null);
  const [userVote, setUserVote] = useState(null);
  const [votingId, setVotingId] = useState(null);
  const [showVerify, setShowVerify] = useState(false);
  const [pendingChoice, setPendingChoice] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    setPoll(initialPoll || null);
  }, [initialPoll]);

  useEffect(() => onAuthStateChanged(auth, (user) => setUid(user?.uid || null)), []);

  useEffect(() => {
    if (!visible || !pollId) {
      return undefined;
    }

    const unsubPoll = onSnapshot(doc(db, 'polls', pollId), (snap) => {
      if (snap.exists()) setPoll({ id: snap.id, ...snap.data() });
    });

    const unsubSnapshots = subscribeTrendSnapshots(pollId, setSnapshots);

    const commentsQuery = query(collection(db, 'polls', pollId, 'comments'), orderBy('createdAt', 'asc'));
    const unsubComments = onSnapshot(commentsQuery, (snap) => {
      setComments(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    return () => {
      unsubPoll();
      unsubSnapshots();
      unsubComments();
    };
  }, [visible, pollId]);

  useEffect(() => {
    if (!visible || !pollId || !uid) {
      setUserVote(null);
      return undefined;
    }
    return onSnapshot(doc(db, 'polls', pollId, 'votes', uid), (snap) => {
      setUserVote(snap.exists() ? snap.data().choiceId : null);
    });
  }, [visible, pollId, uid]);

  const options = poll?.choices || [];
  const totalVotes = poll?.totalVotes || 0;

  const { topComments, repliesByParent } = useMemo(() => {
    const replies = {};
    const tops = [];
    comments.forEach((comment) => {
      if (comment.parentId) {
        (replies[comment.parentId] = replies[comment.parentId] || []).push(comment);
      } else {
        tops.push(comment);
      }
    });
    return { topComments: tops, repliesByParent: replies };
  }, [comments]);

  const handleVote = async (choiceId) => {
    setVotingId(choiceId);
    try {
      await castPollVote(pollId, choiceId);
    } catch (error) {
      if (error instanceof PhoneVerificationRequiredError || error?.code === 'phone-verification-required') {
        setPendingChoice(choiceId);
        setShowVerify(true);
      } else {
        Alert.alert('Unable to vote', error.message || 'Please try again.');
      }
    } finally {
      setVotingId(null);
    }
  };

  const handleVerified = () => {
    const choiceId = pendingChoice;
    setPendingChoice(null);
    if (choiceId) handleVote(choiceId);
  };

  const handlePost = async (text, parentId, clear) => {
    if (!text.trim()) return;
    setPosting(true);
    try {
      await postComment(pollId, text, parentId);
      clear();
      setReplyTo(null);
    } catch (error) {
      Alert.alert('Unable to comment', error.message || 'Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const handleLike = async (comment) => {
    const liked = (comment.likedBy || []).includes(uid);
    try {
      await toggleCommentLike(pollId, comment.id, liked);
    } catch (error) {
      Alert.alert('Unable to like', error.message || 'Please try again.');
    }
  };

  const renderComment = (comment, isReply = false) => {
    const likes = comment.likedBy || [];
    const liked = uid && likes.includes(uid);
    const avatarColor = colorForName(comment.userName, theme.palette);
    return (
      <View key={comment.id} style={[styles.comment, isReply && { marginLeft: 34, marginTop: 8 }]}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{(comment.userName || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.commentBody}>
          <View style={[styles.commentBubble, { backgroundColor: theme.surfaceMuted }]}>
            <Text style={[styles.commentAuthor, { color: theme.text }]}>{comment.userName || 'Guest'}</Text>
            <Text style={[styles.commentText, { color: theme.text }]}>{comment.text}</Text>
          </View>
          <View style={styles.commentActions}>
            <Text style={[styles.commentMeta, { color: theme.subtext }]}>{timeAgo(comment.createdAt)}</Text>
            <TouchableOpacity onPress={() => handleLike(comment)} style={styles.commentAction}>
              <Text style={[styles.commentActionText, { color: liked ? theme.accentPink : theme.subtext }]}>
                {liked ? '♥' : '♡'} {likes.length > 0 ? likes.length : ''}
              </Text>
            </TouchableOpacity>
            {!isReply && (
              <TouchableOpacity
                onPress={() => {
                  setReplyTo(replyTo === comment.id ? null : comment.id);
                  setReplyText('');
                }}
                style={styles.commentAction}
              >
                <Text style={[styles.commentActionText, { color: theme.accent }]}>Reply</Text>
              </TouchableOpacity>
            )}
          </View>

          {(repliesByParent[comment.id] || []).map((reply) => renderComment(reply, true))}

          {replyTo === comment.id && (
            <View style={styles.replyRow}>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text, flex: 1 }]}
                placeholder={`Reply to ${comment.userName || 'Guest'}`}
                placeholderTextColor={theme.placeholder}
                value={replyText}
                onChangeText={setReplyText}
                onSubmitEditing={() => handlePost(replyText, comment.id, () => setReplyText(''))}
              />
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: theme.accent, opacity: posting ? 0.6 : 1 }]}
                onPress={() => handlePost(replyText, comment.id, () => setReplyText(''))}
                disabled={posting}
              >
                <Text style={styles.sendButtonText}>Reply</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderGraphAndVote = () => (
    <>
      <View style={styles.headerBlock}>
        <View style={[styles.categoryPill, { backgroundColor: theme.accentSoft }]}>
          <Text style={[styles.categoryText, { color: theme.accent }]}>{poll?.category || 'General'}</Text>
        </View>
        <Text style={[styles.pollTitle, { color: theme.text }]}>{poll?.title}</Text>
        {poll?.description ? (
          <Text style={[styles.pollDescription, { color: theme.subtext }]}>{poll.description}</Text>
        ) : null}
      </View>

      <View style={[styles.chartShell, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        {options.length ? (
          <TrendChart poll={poll} options={options} snapshots={snapshots} variant="full" />
        ) : (
          <Text style={{ color: theme.subtext }}>No options to chart yet.</Text>
        )}
      </View>

      <Text style={[styles.blockLabel, { color: theme.text }]}>Cast your vote</Text>
      <View style={styles.voteList}>
        {options.map((choice, index) => {
          const count = choice.count || 0;
          const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
          const selected = userVote === choice.id;
          const barColor = theme.palette[index % theme.palette.length];
          return (
            <TouchableOpacity
              key={choice.id}
              activeOpacity={0.85}
              onPress={() => handleVote(choice.id)}
              disabled={votingId === choice.id}
              style={[styles.voteOption, { borderColor: selected ? barColor : theme.border, backgroundColor: theme.surface }]}
            >
              <View style={[styles.voteFill, { width: `${pct}%`, backgroundColor: barColor, opacity: selected ? 0.22 : 0.12 }]} />
              <View style={styles.voteContent}>
                <Text style={[styles.voteLabel, { color: theme.text }]} numberOfLines={1}>
                  {selected ? '✓ ' : ''}{choice.label}
                </Text>
                <Text style={[styles.votePct, { color: theme.subtext }]}>{pct.toFixed(0)}% · {count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.totalVotes, { color: theme.subtext }]}>{totalVotes.toLocaleString()} total votes</Text>
    </>
  );

  const renderComments = () => (
    <>
      <Text style={[styles.blockLabel, { color: theme.text }]}>Comments · {comments.length}</Text>
      {topComments.length === 0 ? (
        <Text style={[styles.emptyComments, { color: theme.subtext }]}>Be the first to comment.</Text>
      ) : (
        topComments.map((comment) => renderComment(comment))
      )}
    </>
  );

  const composer = (
    <View style={[styles.composer, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
      <TextInput
        style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text, flex: 1 }]}
        placeholder="Add a comment…"
        placeholderTextColor={theme.placeholder}
        value={commentText}
        onChangeText={setCommentText}
        onSubmitEditing={() => handlePost(commentText, null, () => setCommentText(''))}
      />
      <TouchableOpacity
        style={[styles.sendButton, { backgroundColor: theme.accent, opacity: posting ? 0.6 : 1 }]}
        onPress={() => handlePost(commentText, null, () => setCommentText(''))}
        disabled={posting}
      >
        {posting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendButtonText}>Post</Text>}
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              maxWidth: isWide ? 1000 : 560,
              maxHeight: height * 0.9
            }
          ]}
          onPress={(event) => event.stopPropagation?.()}
        >
          <View style={[styles.cardHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.cardHeaderText, { color: theme.text }]} numberOfLines={1}>{poll?.title || 'Poll'}</Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: theme.surfaceMuted }]}>
              <Text style={[styles.closeText, { color: theme.text }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {!poll ? (
            <View style={styles.loading}><ActivityIndicator size="large" color={theme.accent} /></View>
          ) : isWide ? (
            <View style={styles.wideBody}>
              <ScrollView style={styles.leftColumn} contentContainerStyle={styles.columnContent} showsVerticalScrollIndicator={false}>
                {renderGraphAndVote()}
              </ScrollView>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <View style={styles.rightColumn}>
                <ScrollView contentContainerStyle={styles.columnContent} showsVerticalScrollIndicator={false}>
                  {renderComments()}
                </ScrollView>
                {composer}
              </View>
            </View>
          ) : (
            <View style={styles.narrowBody}>
              <ScrollView contentContainerStyle={styles.columnContent} showsVerticalScrollIndicator={false}>
                {renderGraphAndVote()}
                <View style={[styles.divider, { height: 1, width: '100%', marginVertical: 18, backgroundColor: theme.border }]} />
                {renderComments()}
              </ScrollView>
              {composer}
            </View>
          )}
        </Pressable>
      </Pressable>
      <PhoneVerifyModal
        visible={showVerify}
        onClose={() => setShowVerify(false)}
        onVerified={handleVerified}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16
  },
  card: {
    width: '94%',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden'
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1
  },
  cardHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 12
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeText: {
    fontSize: 14,
    fontWeight: '700'
  },
  loading: {
    padding: 60,
    alignItems: 'center'
  },
  wideBody: {
    flexDirection: 'row',
    flex: 1,
    minHeight: 320
  },
  narrowBody: {
    flex: 1
  },
  leftColumn: {
    flex: 1.15
  },
  rightColumn: {
    flex: 1,
    minWidth: 320
  },
  divider: {
    width: 1
  },
  columnContent: {
    padding: 18
  },
  headerBlock: {
    marginBottom: 16
  },
  categoryPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    marginBottom: 10
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2
  },
  pollTitle: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 27,
    marginBottom: 6
  },
  pollDescription: {
    fontSize: 14,
    lineHeight: 20
  },
  chartShell: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20
  },
  blockLabel: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12
  },
  voteList: {
    gap: 10
  },
  voteOption: {
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: 'hidden',
    position: 'relative'
  },
  voteFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0
  },
  voteContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  voteLabel: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    marginRight: 10
  },
  votePct: {
    fontSize: 13,
    fontWeight: '700'
  },
  totalVotes: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10
  },
  emptyComments: {
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 12
  },
  comment: {
    flexDirection: 'row',
    marginBottom: 14
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800'
  },
  commentBody: {
    flex: 1
  },
  commentBubble: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2
  },
  commentText: {
    fontSize: 14,
    lineHeight: 19
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 6,
    paddingTop: 5
  },
  commentAction: {
    paddingVertical: 2
  },
  commentMeta: {
    fontSize: 12,
    fontWeight: '600'
  },
  commentActionText: {
    fontSize: 12,
    fontWeight: '700'
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderTopWidth: 1
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14
  },
  sendButton: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  }
});
