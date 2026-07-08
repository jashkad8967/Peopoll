import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { startPhoneVerification, confirmPhoneCode, startPhoneChange, confirmPhoneChange } from '../utils/account';

// Two-step phone verification dialog: enter number → enter the SMS code.
// On success it calls onVerified so the caller can proceed (e.g. cast a vote).
// When `mode` is 'change' it re-verifies and swaps the account's number instead
// of linking a first number.
export default function PhoneVerifyModal({ visible, onClose, onVerified, reason, mode = 'verify' }) {
  const { theme } = useTheme();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setStep('phone');
      setPhone('');
      setCode('');
      setConfirmation(null);
      setError('');
      setBusy(false);
    }
  }, [visible]);

  const handleSend = async () => {
    setBusy(true);
    setError('');
    try {
      const handle = mode === 'change'
        ? await startPhoneChange(phone)
        : await startPhoneVerification(phone);
      setConfirmation(handle);
      setStep('code');
    } catch (err) {
      setError(err?.message || 'Could not send the code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      const user = mode === 'change'
        ? await confirmPhoneChange(confirmation, code)
        : await confirmPhoneCode(confirmation, code);
      onVerified?.(user);
      onClose?.();
    } catch (err) {
      setError(err?.message || 'That code did not match. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Verify your phone</Text>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>
            {reason || 'To keep polls fair, voting requires a one-time phone verification. One verified number = one vote.'}
          </Text>

          {step === 'phone' ? (
            <>
              <Text style={[styles.label, { color: theme.subtext }]}>Phone number (include country code)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]}
                placeholder="+1 415 555 2671"
                placeholderTextColor={theme.placeholder}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoFocus
              />
              {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: busy || !phone.trim() ? 0.6 : 1 }]}
                onPress={handleSend}
                disabled={busy || !phone.trim()}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send code</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: theme.subtext }]}>Enter the 6-digit code sent to {phone}</Text>
              <TextInput
                style={[styles.input, styles.codeInput, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]}
                placeholder="123456"
                placeholderTextColor={theme.placeholder}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
              {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: busy || code.length < 6 ? 0.6 : 1 }]}
                onPress={handleConfirm}
                disabled={busy || code.length < 6}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify & continue</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep('phone')} disabled={busy}>
                <Text style={[styles.linkText, { color: theme.accent }]}>Use a different number</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={onClose} disabled={busy} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: theme.subtext }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderRadius: 18,
    padding: 22
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16
  },
  codeInput: {
    letterSpacing: 6,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700'
  },
  error: {
    fontSize: 12,
    marginTop: 8
  },
  primaryBtn: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center'
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15
  },
  linkText: {
    textAlign: 'center',
    marginTop: 14,
    fontSize: 13,
    fontWeight: '600'
  },
  cancelBtn: {
    marginTop: 16,
    alignItems: 'center'
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600'
  }
});
