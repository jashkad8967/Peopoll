import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseApp';
import { onAuthStateChanged } from 'firebase/auth';
import { useTheme } from '../theme/ThemeContext';
import { castPollVote, PhoneVerificationRequiredError } from '../utils/pollVoting';
import PhoneVerifyModal from './PhoneVerifyModal';

// Mirrors the vote math in castPollVote so the UI can update the instant a
// choice is tapped, before the Firestore transaction resolves. The live
// onSnapshot listener reconciles any drift with the authoritative counts.
function applyOptimisticVote(poll, previousChoiceId, choiceId) {
  if (!poll || previousChoiceId === choiceId) return poll;
  const choices = (poll.choices || []).map((choice) => {
    if (choice.id === choiceId) return { ...choice, count: (choice.count || 0) + 1 };
    if (choice.id === previousChoiceId) return { ...choice, count: Math.max(0, (choice.count || 0) - 1) };
    return choice;
  });
  const totalVotes = (poll.totalVotes || 0) + (previousChoiceId ? 0 : 1);
  return { ...poll, choices, totalVotes };
}

// Compact, self-contained voting control for a single poll. Subscribes to the
// live poll doc and the current user's vote so it can be dropped anywhere
// (settings, profile, right-rail rankings) and stay in sync.
export default function QuickVote({ poll, compact = false }) {
  const { theme } = useTheme();
  const [livePoll, setLivePoll] = useState(poll);
  const [uid, setUid] = useState(auth.currentUser?.uid || null);
  const [userVote, setUserVote] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showVerify, setShowVerify] = useState(false);
  const [pendingChoice, setPendingChoice] = useState(null);

  useEffect(() => setLivePoll(poll), [poll]);
  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || null)), []);

  const pollId = poll?.id;

  useEffect(() => {
    if (!pollId) return undefined;
    return onSnapshot(doc(db, 'polls', pollId), (snap) => {
      if (snap.exists()) setLivePoll({ id: snap.id, ...snap.data() });
    });
  }, [pollId]);

  useEffect(() => {
    if (!pollId || !uid) {
      setUserVote(null);
      return undefined;
    }
    return onSnapshot(doc(db, 'polls', pollId, 'votes', uid), (snap) => {
      setUserVote(snap.exists() ? snap.data().choiceId : null);
    });
  }, [pollId, uid]);

  const options = livePoll?.choices || [];
  const totalVotes = livePoll?.totalVotes || 0;

  const handleVote = async (choiceId) => {
    if (userVote === choiceId) return;
    setBusyId(choiceId);

    // Optimistic update: reflect the vote immediately so the tap feels instant
    // instead of waiting on the Firestore transaction round-trip.
    const prevPoll = livePoll;
    const prevVote = userVote;
    setLivePoll((current) => applyOptimisticVote(current, prevVote, choiceId));
    setUserVote(choiceId);

    try {
      await castPollVote(pollId, choiceId);
    } catch (error) {
      // Roll back the optimistic change if the write fails.
      setLivePoll(prevPoll);
      setUserVote(prevVote);
      if (error instanceof PhoneVerificationRequiredError || error?.code === 'phone-verification-required') {
        setPendingChoice(choiceId);
        setShowVerify(true);
      } else {
        // Surfaced by parent screens elsewhere; keep quick vote quiet on failure.
        console.warn('Quick vote failed', error?.message || error);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleVerified = () => {
    const choiceId = pendingChoice;
    setPendingChoice(null);
    if (choiceId) handleVote(choiceId);
  };

  if (!options.length) {
    return null;
  }

  return (
    <>
    <View style={styles.wrap}>
      {options.map((choice, index) => {
        const count = choice.count || 0;
        const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
        const selected = userVote === choice.id;
        const color = theme.palette[index % theme.palette.length];
        return (
          <TouchableOpacity
            key={choice.id}
            activeOpacity={0.85}
            onPress={() => handleVote(choice.id)}
            disabled={busyId === choice.id}
            style={[
              styles.option,
              compact && styles.optionCompact,
              { borderColor: selected ? color : theme.border, backgroundColor: theme.surface }
            ]}
          >
            <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color, opacity: selected ? 0.22 : 0.12 }]} />
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.text }]} numberOfLines={1}>
                {selected ? '✓ ' : ''}{choice.label}
              </Text>
              {busyId === choice.id ? (
                <ActivityIndicator size="small" color={color} />
              ) : (
                <Text style={[styles.pct, { color: theme.subtext }]}>{pct.toFixed(0)}%</Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
      <Text style={[styles.total, { color: theme.subtext }]}>{totalVotes.toLocaleString()} votes</Text>
    </View>
    <PhoneVerifyModal
      visible={showVerify}
      onClose={() => setShowVerify(false)}
      onVerified={handleVerified}
    />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8
  },
  option: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative'
  },
  optionCompact: {
    borderRadius: 10
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    gap: 10
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1
  },
  pct: {
    fontSize: 12,
    fontWeight: '700'
  },
  total: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2
  }
});
