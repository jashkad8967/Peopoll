import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { auth } from '../firebase/firebaseApp';
import { onAuthStateChanged } from 'firebase/auth';
import { useTheme } from '../theme/ThemeContext';
import PollCard from '../components/PollCard';
import PollModal from '../components/PollModal';
import {
  subscribeGroup,
  subscribeGroupMembers,
  subscribeMyMembership,
  subscribeGroupChat,
  subscribeGroupPolls,
  followGroup,
  leaveGroup,
  sendGroupChatMessage,
  requestCommentAccess,
  cancelCommentRequest,
  approveCommentAccess,
  denyCommentAccess,
  canComment,
  applyMemberAction,
  memberActions,
  isManager,
  ROLE_LABEL,
  ROLE_RANK
} from '../utils/groups';

function timeAgo(value) {
  const date = value?.toDate ? value.toDate() : null;
  if (!date) return '';
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function avatarColor(name, palette) {
  const text = String(name || '?');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export default function GroupDetailScreen({ route, navigation }) {
  const { theme } = useTheme();
  const groupId = route?.params?.groupId;
  const [me, setMe] = useState(auth.currentUser?.uid || null);
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [membership, setMembership] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [groupPolls, setGroupPolls] = useState([]);
  const [activePoll, setActivePoll] = useState(null);
  const [tab, setTab] = useState('chat');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [expandedMember, setExpandedMember] = useState(null);

  useEffect(() => onAuthStateChanged(auth, (u) => setMe(u?.uid || null)), []);
  useEffect(() => subscribeGroup(groupId, setGroup), [groupId]);
  useEffect(() => subscribeGroupMembers(groupId, setMembers), [groupId]);
  useEffect(() => subscribeGroupChat(groupId, setChatMessages), [groupId]);
  useEffect(() => subscribeGroupPolls(groupId, setGroupPolls), [groupId]);
  useEffect(() => subscribeMyMembership(groupId, me, setMembership), [groupId, me]);

  const myRole = membership?.role || 'none';
  const manager = isManager(myRole);
  const blocked = !!membership?.blocked;
  const isMember = !!membership && !blocked;
  const mayComment = canComment(membership);
  const requestedComment = !!membership?.commentRequest;

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => (ROLE_RANK[b.role] || 0) - (ROLE_RANK[a.role] || 0)),
    [members]
  );

  // Quick lookup of a member's role by uid so chat messages can show the
  // author's position (Owner / Co-owner / Admin / Member).
  const roleByUid = useMemo(() => {
    const map = {};
    members.forEach((m) => {
      map[m.uid] = m.role;
    });
    return map;
  }, [members]);

  const pendingRequests = useMemo(
    () => members.filter((m) => m.commentRequest && !m.canComment && !isManager(m.role) && !m.blocked),
    [members]
  );

  const handleFollow = async () => {
    setBusy(true);
    try {
      await followGroup(groupId);
    } catch (error) {
      Alert.alert('Unable to follow', error.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    setBusy(true);
    try {
      await leaveGroup(groupId, myRole);
    } catch (error) {
      Alert.alert('Unable to leave', error.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await sendGroupChatMessage(groupId, draft);
      setDraft('');
    } catch (error) {
      Alert.alert('Unable to send', error.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestComment = async () => {
    setBusy(true);
    try {
      await requestCommentAccess(groupId);
    } catch (error) {
      Alert.alert('Unable to request', error.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelRequest = async () => {
    setBusy(true);
    try {
      await cancelCommentRequest(groupId);
    } catch (error) {
      Alert.alert('Unable to cancel', error.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestDecision = (uid, approve) => {
    const run = async () => {
      try {
        if (approve) await approveCommentAccess(groupId, uid);
        else await denyCommentAccess(groupId, uid);
      } catch (error) {
        Alert.alert('Action failed', error.message || 'Please try again.');
      }
    };
    run();
  };

  const handleMemberAction = (member, action) => {
    const run = async () => {
      try {
        await applyMemberAction(groupId, member.uid, action);
        setExpandedMember(null);
      } catch (error) {
        Alert.alert('Action failed', error.message || 'Please try again.');
      }
    };
    run();
  };

  if (!group) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const renderHeader = () => (
    <View style={[styles.headerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.headerTop}>
        <View style={[styles.avatar, { backgroundColor: avatarColor(group.name, theme.palette) }]}>
          <Text style={styles.avatarText}>{(group.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.groupName, { color: theme.text }]}>{group.name}</Text>
          {group.topic ? <Text style={[styles.groupTopic, { color: theme.accent }]}>{group.topic}</Text> : null}
        </View>
      </View>
      {group.description ? <Text style={[styles.groupDesc, { color: theme.subtext }]}>{group.description}</Text> : null}
      <Text style={[styles.groupMeta, { color: theme.subtext }]}>
        {(group.memberCount || members.length || 0).toLocaleString()} members · Owner {group.ownerName || ''}
        {myRole !== 'none' ? ` · You: ${ROLE_LABEL[myRole] || 'Member'}` : ''}
      </Text>

      {blocked ? (
        <View style={[styles.blockedBanner, { backgroundColor: theme.surfaceMuted }]}>
          <Text style={[styles.blockedText, { color: theme.danger }]}>You have been blocked from this group.</Text>
        </View>
      ) : !isMember ? (
        <TouchableOpacity style={[styles.followBtn, { backgroundColor: theme.accent }]} onPress={handleFollow} disabled={busy}>
          <Text style={styles.followBtnText}>Follow group</Text>
        </TouchableOpacity>
      ) : myRole !== 'owner' ? (
        <TouchableOpacity
          style={[styles.leaveBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={handleLeave}
          disabled={busy}
        >
          <Text style={[styles.leaveBtnText, { color: theme.text }]}>Leave group</Text>
        </TouchableOpacity>
      ) : null}

      {isMember ? (
        <TouchableOpacity
          style={[styles.createPollBtn, { backgroundColor: theme.accent }]}
          onPress={() => navigation.navigate('CreatePoll', { groupId, groupName: group.name })}
        >
          <Text style={styles.createPollBtnText}>+ Create poll in this group</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabRow}>
      {['chat', 'polls', ...(manager ? ['requests'] : []), 'members'].map((key) => {
        const active = tab === key;
        const label =
          key === 'chat'
            ? 'Chat'
            : key === 'polls'
            ? `Polls (${groupPolls.length})`
            : key === 'requests'
            ? `Requests (${pendingRequests.length})`
            : 'Members';
        return (
          <TouchableOpacity
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tab, { borderBottomColor: active ? theme.accent : 'transparent' }]}
          >
            <Text style={[styles.tabText, { color: active ? theme.accent : theme.subtext }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderComposer = () => {
    if (!isMember) {
      return (
        <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.composerHint, { color: theme.subtext, marginBottom: 10 }]}>
            Follow this group to join the conversation.
          </Text>
          <TouchableOpacity
            style={[styles.postBtn, { backgroundColor: theme.accent, alignSelf: 'flex-start' }]}
            onPress={handleFollow}
            disabled={busy}
          >
            <Text style={styles.postBtnText}>Follow group</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!mayComment) {
      return (
        <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.composerHint, { color: theme.subtext, marginBottom: 10 }]}>
            {requestedComment
              ? 'Your request to comment is pending admin approval.'
              : 'You can read the chat. Request access to post messages.'}
          </Text>
          {requestedComment ? (
            <TouchableOpacity
              style={[styles.requestBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
              onPress={handleCancelRequest}
              disabled={busy}
            >
              <Text style={[styles.requestBtnText, { color: theme.text }]}>Cancel request</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.postBtn, { backgroundColor: theme.accent, alignSelf: 'flex-start' }]}
              onPress={handleRequestComment}
              disabled={busy}
            >
              <Text style={styles.postBtnText}>Request to comment</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TextInput
          placeholder="Message the group…"
          placeholderTextColor={theme.placeholder}
          value={draft}
          onChangeText={setDraft}
          style={[styles.composerInput, { color: theme.text }]}
          multiline
        />
        <View style={styles.composerFooter}>
          <Text style={[styles.composerHint, { color: theme.subtext }]}>Posts to the group chat</Text>
          <TouchableOpacity
            style={[styles.postBtn, { backgroundColor: theme.accent, opacity: draft.trim() ? 1 : 0.5 }]}
            onPress={handleSend}
            disabled={busy || !draft.trim()}
          >
            <Text style={styles.postBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderChatMessage = (msg) => {
    const mine = msg.authorId === me;
    const role = roleByUid[msg.authorId];
    const roleLabel = role ? ROLE_LABEL[role] || 'Member' : null;
    return (
      <View key={msg.id} style={[styles.chatRow, mine ? styles.chatRowMine : styles.chatRowTheirs]}>
        {!mine ? (
          <View style={[styles.chatAvatar, { backgroundColor: avatarColor(msg.authorName, theme.palette) }]}>
            <Text style={styles.chatAvatarText}>{(msg.authorName || '?').charAt(0).toUpperCase()}</Text>
          </View>
        ) : null}
        <View style={[styles.chatBubble, { backgroundColor: mine ? theme.accent : theme.surface, borderColor: theme.border }]}>
          <View style={styles.chatAuthorRow}>
            {!mine ? <Text style={[styles.chatAuthor, { color: theme.accent }]} numberOfLines={1}>{msg.authorName || 'Member'}</Text> : null}
            {roleLabel ? (
              <View
                style={[
                  styles.roleBadge,
                  {
                    backgroundColor: mine ? 'rgba(255,255,255,0.22)' : theme.surfaceMuted,
                    borderColor: mine ? 'rgba(255,255,255,0.4)' : theme.border
                  }
                ]}
              >
                <Text style={[styles.roleBadgeText, { color: mine ? '#fff' : theme.subtext }]}>{roleLabel}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.chatText, { color: mine ? '#fff' : theme.text }]}>{msg.text}</Text>
          <Text style={[styles.chatTime, { color: mine ? 'rgba(255,255,255,0.8)' : theme.subtext }]}>{timeAgo(msg.createdAt)}</Text>
        </View>
      </View>
    );
  };

  const renderRequest = (member) => (
    <View key={member.uid} style={[styles.postCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.postHead}>
        <View style={[styles.postAvatar, { backgroundColor: avatarColor(member.displayName, theme.palette) }]}>
          <Text style={styles.postAvatarText}>{(member.displayName || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={[styles.postAuthor, { color: theme.text }]} numberOfLines={1}>{member.displayName || 'Member'}</Text>
      </View>
      <Text style={[styles.postText, { color: theme.subtext }]}>Wants permission to comment in the chat.</Text>
      <View style={styles.approvalRow}>
        <TouchableOpacity style={[styles.approveBtn, { backgroundColor: theme.accent }]} onPress={() => handleRequestDecision(member.uid, true)}>
          <Text style={styles.approveBtnText}>Approve</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.rejectBtn, { borderColor: theme.border }]}
          onPress={() => handleRequestDecision(member.uid, false)}
        >
          <Text style={[styles.rejectBtnText, { color: theme.danger }]}>Deny</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderMember = (member) => {
    const actions = manager && member.uid !== me ? memberActions(myRole, member.role) : [];
    const expanded = expandedMember === member.uid;
    return (
      <View key={member.uid} style={[styles.memberCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity
          style={styles.memberRow}
          activeOpacity={actions.length ? 0.7 : 1}
          onPress={() => actions.length && setExpandedMember(expanded ? null : member.uid)}
        >
          <View style={[styles.postAvatar, { backgroundColor: avatarColor(member.displayName, theme.palette) }]}>
            <Text style={styles.postAvatarText}>{(member.displayName || '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.memberName, { color: theme.text }]} numberOfLines={1}>
              {member.displayName || 'Member'}{member.uid === me ? ' (you)' : ''}
            </Text>
            <Text style={[styles.memberRole, { color: theme.subtext }]}>
              {ROLE_LABEL[member.role] || 'Member'}{member.blocked ? ' · Blocked' : ''}
            </Text>
          </View>
          {actions.length ? <Text style={[styles.manageCaret, { color: theme.accent }]}>{expanded ? '▲' : 'Manage ▾'}</Text> : null}
        </TouchableOpacity>
        {expanded && actions.length ? (
          <View style={styles.actionWrap}>
            {actions.map((action) => (
              <TouchableOpacity
                key={action.key}
                style={[
                  styles.actionBtn,
                  { borderColor: action.destructive ? theme.danger : theme.border, backgroundColor: theme.surfaceMuted }
                ]}
                onPress={() => handleMemberAction(member, action)}
              >
                <Text style={[styles.actionText, { color: action.destructive ? theme.danger : theme.text }]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {renderHeader()}
      {renderTabs()}

      {tab === 'chat' && (
        <View>
          <Text style={[styles.pollsHeading, { color: theme.text }]}>Group chat</Text>
          <View style={styles.chatList}>
            {chatMessages.length === 0 ? (
              <Text style={[styles.empty, { color: theme.subtext }]}>No messages yet. Start the conversation.</Text>
            ) : (
              chatMessages.map(renderChatMessage)
            )}
          </View>
          {renderComposer()}
        </View>
      )}

      {tab === 'polls' && (
        <View>
          {groupPolls.length > 0 ? (
            <View style={{ marginBottom: 16 }}>
              <Text style={[styles.pollsHeading, { color: theme.text }]}>Polls in this group</Text>
              {groupPolls.map((poll) => (
                <PollCard key={poll.id} poll={poll} onPress={() => setActivePoll(poll)} />
              ))}
            </View>
          ) : (
            <Text style={[styles.empty, { color: theme.subtext }]}>No polls in this group yet.</Text>
          )}
        </View>
      )}

      {tab === 'requests' && manager && (
        <View>
          {pendingRequests.length === 0 ? (
            <Text style={[styles.empty, { color: theme.subtext }]}>No comment requests right now.</Text>
          ) : (
            pendingRequests.map(renderRequest)
          )}
        </View>
      )}

      {tab === 'members' && (
        <View>
          {sortedMembers.map(renderMember)}
        </View>
      )}

      <PollModal pollId={activePoll?.id} initialPoll={activePoll} visible={!!activePoll} onClose={() => setActivePoll(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  container: {
    padding: 16,
    paddingBottom: 30,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center'
  },
  headerCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800'
  },
  groupName: {
    fontSize: 20,
    fontWeight: '900'
  },
  groupTopic: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2
  },
  groupDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12
  },
  groupMeta: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10
  },
  blockedBanner: {
    borderRadius: 12,
    padding: 12,
    marginTop: 14
  },
  blockedText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center'
  },
  followBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14
  },
  followBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800'
  },
  leaveBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14
  },
  leaveBtnText: {
    fontSize: 15,
    fontWeight: '700'
  },
  createPollBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10
  },
  createPollBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800'
  },
  tabRow: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 14,
    paddingHorizontal: 4
  },
  tab: {
    paddingBottom: 8,
    borderBottomWidth: 2
  },
  tabText: {
    fontSize: 14,
    fontWeight: '800'
  },
  composer: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14
  },
  composerInput: {
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: 'top'
  },
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10
  },
  composerHint: {
    fontSize: 12,
    fontWeight: '600'
  },
  postBtn: {
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 20
  },
  postBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800'
  },
  requestBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 20,
    alignSelf: 'flex-start'
  },
  requestBtnText: {
    fontSize: 14,
    fontWeight: '700'
  },
  chatList: {
    marginBottom: 14
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 10,
    maxWidth: '88%'
  },
  chatRowMine: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse'
  },
  chatRowTheirs: {
    alignSelf: 'flex-start'
  },
  chatAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  chatAvatarText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800'
  },
  chatBubble: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexShrink: 1
  },
  chatAuthor: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2
  },
  chatAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 2
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  chatText: {
    fontSize: 14,
    lineHeight: 19
  },
  chatTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end'
  },
  postCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12
  },
  postHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10
  },
  postAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  postAvatarText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800'
  },
  postAuthor: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800'
  },
  postTime: {
    fontSize: 12,
    fontWeight: '600'
  },
  postText: {
    fontSize: 15,
    lineHeight: 21
  },
  pendingTag: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8
  },
  approvalRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12
  },
  approveBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  approveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800'
  },
  rejectBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  rejectBtnText: {
    fontSize: 14,
    fontWeight: '800'
  },
  memberCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700'
  },
  memberRole: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2
  },
  manageCaret: {
    fontSize: 13,
    fontWeight: '800'
  },
  actionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700'
  },
  empty: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24
  },
  pollsHeading: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
    marginTop: 4
  }
});
