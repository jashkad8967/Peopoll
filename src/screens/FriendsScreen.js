import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator
} from 'react-native';
import { auth } from '../firebase/firebaseApp';
import { onAuthStateChanged } from 'firebase/auth';
import { useTheme } from '../theme/ThemeContext';
import { ensureSignedIn } from '../utils/account';
import { subscribeFriends, subscribeUsersByIds } from '../utils/social';
import { ensureChat, sendMessage, subscribeMessages, subscribeMyChats } from '../utils/chat';

function avatarColor(name, palette) {
  const text = String(name || '?');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function Avatar({ name, palette, size = 44 }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(name, palette) }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{String(name || '?').charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export default function FriendsScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 880;

  const [uid, setUid] = useState(auth.currentUser?.uid || null);
  const [usersMap, setUsersMap] = useState({});
  const [friends, setFriends] = useState([]);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(route?.params?.chatId || null);
  const [activePeer, setActivePeer] = useState(
    route?.params?.peerId ? { uid: route.params.peerId, name: route.params.peerName } : null
  );
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    ensureSignedIn().catch(() => {});
    return onAuthStateChanged(auth, (u) => setUid(u?.uid || null));
  }, []);

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeFriends(uid, setFriends);
  }, [uid]);

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeMyChats(uid, setChats);
  }, [uid]);

  useEffect(() => {
    if (route?.params?.chatId) setActiveChatId(route.params.chatId);
    if (route?.params?.peerId) setActivePeer({ uid: route.params.peerId, name: route.params.peerName });
  }, [route?.params?.chatId, route?.params?.peerId, route?.params?.peerName]);

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return undefined;
    }
    return subscribeMessages(activeChatId, (list) => {
      setMessages(list);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd?.({ animated: true }));
    });
  }, [activeChatId]);

  const nameFor = (id) => usersMap[id]?.displayName || (id ? `User ${id.slice(0, 4)}` : 'User');

  // Merge friends + existing conversations into one contact list.
  const contacts = useMemo(() => {
    const seen = new Set();
    const list = [];
    chats.forEach((chat) => {
      const peer = (chat.members || []).find((m) => m !== uid);
      if (peer && !seen.has(peer)) {
        seen.add(peer);
        list.push({ uid: peer, chatId: chat.id, lastMessage: chat.lastMessage, lastSenderId: chat.lastSenderId });
      }
    });
    friends.forEach((peer) => {
      if (!seen.has(peer)) {
        seen.add(peer);
        list.push({ uid: peer, chatId: null, lastMessage: '' });
      }
    });
    return list;
  }, [chats, friends, uid]);

  // Only fetch the profiles we actually display (contacts + the open peer),
  // instead of downloading the whole users collection.
  const contactIds = useMemo(() => {
    const ids = contacts.map((c) => c.uid);
    if (activePeer?.uid) ids.push(activePeer.uid);
    return Array.from(new Set(ids.filter(Boolean)));
  }, [contacts, activePeer]);

  const contactIdsKey = contactIds.join(',');
  useEffect(() => subscribeUsersByIds(contactIds, setUsersMap), [contactIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const openChat = async (peerUid) => {
    setActivePeer({ uid: peerUid, name: nameFor(peerUid) });
    try {
      const chatId = await ensureChat(peerUid);
      setActiveChatId(chatId);
    } catch (error) {
      console.warn('Open chat failed', error?.message || error);
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    let chatId = activeChatId;
    setSending(true);
    try {
      if (!chatId && activePeer?.uid) {
        chatId = await ensureChat(activePeer.uid);
        setActiveChatId(chatId);
      }
      if (chatId) {
        await sendMessage(chatId, text);
        setDraft('');
      }
    } catch (error) {
      console.warn('Send failed', error?.message || error);
    } finally {
      setSending(false);
    }
  };

  const renderContact = (contact) => {
    const name = nameFor(contact.uid);
    const active = activePeer?.uid === contact.uid;
    const preview = contact.lastMessage
      ? `${contact.lastSenderId === uid ? 'You: ' : ''}${contact.lastMessage}`
      : 'Tap to start chatting';
    return (
      <TouchableOpacity
        key={contact.uid}
        style={[styles.contact, active && { backgroundColor: theme.accentSoft }]}
        onPress={() => openChat(contact.uid)}
      >
        <Avatar name={name} palette={theme.palette} />
        <View style={styles.contactBody}>
          <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.contactPreview, { color: theme.subtext }]} numberOfLines={1}>{preview}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const conversationPanel = (
    <View style={styles.conversation}>
      {!activePeer ? (
        <View style={styles.placeholder}>
          <Text style={[styles.placeholderTitle, { color: theme.text }]}>Your messages</Text>
          <Text style={[styles.placeholderText, { color: theme.subtext }]}>Pick a friend to start a conversation, or find new people to connect with.</Text>
          <TouchableOpacity style={[styles.findBtn, { backgroundColor: theme.accent }]} onPress={() => (uid ? navigation.navigate('UserList', { uid, type: 'following', title: 'Following' }) : navigation.navigate('Profile'))}>
            <Text style={styles.findBtnText}>Find people</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={[styles.convHeader, { borderBottomColor: theme.border }]}>
            <Avatar name={activePeer.name || nameFor(activePeer.uid)} palette={theme.palette} size={38} />
            <TouchableOpacity onPress={() => navigation.navigate('Profile', { uid: activePeer.uid })}>
              <Text style={[styles.convName, { color: theme.text }]}>{activePeer.name || nameFor(activePeer.uid)}</Text>
              <Text style={[styles.convSub, { color: theme.subtext }]}>View profile</Text>
            </TouchableOpacity>
          </View>

          <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={styles.messagesContent} showsVerticalScrollIndicator={false}>
            {messages.length === 0 ? (
              <Text style={[styles.emptyMsg, { color: theme.subtext }]}>No messages yet. Say hi! 👋</Text>
            ) : (
              messages.map((msg) => {
                const mine = msg.senderId === uid;
                return (
                  <View key={msg.id} style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                    <View style={[styles.bubble, { backgroundColor: mine ? theme.accent : theme.surfaceMuted }]}>
                      <Text style={[styles.bubbleText, { color: mine ? '#fff' : theme.text }]}>{msg.text}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={[styles.composer, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]}
              placeholder="Message…"
              placeholderTextColor={theme.placeholder}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity style={[styles.sendBtn, { backgroundColor: theme.accent, opacity: sending ? 0.6 : 1 }]} onPress={handleSend} disabled={sending}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendText}>Send</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );

  const contactsPanel = (
    <View style={[styles.sidebar, isWide && { borderRightWidth: 1, borderRightColor: theme.border }]}>
      <View style={styles.sidebarHeader}>
        <Text style={[styles.sidebarTitle, { color: theme.text }]}>Chats</Text>
        <TouchableOpacity onPress={() => (uid ? navigation.navigate('UserList', { uid, type: 'following', title: 'Following' }) : navigation.navigate('Profile'))}>
          <Text style={[styles.newChat, { color: theme.accent }]}>+ New</Text>
        </TouchableOpacity>
      </View>
      {contacts.length === 0 ? (
        <Text style={[styles.emptyContacts, { color: theme.subtext }]}>
          No friends yet. Follow people back and forth to become friends, then chat here.
        </Text>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>{contacts.map(renderContact)}</ScrollView>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={[styles.shell, { maxWidth: isWide ? 1000 : 640 }]}>
        {isWide ? (
          <View style={[styles.wide, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {contactsPanel}
            {conversationPanel}
          </View>
        ) : (
          <View style={[styles.narrow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {activePeer ? (
              <>
                <TouchableOpacity style={styles.backRow} onPress={() => { setActivePeer(null); setActiveChatId(null); }}>
                  <Text style={[styles.backText, { color: theme.accent }]}>← Chats</Text>
                </TouchableOpacity>
                {conversationPanel}
              </>
            ) : (
              contactsPanel
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    padding: 14
  },
  wide: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden'
  },
  narrow: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden'
  },
  sidebar: {
    width: 280,
    maxWidth: '40%',
    padding: 12
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4
  },
  sidebarTitle: {
    fontSize: 18,
    fontWeight: '800'
  },
  newChat: {
    fontSize: 14,
    fontWeight: '700'
  },
  emptyContacts: {
    fontSize: 13,
    lineHeight: 19,
    padding: 8
  },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12
  },
  contactBody: {
    flex: 1
  },
  contactName: {
    fontSize: 14,
    fontWeight: '700'
  },
  contactPreview: {
    fontSize: 12,
    marginTop: 2
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: '#fff',
    fontWeight: '800'
  },
  conversation: {
    flex: 1
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8
  },
  placeholderText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18
  },
  findBtn: {
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 12
  },
  findBtnText: {
    color: '#fff',
    fontWeight: '700'
  },
  convHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1
  },
  convName: {
    fontSize: 15,
    fontWeight: '700'
  },
  convSub: {
    fontSize: 12
  },
  messages: {
    flex: 1
  },
  messagesContent: {
    padding: 14,
    gap: 8
  },
  emptyMsg: {
    textAlign: 'center',
    marginTop: 30,
    fontSize: 14
  },
  bubbleRow: {
    flexDirection: 'row'
  },
  bubbleRowMine: {
    justifyContent: 'flex-end'
  },
  bubbleRowTheirs: {
    justifyContent: 'flex-start'
  },
  bubble: {
    maxWidth: '78%',
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 16
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 19
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderTopWidth: 1
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14
  },
  sendBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12
  },
  sendText: {
    color: '#fff',
    fontWeight: '700'
  },
  backRow: {
    padding: 12
  },
  backText: {
    fontSize: 15,
    fontWeight: '700'
  }
});
