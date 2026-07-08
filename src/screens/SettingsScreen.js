import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView, Alert, Platform, TextInput } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { auth } from '../firebase/firebaseApp';
import { GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { displayNameFor, isPhoneVerified } from '../utils/account';
import {
  subscribeUserProfile,
  updateUserBio,
  updateUserPreferences,
  upsertUserProfile,
  updateUserLocation,
  submitVerificationRequest,
  subscribeVerificationRequest,
  verifiedTypeLabel,
  VERIFIED_TYPES
} from '../utils/social';
import { COUNTRIES } from '../utils/locations';
import ContactForm from '../components/ContactForm';
import PhoneVerifyModal from '../components/PhoneVerifyModal';
import VerifiedBadge from '../components/VerifiedBadge';

const DEFAULT_PREFS = { notifications: true, trendingDigest: true, compactCards: false, autoplayTrends: true };

export default function SettingsScreen({ navigation }) {
  const { theme, themeName, toggleTheme, setThemeName } = useTheme();
  const [user, setUser] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [profile, setProfile] = useState(null);
  const [bio, setBio] = useState('');
  const [bioSaving, setBioSaving] = useState(false);

  // Location (nationality + state/province).
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [showCountryList, setShowCountryList] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);

  // Phone verification.
  const [showVerify, setShowVerify] = useState(false);
  const [showChangePhone, setShowChangePhone] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(isPhoneVerified(auth.currentUser));

  // Verification (verified badge) request.
  const [verifyRequest, setVerifyRequest] = useState(null);
  const [verifyType, setVerifyType] = useState('business');
  const [legalName, setLegalName] = useState('');
  const [verifyDetails, setVerifyDetails] = useState('');
  const [verifyLinks, setVerifyLinks] = useState('');
  const [verifySubmitting, setVerifySubmitting] = useState(false);

  // Preference toggles, persisted to the user's profile document.
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const setPref = (key) => {
    setPrefs((current) => {
      const next = { ...current, [key]: !current[key] };
      updateUserPreferences(next).catch((error) => console.error('Failed to save preferences', error));
      return next;
    });
  };

  // Settings is organised as a hub: a list of sections, each opening as its own
  // page. `activeSection` is null on the hub and the section id when one is open.
  const [activeSection, setActiveSection] = useState(null);
  const SECTIONS = [
    { id: 'profile', title: 'Profile', subtitle: 'Name, bio, and your polls' },
    { id: 'location', title: 'Location', subtitle: 'Nationality and region' },
    { id: 'voting', title: 'Voting verification', subtitle: 'Verify or change your phone number' },
    { id: 'verified', title: 'Verified account', subtitle: 'Request a verified badge' },
    { id: 'preferences', title: 'Preferences', subtitle: 'Theme, notifications, and display' },
    { id: 'account', title: 'Account', subtitle: 'Sign in or out' },
    { id: 'support', title: 'Help & support', subtitle: 'FAQs, policies, and contact' },
    { id: 'about', title: 'About', subtitle: 'App info' }
  ];

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setPhoneVerified(isPhoneVerified(u));
  }), []);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    getRedirectResult(auth).catch((error) => console.error('Settings redirect sign-in resolution failed', error));
    return undefined;
  }, []);

  const uid = user?.uid || null;

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      return undefined;
    }
    return subscribeUserProfile(uid, (p) => {
      setProfile(p);
      setBio(p?.bio || '');
      setPrefs({ ...DEFAULT_PREFS, ...(p?.preferences || {}) });
      setCountry(p?.country || '');
      setRegion(p?.region || '');
      if (p?.verificationType) setVerifyType(p.verificationType);
      // Apply the user's saved theme so it follows them across devices.
      const savedTheme = p?.preferences?.theme;
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setThemeName(savedTheme);
      }
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setVerifyRequest(null);
      return undefined;
    }
    return subscribeVerificationRequest(uid, setVerifyRequest);
  }, [uid]);

  // Toggles the theme and persists the choice onto the user's profile so it
  // syncs across devices (ThemeContext also stores it locally for reloads).
  const handleToggleTheme = () => {
    const nextTheme = themeName === 'light' ? 'dark' : 'light';
    toggleTheme();
    updateUserPreferences({ ...prefs, theme: nextTheme }).catch((error) =>
      console.error('Failed to save theme preference', error)
    );
  };

  const showAuthError = (error) => {
    const code = error?.code || '';
    if (code.includes('auth/unauthorized-domain')) {
      Alert.alert('Authentication blocked', 'This domain is not authorized in Firebase Auth. Add localhost (and your deployed domain) in Firebase Console -> Authentication -> Settings -> Authorized domains.');
      return;
    }
    if (code.includes('auth/popup-blocked') || code.includes('auth/popup-closed-by-user')) {
      Alert.alert('Sign-in canceled', 'The sign-in popup was blocked or closed. Please retry and allow popups.');
      return;
    }
    Alert.alert('Authentication error', error?.message || 'Please try again.');
  };

  const handleAccountAction = async () => {
    if (authBusy) return;
    try {
      setAuthBusy(true);
      if (user) {
        await signOut(auth);
        return;
      }
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      if (Platform.OS !== 'web') {
        await signInWithRedirect(auth, provider);
        return;
      }
      try {
        await signInWithPopup(auth, provider);
      } catch (popupError) {
        const popupCode = popupError?.code || '';
        if (popupCode.includes('auth/popup-blocked') || popupCode.includes('auth/popup-closed-by-user') || popupCode.includes('auth/operation-not-supported-in-this-environment')) {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupError;
      }
    } catch (error) {
      console.error('Settings auth action failed', error);
      showAuthError(error);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSaveBio = async () => {
    setBioSaving(true);
    try {
      if (user) await upsertUserProfile(user);
      await updateUserBio(bio);
      Alert.alert('Saved', 'Your bio has been updated.');
    } catch (error) {
      Alert.alert('Unable to save', error?.message || 'Please try again.');
    } finally {
      setBioSaving(false);
    }
  };

  const handleSaveLocation = async () => {
    setLocationSaving(true);
    try {
      if (user) await upsertUserProfile(user);
      await updateUserLocation({ country, region });
      setShowCountryList(false);
      Alert.alert('Saved', 'Your location has been updated.');
    } catch (error) {
      Alert.alert('Unable to save', error?.message || 'Please try again.');
    } finally {
      setLocationSaving(false);
    }
  };

  const handleSubmitVerification = async () => {
    setVerifySubmitting(true);
    try {
      if (user) await upsertUserProfile(user);
      await submitVerificationRequest({
        type: verifyType,
        legalName,
        details: verifyDetails,
        links: verifyLinks
      });
      Alert.alert('Request submitted', 'Your verification request is now pending review.');
    } catch (error) {
      Alert.alert('Unable to submit', error?.message || 'Please try again.');
    } finally {
      setVerifySubmitting(false);
    }
  };

  const filteredCountries = COUNTRIES.filter((c) =>
    c.toLowerCase().includes(countryQuery.trim().toLowerCase())
  ).slice(0, 8);

  const name = profile?.displayName || displayNameFor(user);

  const activeMeta = SECTIONS.find((s) => s.id === activeSection);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {activeSection ? (
        <TouchableOpacity style={styles.backRow} onPress={() => setActiveSection(null)}>
          <Text style={[styles.backText, { color: theme.accent }]}>← Settings</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={[styles.title, { color: theme.text }]}>{activeMeta ? activeMeta.title : 'Settings'}</Text>
      <Text style={[styles.description, { color: theme.subtext }]}>
        {activeMeta ? activeMeta.subtitle : "Manage your profile, review everything you've interacted with, and tune the app to your taste."}
      </Text>

      {!activeSection ? (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, padding: 6 }]}>
          {SECTIONS.map((section, index) => (
            <TouchableOpacity
              key={section.id}
              style={[styles.hubRow, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}
              onPress={() => setActiveSection(section.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.hubRowTitle, { color: theme.text }]}>{section.title}</Text>
                <Text style={[styles.hubRowSubtitle, { color: theme.subtext }]}>{section.subtitle}</Text>
              </View>
              <Text style={[styles.hubChevron, { color: theme.subtext }]}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Profile */}
      {activeSection === 'profile' ? (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Profile</Text>
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
            <Text style={styles.avatarText}>{(name || '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.accountText, { color: theme.text }]}>{name}</Text>
            <Text style={[styles.accountMeta, { color: theme.subtext }]}>{user?.email || (user?.isAnonymous ? 'Guest account' : 'Not signed in')}</Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.secondaryButton, { borderColor: theme.border }]} onPress={() => navigation.navigate('Profile')}>
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>View my profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryButton, { borderColor: theme.border }]} onPress={() => navigation.navigate('CreatePoll', { fromSettings: true })}>
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Create a poll</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.bioInput, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]}
          placeholder="Add a short bio…"
          placeholderTextColor={theme.placeholder}
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={280}
        />
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.accent, opacity: bioSaving ? 0.6 : 1 }]} onPress={handleSaveBio} disabled={bioSaving}>
          <Text style={styles.primaryButtonText}>{bioSaving ? 'Saving…' : 'Save bio'}</Text>
        </TouchableOpacity>
      </View>
      ) : null}

      {/* Location */}
      {activeSection === 'location' ? (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Location</Text>
        <Text style={[styles.optionDescription, { color: theme.subtext, marginBottom: 12 }]}>
          Add your nationality and state/province so your votes can be seen in regional context.
        </Text>

        <Text style={[styles.fieldLabel, { color: theme.subtext }]}>Nationality (country)</Text>
        <TouchableOpacity
          style={[styles.selectInput, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}
          onPress={() => setShowCountryList((v) => !v)}
        >
          <Text style={{ color: country ? theme.text : theme.placeholder }}>{country || 'Select a country'}</Text>
        </TouchableOpacity>
        {showCountryList ? (
          <View style={[styles.countryPanel, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
              placeholder="Search countries…"
              placeholderTextColor={theme.placeholder}
              value={countryQuery}
              onChangeText={setCountryQuery}
              autoFocus
            />
            {filteredCountries.map((c) => (
              <TouchableOpacity
                key={c}
                style={styles.countryItem}
                onPress={() => {
                  setCountry(c);
                  setCountryQuery('');
                  setShowCountryList(false);
                }}
              >
                <Text style={{ color: theme.text }}>{c}</Text>
              </TouchableOpacity>
            ))}
            {filteredCountries.length === 0 ? (
              <Text style={{ color: theme.subtext, padding: 8 }}>No matches</Text>
            ) : null}
          </View>
        ) : null}

        <Text style={[styles.fieldLabel, { color: theme.subtext, marginTop: 12 }]}>State / Province</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]}
          placeholder="e.g. California, Ontario, Bavaria…"
          placeholderTextColor={theme.placeholder}
          value={region}
          onChangeText={setRegion}
          maxLength={80}
        />
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.accent, opacity: locationSaving ? 0.6 : 1 }]}
          onPress={handleSaveLocation}
          disabled={locationSaving}
        >
          <Text style={styles.primaryButtonText}>{locationSaving ? 'Saving…' : 'Save location'}</Text>
        </TouchableOpacity>
      </View>
      ) : null}

      {/* Phone verification (voting security) */}
      {activeSection === 'voting' ? (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Voting verification</Text>
        <Text style={[styles.optionDescription, { color: theme.subtext, marginBottom: 14 }]}>
          To keep polls fair, voting requires a one-time phone verification. One verified number counts as one
          voter, which stops a single person voting many times with extra accounts.
        </Text>
        {phoneVerified ? (
          <>
            <View style={[styles.statusPill, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
              <Text style={[styles.statusText, { color: theme.accent }]}>
                {'\u2713 Phone verified'}{user?.phoneNumber ? ` (${user.phoneNumber})` : ''} — you can vote.
              </Text>
            </View>
            <TouchableOpacity style={[styles.secondaryButton, { borderColor: theme.border, marginTop: 12 }]} onPress={() => setShowChangePhone(true)}>
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Change phone number</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.accent }]} onPress={() => setShowVerify(true)}>
            <Text style={styles.primaryButtonText}>Verify my phone</Text>
          </TouchableOpacity>
        )}
      </View>
      ) : null}

      {/* Verified account request */}
      {activeSection === 'verified' ? (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.verifyHeader}>
          <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>Verified account</Text>
          {profile?.verified ? <VerifiedBadge type={profile.verifiedType || profile.verificationType} size={18} /> : null}
        </View>
        <Text style={[styles.optionDescription, { color: theme.subtext, marginTop: 8, marginBottom: 14 }]}>
          For businesses, public figures, news outlets, municipalities, political and other official accounts.
          Submit a request and our team will review it.
        </Text>

        {profile?.verified ? (
          <View style={[styles.statusPill, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
            <Text style={[styles.statusText, { color: theme.accent }]}>
              ✓ Verified as {verifiedTypeLabel(profile.verifiedType || profile.verificationType)}
            </Text>
          </View>
        ) : (
          <>
            {verifyRequest?.status === 'pending' ? (
              <View style={[styles.statusPill, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, marginBottom: 14 }]}>
                <Text style={[styles.statusText, { color: theme.subtext }]}>Your request is pending review.</Text>
              </View>
            ) : null}

            <Text style={[styles.fieldLabel, { color: theme.subtext }]}>Account type</Text>
            <View style={styles.typeRow}>
              {VERIFIED_TYPES.map((item) => {
                const active = verifyType === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setVerifyType(item.id)}
                    style={[
                      styles.typeChip,
                      {
                        backgroundColor: active ? theme.accent : 'transparent',
                        borderColor: active ? theme.accent : theme.border
                      }
                    ]}
                  >
                    <Text style={[styles.typeChipText, { color: active ? '#fff' : theme.subtext }]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.subtext, marginTop: 12 }]}>Legal / official name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]}
              placeholder="Registered name of the person or organization"
              placeholderTextColor={theme.placeholder}
              value={legalName}
              onChangeText={setLegalName}
              maxLength={120}
            />

            <Text style={[styles.fieldLabel, { color: theme.subtext, marginTop: 12 }]}>Official links (website, socials)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]}
              placeholder="https://…"
              placeholderTextColor={theme.placeholder}
              value={verifyLinks}
              onChangeText={setVerifyLinks}
              maxLength={400}
            />

            <Text style={[styles.fieldLabel, { color: theme.subtext, marginTop: 12 }]}>Details</Text>
            <TextInput
              style={[styles.bioInput, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]}
              placeholder="Tell us who you are and why this account should be verified."
              placeholderTextColor={theme.placeholder}
              value={verifyDetails}
              onChangeText={setVerifyDetails}
              multiline
              maxLength={600}
            />

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.accent, opacity: verifySubmitting ? 0.6 : 1 }]}
              onPress={handleSubmitVerification}
              disabled={verifySubmitting}
            >
              <Text style={styles.primaryButtonText}>
                {verifySubmitting ? 'Submitting…' : verifyRequest ? 'Update request' : 'Request verification'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      ) : null}

      {/* Preferences */}
      {activeSection === 'preferences' ? (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Preferences</Text>

        <View style={styles.optionRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.optionLabel, { color: theme.text }]}>Dark mode</Text>
            <Text style={[styles.optionDescription, { color: theme.subtext }]}>Switch the interface to a modern dark palette.</Text>
          </View>
          <Switch trackColor={{ false: '#9ca3af', true: theme.accent }} thumbColor="#ffffff" value={themeName === 'dark'} onValueChange={handleToggleTheme} />
        </View>

        <View style={[styles.optionRow, styles.optionDivider, { borderTopColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.optionLabel, { color: theme.text }]}>Push notifications</Text>
            <Text style={[styles.optionDescription, { color: theme.subtext }]}>Get notified about replies, votes, and new followers.</Text>
          </View>
          <Switch trackColor={{ false: '#9ca3af', true: theme.accent }} thumbColor="#ffffff" value={prefs.notifications} onValueChange={() => setPref('notifications')} />
        </View>

        <View style={[styles.optionRow, styles.optionDivider, { borderTopColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.optionLabel, { color: theme.text }]}>Trending digest</Text>
            <Text style={[styles.optionDescription, { color: theme.subtext }]}>A daily roundup of the polls picking up momentum.</Text>
          </View>
          <Switch trackColor={{ false: '#9ca3af', true: theme.accent }} thumbColor="#ffffff" value={prefs.trendingDigest} onValueChange={() => setPref('trendingDigest')} />
        </View>

        <View style={[styles.optionRow, styles.optionDivider, { borderTopColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.optionLabel, { color: theme.text }]}>Compact poll cards</Text>
            <Text style={[styles.optionDescription, { color: theme.subtext }]}>Show more polls per screen with tighter spacing.</Text>
          </View>
          <Switch trackColor={{ false: '#9ca3af', true: theme.accent }} thumbColor="#ffffff" value={prefs.compactCards} onValueChange={() => setPref('compactCards')} />
        </View>

        <View style={[styles.optionRow, styles.optionDivider, { borderTopColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.optionLabel, { color: theme.text }]}>Autoplay trend charts</Text>
            <Text style={[styles.optionDescription, { color: theme.subtext }]}>Animate vote-share charts as new data arrives.</Text>
          </View>
          <Switch trackColor={{ false: '#9ca3af', true: theme.accent }} thumbColor="#ffffff" value={prefs.autoplayTrends} onValueChange={() => setPref('autoplayTrends')} />
        </View>
      </View>
      ) : null}

      {/* Account */}
      {activeSection === 'account' ? (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Account</Text>
        <Text style={[styles.accountText, { color: theme.text }]}>{user?.displayName || (user?.isAnonymous ? 'Guest' : 'Guest')}</Text>
        <Text style={[styles.accountMeta, { color: theme.subtext }]}>{user?.email || 'Not signed in'}</Text>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.accent }]} onPress={handleAccountAction}>
          <Text style={styles.primaryButtonText}>{authBusy ? 'Please wait...' : user ? 'Sign out' : 'Sign in with Google'}</Text>
        </TouchableOpacity>
      </View>
      ) : null}

      {/* Help & support */}
      {activeSection === 'support' ? (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Help & support</Text>
        <Text style={[styles.optionDescription, { color: theme.subtext, marginBottom: 14 }]}>Browse FAQs and policies, or send us a message directly below.</Text>
        <View style={styles.linkRow}>
          <TouchableOpacity style={[styles.linkChip, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]} onPress={() => navigation.navigate('Help')}>
            <Text style={[styles.linkChipText, { color: theme.text }]}>Help center</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.linkChip, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]} onPress={() => navigation.navigate('About')}>
            <Text style={[styles.linkChipText, { color: theme.text }]}>About</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.linkChip, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]} onPress={() => navigation.navigate('Policy')}>
            <Text style={[styles.linkChipText, { color: theme.text }]}>Privacy policy</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.contactWrap}>
          <ContactForm embedded />
        </View>
      </View>
      ) : null}

      {/* About */}
      {activeSection === 'about' ? (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>About</Text>
        <Text style={[styles.aboutText, { color: theme.subtext }]}>Peopoll helps communities discover popular opinion, compare trends, and connect with people through polls and conversation.</Text>
        <Text style={[styles.metaText, { color: theme.subtext }]}>App version 1.1.0</Text>
      </View>
      ) : null}

      <PhoneVerifyModal
        visible={showVerify}
        onClose={() => setShowVerify(false)}
        onVerified={() => setPhoneVerified(true)}
        reason="Verify your phone to enable voting. One verified number = one voter."
      />

      <PhoneVerifyModal
        visible={showChangePhone}
        mode="change"
        onClose={() => setShowChangePhone(false)}
        onVerified={() => setPhoneVerified(true)}
        reason="Enter a new phone number to verify. This replaces the number linked to your account."
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center'
  },
  backRow: {
    paddingVertical: 6,
    marginBottom: 4
  },
  backText: {
    fontSize: 15,
    fontWeight: '700'
  },
  hubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12
  },
  hubRowTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2
  },
  hubRowSubtitle: {
    fontSize: 13,
    fontWeight: '500'
  },
  hubChevron: {
    fontSize: 24,
    fontWeight: '700',
    marginLeft: 10
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 8,
    letterSpacing: -0.5
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 20
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    marginBottom: 18
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 14,
    letterSpacing: 0.3
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800'
  },
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 14
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: 14
  },
  bioInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 64,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 12
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 15
  },
  selectInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  countryPanel: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    marginTop: 8,
    gap: 4
  },
  countryItem: {
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700'
  },
  verifyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  typeChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600'
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8
  },
  summaryChip: {
    flexGrow: 1,
    minWidth: 70,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14
  },
  summaryIcon: {
    fontSize: 18
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4
  },
  summaryLabel: {
    fontSize: 11,
    marginTop: 2
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: 1
  },
  activityIcon: {
    fontSize: 16
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600'
  },
  activityDetail: {
    fontSize: 12,
    marginTop: 2
  },
  activityTime: {
    fontSize: 11
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20
  },
  quickVoteBlock: {
    marginBottom: 16
  },
  quickVoteTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16
  },
  linkChip: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1
  },
  linkChipText: {
    fontSize: 13,
    fontWeight: '700'
  },
  contactWrap: {
    borderTopWidth: 1,
    borderTopColor: 'transparent',
    marginTop: 2
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  optionDivider: {
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 14
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700'
  },
  optionDescription: {
    fontSize: 14,
    marginTop: 4
  },
  accountText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4
  },
  accountMeta: {
    fontSize: 14,
    marginBottom: 14
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15
  },
  aboutText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12
  },
  metaText: {
    fontSize: 13
  }
});
