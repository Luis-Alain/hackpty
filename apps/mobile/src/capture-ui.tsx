import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const color = {
  ink: '#1b3035', brand: '#174e4b', action: '#18625f', canvas: '#f3f5f5',
  surface: '#edf2f1', line: '#dce4e3', muted: '#566d6b', white: '#ffffff',
  good: '#346649', goodBackground: '#eaf4ed', error: '#974d39', errorBackground: '#fbece8',
};

export function Action({ label, onPress, disabled = false, secondary = false, arrow = '→' }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; arrow?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [ui.action, secondary && ui.secondaryAction, disabled && ui.disabled, pressed && !disabled && ui.pressed]}>
    <Text style={[ui.actionText, secondary && ui.secondaryActionText]}>{label}</Text>
    {arrow ? <Text accessible={false} style={[ui.actionArrow, secondary && ui.secondaryActionText]}>{arrow}</Text> : null}
  </Pressable>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={ui.eyebrow}>{children}</Text>;
}

export function Header() {
  return <View style={ui.header}>
    <View style={ui.wordmarkRow}><Text accessibilityRole="header" style={ui.wordmark}>PsyRec</Text><Text style={ui.descriptor}>QVAC PSY</Text></View>
    <View style={ui.privacyBadge}><Text style={ui.privacyText}>PRIVATE</Text></View>
  </View>;
}

export function Disclosure({ title, expanded, onToggle, children }: {
  title: string; expanded: boolean; onToggle: () => void; children: ReactNode;
}) {
  return <View style={ui.disclosure}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded }}
      onPress={onToggle} style={({ pressed }) => [ui.disclosureButton, pressed && ui.pressed]}>
      <Text style={ui.disclosureTitle}>{title}</Text><Text accessible={false} style={ui.disclosureSymbol}>{expanded ? '−' : '+'}</Text>
    </Pressable>
    {expanded && <View style={ui.disclosureContent}>{children}</View>}
  </View>;
}

export type NoticeValue = { tone: 'info' | 'error' | 'success'; title: string; body: string };
export function Notice({ value }: { value: NoticeValue | null }) {
  if (!value) return null;
  const error = value.tone === 'error';
  return <View accessibilityLiveRegion="polite" style={[ui.notice, error && ui.errorNotice, value.tone === 'success' && ui.successNotice]}>
    <Text style={[ui.noticeTitle, error && ui.errorText]}>{value.title}</Text>
    <Text style={[ui.body, error && ui.errorText]}>{value.body}</Text>
  </View>;
}

export function SetupStep({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return <View style={ui.setupStep}><Text style={ui.stepNumber}>{number}</Text><View style={ui.stepCopy}>
    <Text style={ui.stepTitle}>{title}</Text><Text style={ui.body}>{children}</Text>
  </View></View>;
}

export const ui = StyleSheet.create({
  header: { backgroundColor: color.white, borderBottomWidth: 1, borderBottomColor: color.line, paddingHorizontal: 20, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  wordmarkRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 9 },
  wordmark: { color: color.brand, fontSize: 29, fontWeight: '700', letterSpacing: -1 },
  descriptor: { color: color.muted, fontSize: 10, letterSpacing: 1.7, fontWeight: '700' },
  privacyBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: color.line },
  privacyText: { color: color.brand, fontSize: 10, letterSpacing: 1, fontWeight: '600' },
  eyebrow: { color: color.brand, fontSize: 11, lineHeight: 18, letterSpacing: 1.6, fontWeight: '700' },
  title: { color: color.ink, fontSize: 32, lineHeight: 39, fontWeight: '600', letterSpacing: -0.7, marginTop: 12, marginBottom: 14 },
  largeTitle: { fontSize: 37, lineHeight: 43, letterSpacing: -1 },
  body: { color: color.muted, fontSize: 16, lineHeight: 25, flexShrink: 1 },
  heading: { color: color.ink, fontSize: 22, lineHeight: 29, fontWeight: '600' },
  hint: { color: color.muted, fontSize: 14, lineHeight: 22 },
  small: { color: color.muted, fontSize: 12, lineHeight: 19 },
  panel: { backgroundColor: color.white, borderWidth: 1, borderColor: color.line, borderRadius: 11, padding: 20, gap: 12 },
  action: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: color.action, borderRadius: 8, backgroundColor: color.action, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  actionText: { flex: 1, color: color.white, fontWeight: '600', fontSize: 16, lineHeight: 24 },
  actionArrow: { color: color.white, fontSize: 23, lineHeight: 28 },
  secondaryAction: { backgroundColor: color.white, borderColor: '#cedbda' },
  secondaryActionText: { color: color.action },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.72 },
  disclosure: { borderTopWidth: 1, borderTopColor: color.line, marginTop: 8 },
  disclosureButton: { minHeight: 52, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  disclosureTitle: { color: color.muted, fontSize: 16, lineHeight: 24, flex: 1 },
  disclosureSymbol: { color: color.brand, fontSize: 24 },
  disclosureContent: { paddingBottom: 12, gap: 14 },
  notice: { backgroundColor: color.surface, borderRadius: 8, padding: 16, gap: 6 },
  errorNotice: { backgroundColor: color.errorBackground }, successNotice: { backgroundColor: color.goodBackground },
  noticeTitle: { fontSize: 16, lineHeight: 24, color: color.brand, fontWeight: '600' },
  errorText: { color: color.error },
  setupStep: { borderTopWidth: 1, borderTopColor: color.line, paddingVertical: 17, flexDirection: 'row', gap: 14 },
  stepNumber: { color: color.brand, fontSize: 12, lineHeight: 25, fontWeight: '700' },
  stepCopy: { flex: 1, gap: 5 }, stepTitle: { color: color.ink, fontSize: 16, lineHeight: 24, fontWeight: '600' },
});
